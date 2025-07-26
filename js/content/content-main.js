/**
 * Content Script Main - Initializes the text highlighter with modular components
 */

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
            // Ensure all required classes are available
            if (typeof DOMManager !== 'undefined' && 
                typeof SettingsHandler !== 'undefined' && 
                typeof TextHighlighter !== 'undefined') {
                new TextHighlighter();
            } else {
                console.error('Required content script classes not loaded. Please check script loading order.');
            }
        }
    } catch (error) {
        // Silent error handling
    }
}

// Initialize the content script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTextHighlighter);
} else {
    initializeTextHighlighter();
}