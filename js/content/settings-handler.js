/**
 * Settings Handler - Manages settings, messages, and keyboard shortcuts for content script
 */
class SettingsHandler {
    constructor(textHighlighter) {
        this.textHighlighter = textHighlighter;
    }

    async getSettings(useCache = true) {
        if (this.textHighlighter.contextInvalid) return { 
            enableHighlighting: false, 
            caseSensitive: false, 
            wholeWordsOnly: false, 
            wordLists: [], 
            enableKeyboardShortcuts: true, 
            websiteRule: 'all', 
            includeWebsites: [], 
            excludeWebsites: [] 
        };
        
        // Use cached settings if available and recent (within 1 second)
        const now = Date.now();
        if (useCache && this.textHighlighter.cachedSettings && (now - this.textHighlighter.settingsLastUpdated) < 1000) {
            return this.textHighlighter.cachedSettings;
        }
        
        return new Promise((resolve) => { // Only resolve, never reject
            try {
                // Check if chrome and chrome.storage are available
                if (!chrome || !chrome.storage || !chrome.storage.sync) {
                    this.textHighlighter.contextInvalid = true;
                    resolve({ 
                        enableHighlighting: false, 
                        caseSensitive: false, 
                        wholeWordsOnly: false, 
                        wordLists: [], 
                        enableKeyboardShortcuts: true, 
                        websiteRule: 'all', 
                        includeWebsites: [], 
                        excludeWebsites: [] 
                    });
                    return;
                }

                chrome.storage.sync.get({
                    enableHighlighting: true,
                    caseSensitive: false,
                    wholeWordsOnly: false,
                    wordLists: [],
                    enableKeyboardShortcuts: true,
                    websiteRule: 'all',
                    includeWebsites: [],
                    excludeWebsites: []
                }, (result) => {
                    if (chrome.runtime.lastError) {
                        if (this.textHighlighter.isContextInvalidError(chrome.runtime.lastError)) {
                            this.textHighlighter.contextInvalid = true;
                        }
                        // Always resolve with safe defaults, never reject
                        const defaultSettings = { 
                            enableHighlighting: false, 
                            caseSensitive: false, 
                            wholeWordsOnly: false, 
                            wordLists: [], 
                            enableKeyboardShortcuts: true, 
                            websiteRule: 'all', 
                            includeWebsites: [], 
                            excludeWebsites: [] 
                        };
                        resolve(defaultSettings);
                    } else {
                        const settings = result || { 
                            enableHighlighting: false, 
                            caseSensitive: false, 
                            wholeWordsOnly: false, 
                            wordLists: [], 
                            enableKeyboardShortcuts: true, 
                            websiteRule: 'all', 
                            includeWebsites: [], 
                            excludeWebsites: [] 
                        };
                        // Cache the settings
                        this.textHighlighter.cachedSettings = settings;
                        this.textHighlighter.settingsLastUpdated = Date.now();
                        resolve(settings);
                    }
                });
            } catch (error) {
                if (this.textHighlighter.isContextInvalidError(error)) {
                    this.textHighlighter.contextInvalid = true;
                }
                // Always resolve with safe defaults, never reject
                resolve({ 
                    enableHighlighting: false, 
                    caseSensitive: false, 
                    wholeWordsOnly: false, 
                    wordLists: [], 
                    enableKeyboardShortcuts: true, 
                    websiteRule: 'all', 
                    includeWebsites: [], 
                    excludeWebsites: [] 
                });
            }
        });
    }

    shouldHighlightOnCurrentSite(settings) {
        const currentDomain = this.getCurrentDomain();
        if (!currentDomain) return false;

        const websiteRule = settings.websiteRule || 'all';
        const includeWebsites = settings.includeWebsites || [];
        const excludeWebsites = settings.excludeWebsites || [];

        switch (websiteRule) {
            case 'include':
                return includeWebsites.some(domain => this.domainMatches(currentDomain, domain));
            case 'exclude':
                return !excludeWebsites.some(domain => this.domainMatches(currentDomain, domain));
            case 'all':
            default:
                return true;
        }
    }

    getCurrentDomain() {
        try {
            let domain = window.location.hostname.toLowerCase();
            // Remove www prefix
            domain = domain.replace(/^www\./, '');
            return domain;
        } catch (error) {
            return null;
        }
    }

    domainMatches(currentDomain, ruleDomain) {
        // Exact match
        if (currentDomain === ruleDomain) return true;
        
        // Subdomain match (e.g., sub.example.com matches example.com)
        if (currentDomain.endsWith('.' + ruleDomain)) return true;
        
        return false;
    }

