/**
 * Main Popup Core - Coordinates all popup functionality and components
 */
class TextHighlighterPopup {
    constructor() {
        // Initialize all managers
        this.storageManager = new StorageManager();
        this.styleManager = new StyleManager();
        this.modalManager = new ModalManager(this.storageManager, this.styleManager);
        this.wordListRenderer = new WordListRenderer(this.storageManager, this.styleManager);
        this.advancedSettingsManager = new AdvancedSettingsManager(this.storageManager);
        
        // State variables
        this.lastExpandedListId = null;
        this.settings = { showWordCount: true };
        
        this.init();
    }

    async init() {
        try {
            await this.loadSettings();
            
            this.bindEvents();
            this.setupEventCallbacks();
            
            await this.wordListRenderer.loadWordLists();
            
        } catch (error) {
            console.error('Popup initialization error:', error);
        }
    }

    async loadSettings() {
        const result = await this.storageManager.loadSettings();

        // Safely update UI elements
        const enableCheckbox = document.getElementById('enableHighlighting');
        const caseCheckbox = document.getElementById('caseSensitive');
        const wholeWordsCheckbox = document.getElementById('wholeWordsOnly');
        
        if (enableCheckbox) {
            enableCheckbox.checked = result.enableHighlighting;
        }
        
        if (caseCheckbox) {
            caseCheckbox.checked = result.caseSensitive;
        }
        
        if (wholeWordsCheckbox) {
            wholeWordsCheckbox.checked = result.wholeWordsOnly;
        }
        
        this.lastExpandedListId = result.lastExpandedListId;
        this.wordListRenderer.setLastExpandedListId(this.lastExpandedListId);
        
        // Update toggle status icon
        this.updateToggleStatusIcon();
    }

    bindEvents() {
        // Settings toggles
        document.getElementById('enableHighlighting').addEventListener('change', () => {
            this.updateToggleStatusIcon();
            this.saveSettings();
        });
        document.getElementById('caseSensitive').addEventListener('change', this.saveSettings.bind(this));
        document.getElementById('wholeWordsOnly').addEventListener('change', this.saveSettings.bind(this));

        // Add list buttons
        document.getElementById('addListBtn').addEventListener('click', () => {
            this.modalManager.showAddListModal();
        });

        // Update toggle status icon when the toggle changes
        document.getElementById('enableHighlighting').addEventListener('change', () => {
            this.updateToggleStatusIcon();
        });

        // Advanced settings button
        document.getElementById('advancedSettingsBtn').addEventListener('click', () => {
            this.advancedSettingsManager.showAdvancedSettingsModal();
        });

        // Close advanced settings modal
        document.getElementById('closeAdvancedBtn').addEventListener('click', () => {
            this.advancedSettingsManager.hideAdvancedSettingsModal();
        });

        // Reset advanced settings button
        document.getElementById('resetAdvancedBtn').addEventListener('click', () => {
            this.advancedSettingsManager.resetAdvancedSettings();
        });

        // Bind modal events
        this.modalManager.bindModalEvents();
    }

    setupEventCallbacks() {
        // Set up callbacks for modal manager
        this.modalManager.setEventCallbacks({
            onNotification: this.showNotification.bind(this),
            onWordListCreated: (listId) => {
                this.lastExpandedListId = listId;
                this.saveSettings();
            },
            onContentUpdate: this.updateContentScript.bind(this),
            onWordCountsRefresh: () => {
                this.wordListRenderer.loadWordCounts();
            },
            onStylesUpdated: () => {
                this.wordListRenderer.loadWordLists();
                this.updateContentScript();
            },
            onWordListsRefresh: () => {
                this.wordListRenderer.loadWordLists();
            }
        });

        // Set up callbacks for word list renderer
        this.wordListRenderer.setEventCallbacks({
            onStatusUpdate: this.updateStatusBar.bind(this),
            onSaveSettings: () => {
                this.lastExpandedListId = this.wordListRenderer.getLastExpandedListId();
                this.saveSettings();
            },
            onContentUpdate: this.updateContentScript.bind(this),
            onShowAddWordModal: (listId) => {
                this.modalManager.showAddWordModal(listId);
            }
        });

        // Set up callbacks for advanced settings manager
        this.advancedSettingsManager.setEventCallbacks({
            onNotification: this.showNotification.bind(this),
            onContentUpdate: this.updateContentScript.bind(this),
            onSettingsReload: this.reloadAllSettings.bind(this),
            onFactoryReset: this.handleFactoryReset.bind(this)
        });
    }

