class TextHighlighter {
    constructor() {
        this.highlightedElements = [];
        this.observer = null;
        this.contextInvalid = false;
        this.init();
    }

    async init() {
        // Check if Chrome APIs are available before doing anything
        if (!chrome || !chrome.storage || !chrome.runtime) {
            this.contextInvalid = true;
            return;
        }

        try {
            await this.loadAndHighlight();
            this.setupMessageListener();
            this.setupMutationObserver();
            this.setupKeyboardShortcuts();
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
                return;
            }
            console.error('Error initializing TextHighlighter:', error);
        }
    }

    async loadAndHighlight() {
        if (this.contextInvalid) return;
        
        try {
            const settings = await this.getSettings();
            if (settings && settings.enableHighlighting && this.shouldHighlightOnCurrentSite(settings)) {
                await this.highlightText();
            }
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
                return;
            }
            console.error('Error in loadAndHighlight:', error);
        }
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
            console.error('Error getting current domain:', error);
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

    async getSettings() {
        if (this.contextInvalid) return { enableHighlighting: false, caseSensitive: false, wholeWordsOnly: false, wordLists: [], enableKeyboardShortcuts: true, websiteRule: 'all', includeWebsites: [], excludeWebsites: [] };
        
        return new Promise((resolve) => { // Only resolve, never reject
            try {
                // Check if chrome and chrome.storage are available
                if (!chrome || !chrome.storage || !chrome.storage.sync) {
                    this.contextInvalid = true;
                    resolve({ enableHighlighting: false, caseSensitive: false, wholeWordsOnly: false, wordLists: [], enableKeyboardShortcuts: true, websiteRule: 'all', includeWebsites: [], excludeWebsites: [] });
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
                        if (this.isContextInvalidError(chrome.runtime.lastError)) {
                            this.contextInvalid = true;
                        }
                        // Always resolve with safe defaults, never reject
                        resolve({ enableHighlighting: false, caseSensitive: false, wholeWordsOnly: false, wordLists: [], enableKeyboardShortcuts: true, websiteRule: 'all', includeWebsites: [], excludeWebsites: [] });
                    } else {
                        resolve(result || { enableHighlighting: false, caseSensitive: false, wholeWordsOnly: false, wordLists: [], enableKeyboardShortcuts: true, websiteRule: 'all', includeWebsites: [], excludeWebsites: [] });
                    }
                });
            } catch (error) {
                if (this.isContextInvalidError(error)) {
                    this.contextInvalid = true;
                }
                // Always resolve with safe defaults, never reject
                resolve({ enableHighlighting: false, caseSensitive: false, wholeWordsOnly: false, wordLists: [], enableKeyboardShortcuts: true, websiteRule: 'all', includeWebsites: [], excludeWebsites: [] });
            }
        });
    }

    isContextInvalidError(error) {
        const errorMessage = error ? (error.message || error.toString()) : '';
        return errorMessage.includes('Extension context invalidated') || 
               errorMessage.includes('context invalidated') ||
               errorMessage === 'Extension context invalidated.';
    }

    setupMessageListener() {
        if (this.contextInvalid) return;
        
        try {
            // Check if chrome.runtime is available
            if (!chrome || !chrome.runtime || !chrome.runtime.onMessage) {
                return;
            }

            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (this.contextInvalid) {
                    sendResponse({ success: false, error: 'Extension context invalidated' });
                    return false;
                }
                
                if (message.action === 'updateHighlighting') {
                    this.clearHighlights();
                    this.loadAndHighlight();
                    sendResponse({ success: true });
                    return false; // Synchronous response
                } else if (message.action === 'clearHighlights') {
                    this.clearHighlights();
                    sendResponse({ success: true });
                    return true;
                } else if (message.action === 'getWordCounts') {
                    (async () => {
                        try {
                            if (this.contextInvalid) {
                                sendResponse({ success: false, error: 'Extension context invalidated' });
                                return;
                            }
                            const settings = await this.getSettings();
                            const counts = await this.getWordCounts(message.words, settings);
                            sendResponse({ success: true, counts: counts });
                        } catch (error) {
                            console.error('Error getting word counts:', error);
                            if (this.isContextInvalidError(error)) {
                                this.contextInvalid = true;
                                sendResponse({ success: false, error: 'Extension context invalidated' });
                            } else {
                                sendResponse({ success: false, error: error.message });
                            }
                        }
                    })();
                    
                    return true; // Keep the message channel open for async response
                } else if (message.action === 'getPageWordCount') {
                    try {
                        const textContent = this.getPageTextContent();
                        const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;
                        sendResponse({ success: true, wordCount: wordCount });
                    } catch (error) {
                        console.error('Error getting page word count:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                    return false; // Synchronous response
                }
                
                return false; // For any other messages
            });
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
            } else {
                console.error('Error setting up message listener:', error);
            }
        }
    }

    async getWordCounts(wordsToCount, settings) {
        try {
            const counts = {};
            
            // Validate input
            if (!Array.isArray(wordsToCount) || wordsToCount.length === 0) {
                return counts;
            }
            
            // Initialize all words with 0 count
            wordsToCount.forEach(wordData => {
                if (wordData && wordData.text) {
                    counts[wordData.text] = 0;
                }
            });

            // Get all text content from the page
            const textContent = this.getPageTextContent();
            
            if (!textContent || textContent.trim().length === 0) {
                return counts;
            }
            
            // Count each word
            wordsToCount.forEach(wordData => {
                try {
                    if (!wordData || !wordData.text) {
                        return;
                    }
                    
                    const word = wordData.text.trim();
                    if (word.length === 0) {
                        return;
                    }

                    let flags = 'g';
                    if (!settings.caseSensitive) {
                        flags += 'i';
                    }

                    let pattern;
                    if (settings.wholeWordsOnly) {
                        pattern = new RegExp(`\\b${this.escapeRegex(word)}\\b`, flags);
                    } else {
                        pattern = new RegExp(this.escapeRegex(word), flags);
                    }

                    const matches = textContent.match(pattern);
                    const count = matches ? matches.length : 0;
                    counts[wordData.text] = count; // Use original text as key
                } catch (error) {
                    console.error(`Error counting word "${wordData.text}":`, error);
                    counts[wordData.text] = 0;
                }
            });

            return counts;
        } catch (error) {
            console.error('Error in getWordCounts:', error);
            // Return empty counts object in case of error
            const counts = {};
            if (Array.isArray(wordsToCount)) {
                wordsToCount.forEach(wordData => {
                    if (wordData && wordData.text) {
                        counts[wordData.text] = 0;
                    }
                });
            }
            return counts;
        }
    }

    getPageTextContent() {
        try {
            // Check if document.body exists
            if (!document.body) {
                return '';
            }

            // Use innerText which only returns visually rendered text
            // This automatically handles visibility, styling, and formatting
            const visibleText = document.body.innerText;
            
            return visibleText;
        } catch (error) {
            console.error('Error getting page text content:', error);
            return '';
        }
    }

    setupMutationObserver() {
        if (this.contextInvalid) return;
        
        try {
            // Observe DOM changes to highlight new content
            this.observer = new MutationObserver((mutations) => {
                if (this.contextInvalid) return;
                
                let shouldUpdate = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // Check if any added nodes contain text
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType === Node.TEXT_NODE || 
                                (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim())) {
                                shouldUpdate = true;
                                break;
                            }
                        }
                    }
                });
                
                if (shouldUpdate) {
                    // Debounce the highlighting to avoid too frequent updates
                    clearTimeout(this.updateTimeout);
                    this.updateTimeout = setTimeout(() => {
                        if (!this.contextInvalid) {
                            this.loadAndHighlight();
                        }
                    }, 500);
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch (error) {
            console.error('Error setting up mutation observer:', error);
        }
    }

    setupKeyboardShortcuts() {
        if (this.contextInvalid) return;
        
        try {
            document.addEventListener('keydown', async (e) => {
                // Check if keyboard shortcuts are enabled
                const settings = await this.getSettings();
                if (!settings.enableKeyboardShortcuts) return;
                
                // Check for Ctrl+Shift combinations
                if (e.ctrlKey && e.shiftKey) {
                    switch (e.key.toLowerCase()) {
                        case 'h':
                            // Toggle highlighting
                            e.preventDefault();
                            await this.toggleHighlighting();
                            break;
                        case 'c':
                            // Clear all highlights
                            e.preventDefault();
                            this.clearHighlights();
                            this.showShortcutNotification('All highlights cleared');
                            break;
                        case 'r':
                            // Refresh highlights
                            e.preventDefault();
                            this.clearHighlights();
                            await this.loadAndHighlight();
                            this.showShortcutNotification('Highlights refreshed');
                            break;
                    }
                }
            });
        } catch (error) {
            console.error('Error setting up keyboard shortcuts:', error);
        }
    }

    async toggleHighlighting() {
        try {
            const settings = await this.getSettings();
            const newState = !settings.enableHighlighting;
            
            // Update the setting
            await chrome.storage.sync.set({ enableHighlighting: newState });
            
            if (newState) {
                await this.loadAndHighlight();
                this.showShortcutNotification('Highlighting enabled');
            } else {
                this.clearHighlights();
                this.showShortcutNotification('Highlighting disabled');
            }
        } catch (error) {
            console.error('Error toggling highlighting:', error);
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

    async highlightText() {
        if (this.contextInvalid) return;
        
        try {
            const settings = await this.getSettings();
            
            if (!settings || !settings.enableHighlighting || !settings.wordLists.length) {
                return;
            }

            // Get all enabled words from all enabled lists
            const wordsToHighlight = [];
            settings.wordLists.forEach(list => {
                if (list.enabled) {
                    list.words.forEach(word => {
                        if (word.enabled) {
                            wordsToHighlight.push({
                                text: word.text,
                                color: list.color, // Keep for backward compatibility
                                styles: list.styles || {
                                    backgroundColor: list.color,
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
            });

            if (wordsToHighlight.length === 0) {
                return;
            }

            // Sort words by length (longest first) to avoid partial matches
            wordsToHighlight.sort((a, b) => b.text.length - a.text.length);

            this.highlightInElement(document.body, wordsToHighlight, settings);
        } catch (error) {
            if (this.isContextInvalidError(error)) {
                this.contextInvalid = true;
            } else {
                console.error('Error in highlightText:', error);
            }
        }
    }

    highlightInElement(element, wordsToHighlight, settings) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip script, style, and already highlighted elements
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    if (parent.classList.contains('highlighter-mark')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            this.highlightInTextNode(textNode, wordsToHighlight, settings);
        });
    }

    highlightInTextNode(textNode, wordsToHighlight, settings) {
        const originalText = textNode.textContent;
        let highlightedText = originalText;
        const highlights = [];

        // Find all matches for all words
        wordsToHighlight.forEach(wordData => {
            const word = wordData.text;
            const styles = wordData.styles;
            
            let flags = 'g';
            if (!settings.caseSensitive) {
                flags += 'i';
            }

            let pattern;
            if (settings.wholeWordsOnly) {
                // Use word boundaries for whole word matching
                pattern = new RegExp(`\\b${this.escapeRegex(word)}\\b`, flags);
            } else {
                pattern = new RegExp(this.escapeRegex(word), flags);
            }

            let match;
            while ((match = pattern.exec(originalText)) !== null) {
                highlights.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: match[0],
                    styles: styles
                });
                
                // Prevent infinite loop for zero-length matches
                if (match.index === pattern.lastIndex) {
                    pattern.lastIndex++;
                }
            }
        });

        if (highlights.length === 0) {
            return;
        }

        // Sort highlights by start position
        highlights.sort((a, b) => a.start - b.start);

        // Merge overlapping highlights (keep the first one)
        const mergedHighlights = [];
        highlights.forEach(highlight => {
            const lastMerged = mergedHighlights[mergedHighlights.length - 1];
            if (!lastMerged || highlight.start >= lastMerged.end) {
                mergedHighlights.push(highlight);
            }
        });

        // Create highlighted HTML
        let result = '';
        let lastIndex = 0;

        mergedHighlights.forEach(highlight => {
            // Add text before highlight
            result += this.escapeHtml(originalText.substring(lastIndex, highlight.start));
            
            // Add highlighted text with full styling
            const styles = highlight.styles;
            let cssStyle = `
                background: ${styles.backgroundColor};
                color: ${styles.color};
                font-weight: ${styles.fontWeight};
                font-style: ${styles.fontStyle};
                text-decoration: ${styles.textDecoration};
                text-transform: ${styles.textTransform};
                padding: ${styles.paddingTop}px ${styles.paddingRight}px ${styles.paddingBottom}px ${styles.paddingLeft}px;
                border-radius: ${styles.borderRadius}px;
            `;
            
            if (styles.borderWidth > 0) {
                cssStyle += `border: ${styles.borderWidth}px ${styles.borderStyle} ${styles.borderColor};`;
            }
            
            result += `<span class="highlighter-mark" style="${cssStyle}">${this.escapeHtml(highlight.text)}</span>`;
            
            lastIndex = highlight.end;
        });

        // Add remaining text
        result += this.escapeHtml(originalText.substring(lastIndex));

        // Replace the text node with highlighted content
        if (result !== this.escapeHtml(originalText)) {
            const wrapper = document.createElement('span');
            wrapper.innerHTML = result;
            textNode.parentNode.replaceChild(wrapper, textNode);
            this.highlightedElements.push(wrapper);
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

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the content script
function initializeTextHighlighter() {
    // Check if Chrome APIs are available before creating TextHighlighter
    if (!chrome || !chrome.storage || !chrome.runtime) {
        return;
    }
    
    // Additional check for extension context
    try {
        // Try to access chrome.runtime.id to test if context is valid
        if (chrome.runtime.id) {
            new TextHighlighter();
        }
    } catch (error) {
        // Context check failed, skip initialization
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeTextHighlighter();
    });
} else {
    initializeTextHighlighter();
} 