    setupMessageListener() {
        if (this.textHighlighter.contextInvalid || this.textHighlighter.isDestroyed) return;
        
        try {
            // Check if chrome.runtime is available
            if (!chrome || !chrome.runtime || !chrome.runtime.onMessage) {
                return;
            }

            // Store reference for cleanup
            this.textHighlighter.messageListener = (message, sender, sendResponse) => {
                if (this.textHighlighter.contextInvalid) {
                    sendResponse({ success: false, error: 'Extension context invalidated' });
                    return false;
                }
                
                if (message.action === 'updateHighlighting') {
                    // Clear cached settings when updating and force fresh settings load
                    this.textHighlighter.cachedSettings = null;
                    this.textHighlighter.settingsLastUpdated = 0;
                    this.textHighlighter.clearHighlights();
                    this.textHighlighter.loadAndHighlight();
                    sendResponse({ success: true });
                    return false; // Synchronous response
                } else if (message.action === 'clearHighlights') {
                    this.textHighlighter.clearHighlights();
                    sendResponse({ success: true });
                    return true;
                } else if (message.action === 'getWordCounts') {
                    (async () => {
                        try {
                            if (this.textHighlighter.contextInvalid) {
                                sendResponse({ success: false, error: 'Extension context invalidated' });
                                return;
                            }
                            const settings = await this.getSettings();
                            const counts = await this.textHighlighter.getDOMManager().getWordCounts(message.words, settings);
                            sendResponse({ success: true, counts: counts });
                        } catch (error) {
                            if (this.textHighlighter.isContextInvalidError(error)) {
                                this.textHighlighter.contextInvalid = true;
                                sendResponse({ success: false, error: 'Extension context invalidated' });
                            } else {
                                sendResponse({ success: false, error: error.message });
                            }
                        }
                    })();
                    
                    return true; // Keep the message channel open for async response
                } else if (message.action === 'getPageWordCount') {
                    try {
                        const textContent = this.textHighlighter.getDOMManager().getPageTextContent();
                        const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;
                        sendResponse({ success: true, wordCount: wordCount });
                    } catch (error) {
                        sendResponse({ success: false, error: error.message });
                    }
                    return false; // Synchronous response
                } else if (message.action === 'getSettings') {
                    // Return current settings being used by content script
                    (async () => {
                        try {
                            const settings = await this.getSettings();
                            sendResponse({ 
                                success: true, 
                                settings: settings,
                                highlightedElementsCount: this.textHighlighter.highlightedElements.length,
                                contextInvalid: this.textHighlighter.contextInvalid,
                                isDestroyed: this.textHighlighter.isDestroyed
                            });
                        } catch (error) {
                            sendResponse({ success: false, error: error.message });
                        }
                    })();
                    return true; // Async response
                }
                
                return false; // For any other messages
            };
            
            chrome.runtime.onMessage.addListener(this.textHighlighter.messageListener);
        } catch (error) {
            if (this.textHighlighter.isContextInvalidError(error)) {
                this.textHighlighter.contextInvalid = true;
            }
        }
    }

    setupKeyboardShortcuts() {
        if (this.textHighlighter.contextInvalid || this.textHighlighter.isDestroyed) return;
        
        try {
            // Store reference for cleanup
            this.textHighlighter.keyboardListener = async (e) => {
                // Check if keyboard shortcuts are enabled
                const settings = await this.getSettings();
                if (!settings.enableKeyboardShortcuts) return;
                
                // Don't interfere with input fields, textareas, or contenteditable elements
                const target = e.target;
                if (target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.contentEditable === 'true' ||
                    target.isContentEditable ||
                    // Check if we're inside any form element
                    target.closest('input, textarea, [contenteditable="true"], [contenteditable=""], select') ||
                    // Additional protection for rich text editors and code editors
                    target.closest('.CodeMirror, .ace_editor, .monaco-editor, [role="textbox"]') ||
                    // Check for common editor class names
                    target.classList.contains('editor') ||
                    target.classList.contains('input') ||
                    target.classList.contains('text-area')
                )) {
                    return; // Don't process shortcuts in form fields
                }
                
                // Check for Ctrl+Shift combinations
                if (e.ctrlKey && e.shiftKey) {
                    switch (e.key.toLowerCase()) {
                        case 'h':
                            // Toggle highlighting
                            e.preventDefault();
                            await this.toggleHighlighting();
                            break;
                    }
                }
            };
            
            document.addEventListener('keydown', this.textHighlighter.keyboardListener);
        } catch (error) {
            // Silent error handling
        }
    }

    async toggleHighlighting() {
        try {
            const settings = await this.getSettings();
            const newState = !settings.enableHighlighting;
            
            // Update the setting
            await chrome.storage.sync.set({ enableHighlighting: newState });
            
            if (newState) {
                await this.textHighlighter.loadAndHighlight();
                this.showShortcutNotification('Highlighting enabled');
            } else {
                this.textHighlighter.clearHighlights();
                this.showShortcutNotification('Highlighting disabled');
            }
        } catch (error) {
            // Silent error handling
        }
    }

    showShortcutNotification(message) {
        // Create a temporary notification for keyboard shortcut feedback
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            pointer-events: none;
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 2 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsHandler;
} else if (typeof window !== 'undefined') {
    window.SettingsHandler = SettingsHandler;
}