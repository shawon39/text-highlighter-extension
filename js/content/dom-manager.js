/**
 * DOM Manager - Handles all DOM manipulation and highlighting operations
 */
class DOMManager {
    constructor(textHighlighter) {
        this.textHighlighter = textHighlighter;
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
        
        if (!originalText || originalText.trim().length === 0) {
            return false;
        }
        
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
            try {
                if (settings.wholeWordsOnly) {
                    // Use word boundaries for whole word matching
                    pattern = new RegExp(`\\b${this.textHighlighter.escapeRegex(word)}\\b`, flags);
                } else {
                    pattern = new RegExp(this.textHighlighter.escapeRegex(word), flags);
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
            } catch (error) {
                // Skip invalid regex patterns
            }
        });

        if (highlights.length === 0) {
            return false;
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

        // Create highlighted content using safe DOM methods
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        mergedHighlights.forEach(highlight => {
            // Add text before highlight
            const beforeText = originalText.substring(lastIndex, highlight.start);
            if (beforeText) {
                fragment.appendChild(document.createTextNode(beforeText));
            }
            
            // Add highlighted text using safe method
            const highlightSpan = this.createHighlightSpan(highlight.text, highlight.styles);
            fragment.appendChild(highlightSpan);
            
            lastIndex = highlight.end;
        });

        // Add remaining text
        const remainingText = originalText.substring(lastIndex);
        if (remainingText) {
            fragment.appendChild(document.createTextNode(remainingText));
        }

        // Replace the text node with highlighted content safely
        if (mergedHighlights.length > 0) {
            // Create wrapper to maintain structure
            const wrapper = document.createElement('span');
            wrapper.appendChild(fragment);
            
            // Use safer replacement method that preserves parent structure
            try {
                if (textNode.parentNode) {
                    textNode.parentNode.insertBefore(wrapper, textNode);
                    textNode.parentNode.removeChild(textNode);
                    this.textHighlighter.addHighlightedElement(wrapper);
                    return true;
                }
            } catch (error) {
                // If replacement fails, remove the wrapper to avoid orphaned elements
                if (wrapper.parentNode) {
                    wrapper.parentNode.removeChild(wrapper);
                }
                // Silent error handling
            }
        }
        
        return false;
    }
    
    // Safe method to create highlight spans without innerHTML
    createHighlightSpan(text, styles) {
        const span = document.createElement('span');
        span.className = 'highlighter-mark';
        span.textContent = text; // Safe - no HTML injection possible
        
        // Apply styles safely
        const cssStyle = `
            background: ${this.textHighlighter.sanitizeCssValue(styles.backgroundColor)};
            color: ${this.textHighlighter.sanitizeCssValue(styles.color)};
            font-weight: ${this.textHighlighter.sanitizeCssValue(styles.fontWeight)};
            font-style: ${this.textHighlighter.sanitizeCssValue(styles.fontStyle)};
            text-decoration: ${this.textHighlighter.sanitizeCssValue(styles.textDecoration)};
            text-transform: ${this.textHighlighter.sanitizeCssValue(styles.textTransform)};
            padding: ${this.textHighlighter.sanitizePixelValue(styles.paddingTop)}px ${this.textHighlighter.sanitizePixelValue(styles.paddingRight)}px ${this.textHighlighter.sanitizePixelValue(styles.paddingBottom)}px ${this.textHighlighter.sanitizePixelValue(styles.paddingLeft)}px;
            border-radius: ${this.textHighlighter.sanitizePixelValue(styles.borderRadius)}px;
        `;
        
        if (styles.borderWidth > 0) {
            span.style.cssText = cssStyle + `border: ${this.textHighlighter.sanitizePixelValue(styles.borderWidth)}px ${this.textHighlighter.sanitizeCssValue(styles.borderStyle)} ${this.textHighlighter.sanitizeCssValue(styles.borderColor)};`;
        } else {
            span.style.cssText = cssStyle + 'border: none;';
        }
        
        return span;
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
            return '';
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
                        pattern = new RegExp(`\\b${this.textHighlighter.escapeRegex(word)}\\b`, flags);
                    } else {
                        pattern = new RegExp(this.textHighlighter.escapeRegex(word), flags);
                    }

                    const matches = textContent.match(pattern);
                    const count = matches ? matches.length : 0;
                    counts[wordData.text] = count; // Use original text as key
                } catch (error) {
                    counts[wordData.text] = 0;
                }
            });

            return counts;
        } catch (error) {
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMManager;
} else if (typeof window !== 'undefined') {
    window.DOMManager = DOMManager;
}