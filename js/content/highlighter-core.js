/**
 * Highlighter Core - Main text highlighting functionality for content script
 */
class TextHighlighter {
    constructor() {
        this.highlightedElements = [];
        this.observer = null;
        this.contextInvalid = false;
        this.updateTimeout = null;
        this.autoSaveTimeout = null;
        this.messageListener = null;
        this.keyboardListener = null;
        this.isDestroyed = false;
        this.cachedSettings = null; // Cache settings to avoid repeated storage calls
        this.settingsLastUpdated = 0;
        
        // Initialize components
        this.domManager = new DOMManager(this);
        this.settingsHandler = new SettingsHandler(this);
        
        this.init();
    }
    
    // Cleanup method to prevent memory leaks
    destroy() {
        if (this.isDestroyed) return;
        
        this.isDestroyed = true;
        this.contextInvalid = true;
        
        // Clear all timeouts
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
        
        // Remove event listeners
        if (this.messageListener && chrome.runtime && chrome.runtime.onMessage) {
            try {
                chrome.runtime.onMessage.removeListener(this.messageListener);
            } catch (error) {
                // Context may already be invalid
            }
        }
        
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
        }
        
        // Disconnect observer
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        // Clear highlights
        this.clearHighlights();
    }

    async init() {
        // Check if Chrome APIs are available before doing anything
        if (!chrome || !chrome.storage || !chrome.runtime) {
            this.contextInvalid = true;
            return;
        }
        
        try {
            await this.loadAndHighlight();
            this.settingsHandler.setupMessageListener();
            this.setupMutationObserver();
            this.settingsHandler.setupKeyboardShortcuts();
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
                this.destroy(); // Clean up when context becomes invalid
                return;
            }
        }
        
        // Set up context invalidation detection - but don't be too aggressive
        if (chrome.runtime && chrome.runtime.onConnect) {
            try {
                // Monitor for context invalidation
                const port = chrome.runtime.connect();
                port.onDisconnect.addListener(() => {
                    // Check if this is actually a context invalidation
                    if (chrome.runtime.lastError && 
                        (chrome.runtime.lastError.message.includes('Extension context invalidated') ||
                         chrome.runtime.lastError.message.includes('context invalidated'))) {
                        this.destroy();
                    }
                });
            } catch (error) {
                // Only destroy if this is actually a context error
                if (this.isContextInvalidError(error)) {
                    this.destroy();
                }
            }
        }
    }

    async loadAndHighlight() {
        if (this.contextInvalid) {
            return;
        }
        
        try {
            const settings = await this.settingsHandler.getSettings();
            
            if (settings && settings.enableHighlighting && this.settingsHandler.shouldHighlightOnCurrentSite(settings)) {
                await this.highlightText();
            }
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
                return;
            }
        }
    }

    setupMutationObserver() {
        if (this.contextInvalid || this.isDestroyed) return;
        
        try {
            let mutationCount = 0;
            const maxMutationsPerSecond = 20; // Increased from 10 to be less restrictive
            let lastResetTime = Date.now();
            
            // Observe DOM changes to highlight new content
            this.observer = new MutationObserver((mutations) => {
                if (this.contextInvalid || this.isDestroyed) return;
                
                // Throttle mutations to prevent performance issues
                const now = Date.now();
                if (now - lastResetTime > 1000) {
                    mutationCount = 0;
                    lastResetTime = now;
                }
                
                mutationCount++;
                if (mutationCount > maxMutationsPerSecond) {
                    return;
                }
                
                let shouldUpdate = false;
                let significantChanges = 0;
                
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // Check if any added nodes contain significant text
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType === Node.TEXT_NODE) {
                                if (node.textContent.trim().length > 2) { // Reduced threshold from 3 to 2
                                    shouldUpdate = true;
                                    significantChanges++;
                                    break;
                                }
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                const textContent = node.textContent.trim();
                                if (textContent.length > 5) { // Reduced threshold from 10 to 5
                                    shouldUpdate = true;
                                    significantChanges++;
                                    break;
                                }
                            }
                        }
                    }
                });
                
                if (shouldUpdate && significantChanges > 0) {
                    // Reduced debounce for more responsive highlighting
                    clearTimeout(this.updateTimeout);
                    this.updateTimeout = setTimeout(() => {
                        if (!this.contextInvalid && !this.isDestroyed) {
                            this.loadAndHighlight();
                        }
                    }, 500); // Reduced from 1000ms back to 500ms
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch (error) {
            // Silent error handling
        }
    }

    async highlightText() {
        if (this.contextInvalid) {
            return;
        }
        
        try {
            const settings = await this.settingsHandler.getSettings();
            
            if (!settings || !settings.enableHighlighting || !settings.wordLists.length) {
                return;
            }

            // Get all enabled words from all enabled lists
            const wordsToHighlight = [];
            let totalWords = 0;
            let enabledLists = 0;
            
            settings.wordLists.forEach(list => {
                if (list.enabled !== false) { // Default to enabled if not specified
                    enabledLists++;
                    if (list.words && Array.isArray(list.words)) {
                        list.words.forEach(word => {
                            if (word.enabled !== false && word.text && word.text.trim()) { // Default to enabled
                                totalWords++;
                                wordsToHighlight.push({
                                    text: word.text.trim(),
                                    color: list.color, // Keep for backward compatibility
                                    styles: list.styles || {
                                        backgroundColor: list.color || '#ffd700',
                                        color: '#000000',
                                        fontWeight: 'normal',
                                        fontStyle: 'normal',
                                        textDecoration: 'none',
                                        borderWidth: 0,
                                        borderStyle: 'none',
                                        borderColor: '#000000',
                                        textTransform: 'none',
                                        paddingTop: 1,
                                        paddingRight: 2,
                                        paddingBottom: 1,
                                        paddingLeft: 2,
                                        borderRadius: 2
                                    }
                                });
                            }
                        });
                    }
                }
            });

            if (wordsToHighlight.length === 0) {
                return;
            }

            // Sort words by length (longest first) to avoid partial matches
            wordsToHighlight.sort((a, b) => b.text.length - a.text.length);

            this.domManager.highlightInElement(document.body, wordsToHighlight, settings);
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
            }
        }
    }

    clearHighlights() {
        this.highlightedElements.forEach(element => {
            if (element.parentNode) {
                // Replace highlighted span with original text
                const textNode = document.createTextNode(element.textContent);
                element.parentNode.replaceChild(textNode, element);
            }
        });
        this.highlightedElements = [];

        // Also remove any remaining highlight spans
        document.querySelectorAll('.highlighter-mark').forEach(span => {
            const textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        });
    }

    // Utility method for regex escaping
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    isContextInvalidError(error) {
        const errorMessage = error ? (error.message || error.toString()) : '';
        return errorMessage.includes('Extension context invalidated') || 
               errorMessage.includes('context invalidated') ||
               errorMessage === 'Extension context invalidated.';
    }

    // Getters for components
    getDOMManager() {
        return this.domManager;
    }

    getSettingsHandler() {
        return this.settingsHandler;
    }

    // Utility methods for HTML escaping and CSS sanitization
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        
        // More comprehensive HTML escaping
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
    
    sanitizeCssValue(value) {
        if (typeof value !== 'string') return 'initial';
        
        // Remove potentially dangerous CSS
        return value.replace(/[<>'"\\]/g, '').trim();
    }
    
    sanitizePixelValue(value) {
        const num = parseInt(value, 10);
        return (isNaN(num) || num < 0 || num > 100) ? 0 : num;
    }

    // Method to add highlighted elements (called by DOMManager)
    addHighlightedElement(element) {
        this.highlightedElements.push(element);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextHighlighter;
} else if (typeof window !== 'undefined') {
    window.TextHighlighter = TextHighlighter;
}