    async saveSettings() {
        const settings = {
            enableHighlighting: document.getElementById('enableHighlighting').checked,
            caseSensitive: document.getElementById('caseSensitive').checked,
            wholeWordsOnly: document.getElementById('wholeWordsOnly').checked,
            lastExpandedListId: this.lastExpandedListId
        };

        await this.storageManager.saveSettings(settings);
        
        // Force content script to refresh immediately with new settings
        this.updateContentScript();
        
        // Refresh word counts when settings change
        await this.wordListRenderer.loadWordCounts();
    }

    async updateContentScript() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'updateHighlighting' });
        } catch (error) {
            // Tab might not have content script loaded
            
            // Show user-friendly error for common issues
            if (error.message.includes('Cannot access contents')) {
                // Don't show error for protected pages
                return;
            } else if (error.message.includes('Extension context invalidated')) {
                this.showNotification('Extension needs to be reloaded', 'warning');
            } else if (error.message.includes('Could not establish connection')) {
                // Try to inject content script
                // Content scripts are already loaded via manifest.json
                // No need to inject them manually
                setTimeout(async () => {
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        const response = await chrome.tabs.sendMessage(tab.id, { action: 'updateHighlighting' });
                    } catch (retryError) {
                        // Silent failure
                    }
                }, 1000);
            }
        }
    }

    updateToggleStatusIcon() {
        const isEnabled = document.getElementById('enableHighlighting').checked;
        const statusIcon = document.getElementById('toggleStatusIcon');
        
        if (statusIcon) {
            if (isEnabled) {
                statusIcon.className = 'fas fa-power-off toggle-status-icon enabled';
            } else {
                statusIcon.className = 'fas fa-power-off toggle-status-icon disabled';
            }
        }
    }

    updateStatusBar(message, type = 'info') {
        const statusBar = document.getElementById('statusBar');
        const statusText = document.getElementById('statusText');
        const statusIcon = statusBar?.querySelector('.status-icon');
        
        if (!statusBar || !statusText || !statusIcon) return;
        
        statusText.textContent = message;
        
        // Update icon based on type
        statusIcon.className = `fas status-icon ${
            type === 'success' ? 'fa-check-circle' :
            type === 'warning' ? 'fa-exclamation-triangle' :
            type === 'error' ? 'fa-times-circle' :
            'fa-info-circle'
        }`;
        
        // Show status bar
        statusBar.style.display = 'flex';
        
        // Auto-hide after 5 seconds for non-critical messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                if (statusBar.style.display === 'flex') {
                    statusBar.style.display = 'none';
                }
            }, 5000);
        }
    }

    showNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : '#4caf50'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            word-wrap: break-word;
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    async reloadAllSettings() {
        await this.loadSettings();
        await this.wordListRenderer.loadWordLists();
        await this.advancedSettingsManager.loadAdvancedSettings();
    }

    handleFactoryReset() {
        // Reset all in-memory variables
        this.lastExpandedListId = null;
        this.settings = {};
        
        // Reset all UI elements to default states
        this.resetUIToDefaults();
        
        // Reload all components with fresh defaults
        this.reloadAllSettings();
        
        // Update content script to clear any highlighting
        this.updateContentScript();
        
        // Close any open modals
        this.modalManager.hideModals();
        this.advancedSettingsManager.hideAdvancedSettingsModal();
    }

    resetUIToDefaults() {
        // Reset main settings checkboxes
        document.getElementById('enableHighlighting').checked = true;
        document.getElementById('caseSensitive').checked = false;
        document.getElementById('wholeWordsOnly').checked = false;
        
        // Update toggle status icon
        this.updateToggleStatusIcon();
        
        // Clear status bar
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.style.display = 'none';
        }
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Ensure all required classes are available
    if (typeof StorageManager !== 'undefined' && 
        typeof StyleManager !== 'undefined' && 
        typeof ModalManager !== 'undefined' && 
        typeof WordListRenderer !== 'undefined' && 
        typeof AdvancedSettingsManager !== 'undefined') {
        new TextHighlighterPopup();
    } else {
        console.error('Required classes not loaded. Please check script loading order.');
    }
});