/**
 * Advanced Settings Manager - Handles advanced settings modal and functionality
 */
class AdvancedSettingsManager {
    constructor(storageManager) {
        this.storageManager = storageManager;
        this.autoSaveTimeout = null;
        this.boundEventHandlers = {};
    }

    async showAdvancedSettingsModal() {
        await this.loadAdvancedSettings();
        this.bindAdvancedSettingsEvents();
        const modal = document.getElementById('advancedSettingsModal');
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
    }

    hideAdvancedSettingsModal() {
        const modal = document.getElementById('advancedSettingsModal');
        
        // Move focus away from modal before hiding it
        if (modal.contains(document.activeElement)) {
            document.getElementById('advancedSettingsBtn').focus();
        }
        
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        this.unbindAdvancedSettingsEvents();
    }

    async loadAdvancedSettings() {
        const result = await this.storageManager.loadAdvancedSettings();

        // Set website rule radio buttons
        document.getElementById('websiteRuleAll').checked = result.websiteRule === 'all';
        document.getElementById('websiteRuleInclude').checked = result.websiteRule === 'include';
        document.getElementById('websiteRuleExclude').checked = result.websiteRule === 'exclude';

        // Show/hide website containers based on selection
        this.updateWebsiteContainers(result.websiteRule);

        // Load website lists
        this.loadWebsiteList('include', result.includeWebsites);
        this.loadWebsiteList('exclude', result.excludeWebsites);

        // Set other settings
        document.getElementById('maxWordsPerPage').value = result.maxWordsPerPage;
        document.getElementById('showWordCount').checked = result.showWordCount;
        document.getElementById('highlightAnimation').value = result.highlightAnimation;
        document.getElementById('enableKeyboardShortcuts').checked = result.enableKeyboardShortcuts;
        
        // Load current page statistics
        await this.loadCurrentPageStats();
    }

    updateWebsiteContainers(rule) {
        document.getElementById('includeWebsiteContainer').style.display = rule === 'include' ? 'block' : 'none';
        document.getElementById('excludeWebsiteContainer').style.display = rule === 'exclude' ? 'block' : 'none';
    }

    async loadCurrentPageStats() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we can access the tab
            if (!tab || !tab.id || !tab.url) {
                return;
            }

            // Check if tab URL is accessible
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
                tab.url.startsWith('moz-extension://') || tab.url.startsWith('about:')) {
                return;
            }

            // Try to get page word count
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageWordCount' });
            
            if (response && response.wordCount !== undefined) {
                document.getElementById('currentPageWordCount').textContent = response.wordCount.toLocaleString();
                document.getElementById('currentPageStats').style.display = 'block';
                
                // Update color based on performance threshold
                const maxWords = parseInt(document.getElementById('maxWordsPerPage').value) || 10000;
                const statsElement = document.getElementById('currentPageStats');
                
                if (response.wordCount > maxWords) {
                    statsElement.style.background = '#ffebee';
                    statsElement.style.borderLeftColor = '#f44336';
                    statsElement.querySelector('.stats-text').style.color = '#c62828';
                } else if (response.wordCount > maxWords * 0.8) {
                    statsElement.style.background = '#fff3e0';
                    statsElement.style.borderLeftColor = '#ff9800';
                    statsElement.querySelector('.stats-text').style.color = '#e65100';
                } else {
                    statsElement.style.background = '#e3f2fd';
                    statsElement.style.borderLeftColor = '#2196f3';
                    statsElement.querySelector('.stats-text').style.color = '#1565c0';
                }
            }
        } catch (error) {
            // Page stats not available
        }
    }

    loadWebsiteList(type, websites) {
        const container = document.getElementById(`${type}WebsiteList`);
        container.innerHTML = '';
        
        websites.forEach(website => {
            const item = document.createElement('div');
            item.className = 'website-item';
            item.innerHTML = `
                <span class="website-item-url">${this.escapeHtml(website)}</span>
                <button type="button" class="website-item-remove" data-website="${this.escapeHtml(website)}" data-type="${type}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(item);
        });
    }

    bindAdvancedSettingsEvents() {
        // Website rule radio buttons
        this.boundEventHandlers.websiteRuleHandler = (e) => {
            this.updateWebsiteContainers(e.target.value);
            this.autoSaveAdvancedSettings(); // Auto-save when website rule changes
        };
        document.querySelectorAll('input[name="websiteRule"]').forEach(radio => {
            radio.addEventListener('change', this.boundEventHandlers.websiteRuleHandler);
        });

        // Add website buttons
        this.boundEventHandlers.addIncludeHandler = () => this.addWebsite('include');
        this.boundEventHandlers.addExcludeHandler = () => this.addWebsite('exclude');
        document.getElementById('addIncludeWebsite').addEventListener('click', this.boundEventHandlers.addIncludeHandler);
        document.getElementById('addExcludeWebsite').addEventListener('click', this.boundEventHandlers.addExcludeHandler);

        // Website input enter key
        this.boundEventHandlers.websiteInputHandler = (e) => {
            if (e.key === 'Enter') {
                const type = e.target.id.includes('include') ? 'include' : 'exclude';
                this.addWebsite(type);
            }
        };
        document.getElementById('includeWebsiteInput').addEventListener('keydown', this.boundEventHandlers.websiteInputHandler);
        document.getElementById('excludeWebsiteInput').addEventListener('keydown', this.boundEventHandlers.websiteInputHandler);

        // Remove website buttons (delegated)
        this.boundEventHandlers.removeWebsiteHandler = (e) => {
            if (e.target.closest('.website-item-remove')) {
                const button = e.target.closest('.website-item-remove');
                const website = button.dataset.website;
                const type = button.dataset.type;
                this.removeWebsite(type, website);
            }
        };
        document.getElementById('includeWebsiteList').addEventListener('click', this.boundEventHandlers.removeWebsiteHandler);
        document.getElementById('excludeWebsiteList').addEventListener('click', this.boundEventHandlers.removeWebsiteHandler);

        // Data management buttons
        this.boundEventHandlers.exportHandler = () => this.exportSettings();
        this.boundEventHandlers.importHandler = () => this.importSettings();
        this.boundEventHandlers.resetAllHandler = () => this.resetAllSettings();
        document.getElementById('exportSettingsBtn').addEventListener('click', this.boundEventHandlers.exportHandler);
        document.getElementById('importSettingsBtn').addEventListener('click', this.boundEventHandlers.importHandler);
        document.getElementById('resetAllSettingsBtn').addEventListener('click', this.boundEventHandlers.resetAllHandler);

        // File input for import
        this.boundEventHandlers.fileInputHandler = (e) => this.handleImportFile(e);
        document.getElementById('importFileInput').addEventListener('change', this.boundEventHandlers.fileInputHandler);

        // Max words input validation and auto-save
        this.boundEventHandlers.maxWordsHandler = (e) => this.validateMaxWordsInput(e);
        document.getElementById('maxWordsPerPage').addEventListener('input', this.boundEventHandlers.maxWordsHandler);
        document.getElementById('maxWordsPerPage').addEventListener('blur', this.boundEventHandlers.maxWordsHandler);
        document.getElementById('maxWordsPerPage').addEventListener('change', () => this.autoSaveAdvancedSettings());

        // Auto-save for checkboxes
        const checkboxIds = [
            'showWordCount',
            'enableKeyboardShortcuts'
        ];
        
        checkboxIds.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.autoSaveAdvancedSettings());
        });

        // Auto-save for select
        document.getElementById('highlightAnimation').addEventListener('change', () => this.autoSaveAdvancedSettings());
    }

    unbindAdvancedSettingsEvents() {
        // Clean up all event listeners
        Object.entries(this.boundEventHandlers).forEach(([key, handler]) => {
            if (handler) {
                // Remove listeners based on handler type
                if (key === 'websiteRuleHandler') {
                    document.querySelectorAll('input[name="websiteRule"]').forEach(radio => {
                        radio.removeEventListener('change', handler);
                    });
                } else if (key === 'addIncludeHandler') {
                    document.getElementById('addIncludeWebsite').removeEventListener('click', handler);
                } else if (key === 'addExcludeHandler') {
                    document.getElementById('addExcludeWebsite').removeEventListener('click', handler);
                } else if (key === 'websiteInputHandler') {
                    document.getElementById('includeWebsiteInput').removeEventListener('keydown', handler);
                    document.getElementById('excludeWebsiteInput').removeEventListener('keydown', handler);
                } else if (key === 'removeWebsiteHandler') {
                    document.getElementById('includeWebsiteList').removeEventListener('click', handler);
                    document.getElementById('excludeWebsiteList').removeEventListener('click', handler);
                } else if (key === 'exportHandler') {
                    document.getElementById('exportSettingsBtn').removeEventListener('click', handler);
                } else if (key === 'importHandler') {
                    document.getElementById('importSettingsBtn').removeEventListener('click', handler);
                } else if (key === 'resetAllHandler') {
                    document.getElementById('resetAllSettingsBtn').removeEventListener('click', handler);
                } else if (key === 'fileInputHandler') {
                    document.getElementById('importFileInput').removeEventListener('change', handler);
                } else if (key === 'maxWordsHandler') {
                    document.getElementById('maxWordsPerPage').removeEventListener('input', handler);
                    document.getElementById('maxWordsPerPage').removeEventListener('blur', handler);
                }
            }
        });

        // Clear auto-save timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
    }

    addWebsite(type) {
        const input = document.getElementById(`${type}WebsiteInput`);
        const website = input.value.trim();
        
        if (!website) {
            if (this.onNotification) this.onNotification('Please enter a website URL', 'error');
            return;
        }

        // Enhanced URL validation and cleanup
        let cleanUrl = website.toLowerCase();
        
        // Remove protocol
        cleanUrl = cleanUrl.replace(/^https?:\/\//, '');
        
        // Remove www prefix
        cleanUrl = cleanUrl.replace(/^www\./, '');
        
        // Remove path, query params, and fragments
        cleanUrl = cleanUrl.split('/')[0].split('?')[0].split('#')[0];
        
        // Remove port numbers for common ports
        cleanUrl = cleanUrl.replace(/:80$|:443$/, '');

        // Validate domain format
        const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
        if (!cleanUrl || !domainRegex.test(cleanUrl)) {
            if (this.onNotification) this.onNotification('Please enter a valid domain (e.g., example.com)', 'error');
            return;
        }

        // Check for minimum domain length
        if (cleanUrl.length < 3) {
            if (this.onNotification) this.onNotification('Domain name too short', 'error');
            return;
        }

        // Get current websites
        chrome.storage.sync.get({ [`${type}Websites`]: [] }, (result) => {
            const websites = result[`${type}Websites`];
            if (websites.includes(cleanUrl)) {
                if (this.onNotification) this.onNotification('Website already exists in the list', 'error');
                input.value = '';
                return;
            }
            
            websites.push(cleanUrl);
            chrome.storage.sync.set({ [`${type}Websites`]: websites }, () => {
                this.loadWebsiteList(type, websites);
                input.value = '';
                if (this.onNotification) this.onNotification(`Website added to ${type} list`, 'success');
                // Auto-save and update content script
                if (this.onContentUpdate) this.onContentUpdate();
            });
        });
    }

    removeWebsite(type, website) {
        chrome.storage.sync.get({ [`${type}Websites`]: [] }, (result) => {
            const websites = result[`${type}Websites`];
            const index = websites.indexOf(website);
            if (index > -1) {
                websites.splice(index, 1);
                chrome.storage.sync.set({ [`${type}Websites`]: websites }, () => {
                    this.loadWebsiteList(type, websites);
                    // Auto-save and update content script
                    if (this.onContentUpdate) this.onContentUpdate();
                });
            }
        });
    }

    async autoSaveAdvancedSettings() {
        try {
            // Debounce auto-save to avoid too frequent saves
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = setTimeout(async () => {
                const settings = {
                    websiteRule: document.querySelector('input[name="websiteRule"]:checked')?.value || 'all',
                    maxWordsPerPage: parseInt(document.getElementById('maxWordsPerPage').value) || 10000,
                    showWordCount: document.getElementById('showWordCount').checked,
                    highlightAnimation: document.getElementById('highlightAnimation').value,
                    enableKeyboardShortcuts: document.getElementById('enableKeyboardShortcuts').checked
                };

                await this.storageManager.saveAdvancedSettings(settings);
                
                // Update content script with new settings
                if (this.onContentUpdate) this.onContentUpdate();
                
                // Show subtle success indicator
                this.showAutoSaveIndicator();
            }, 500); // 500ms debounce
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }

    showAutoSaveIndicator() {
        // Create or update a subtle auto-save indicator
        let indicator = document.getElementById('autoSaveIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoSaveIndicator';
            indicator.innerHTML = '<i class="fas fa-check"></i> Saved';
            indicator.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #4caf50;
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                z-index: 10001;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            document.body.appendChild(indicator);
        }

        // Show and hide the indicator
        indicator.style.opacity = '1';
        setTimeout(() => {
            if (indicator) {
                indicator.style.opacity = '0';
                setTimeout(() => {
                    if (indicator && indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 300);
            }
        }, 1500);
    }

    async resetAdvancedSettings() {
        if (!confirm('Reset ONLY advanced settings to defaults? This will NOT delete your word lists.')) {
            return;
        }

        const defaultSettings = {
            websiteRule: 'all',
            includeWebsites: [],
            excludeWebsites: [],
            maxWordsPerPage: 10000,
            showWordCount: true,
            highlightAnimation: 'normal',
            enableKeyboardShortcuts: true
        };

        await this.storageManager.saveAdvancedSettings(defaultSettings);
        await this.loadAdvancedSettings();
        
        // Update content script with new settings
        if (this.onContentUpdate) this.onContentUpdate();
        
        if (this.onNotification) this.onNotification('Advanced settings reset to defaults! Word lists preserved.');
    }

    async exportSettings() {
        try {
            const exportData = await this.storageManager.exportAllSettings();

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `smart-highlighter-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (this.onNotification) this.onNotification('Settings exported successfully!');
        } catch (error) {
            if (this.onNotification) this.onNotification('Failed to export settings: ' + error.message, 'error');
        }
    }

    importSettings() {
        document.getElementById('importFileInput').click();
    }

    async handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Validate file type
            if (!file.name.toLowerCase().endsWith('.json')) {
                throw new Error('Please select a JSON file');
            }

            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('File too large. Maximum size is 10MB');
            }

            const text = await file.text();
            
            // Validate JSON format
            let importData;
            try {
                importData = JSON.parse(text);
            } catch (parseError) {
                throw new Error('Invalid JSON format');
            }

            // Show import preview
            const previewInfo = this.generateImportPreview(importData.settings);
            const confirmMessage = `Import settings?\n\n${previewInfo}\n\nThis will overwrite your current settings.`;
            
            if (!confirm(confirmMessage)) {
                return;
            }

            await this.storageManager.importSettings(importData);
            
            // Reload the popup
            if (this.onSettingsReload) this.onSettingsReload();

            if (this.onNotification) this.onNotification('Settings imported successfully!');
        } catch (error) {
            if (this.onNotification) this.onNotification('Failed to import settings: ' + error.message, 'error');
        }

        // Clear the file input
        event.target.value = '';
    }

    generateImportPreview(settings) {
        const items = [];
        
        if (settings && settings.wordLists && Array.isArray(settings.wordLists)) {
            items.push(`• ${settings.wordLists.length} word list(s)`);
        }
        
        if (settings && settings.enableHighlighting !== undefined) {
            items.push(`• Highlighting: ${settings.enableHighlighting ? 'enabled' : 'disabled'}`);
        }
        
        if (settings && settings.websiteRule) {
            items.push(`• Website rule: ${settings.websiteRule}`);
        }
        
        return items.length > 0 ? items.join('\n') : 'No recognizable settings found';
    }

    validateMaxWordsInput(event) {
        const input = event.target;
        let value = parseInt(input.value);
        
        // Remove any non-numeric characters
        input.value = input.value.replace(/[^0-9]/g, '');
        
        if (event.type === 'blur') {
            // On blur, enforce min/max limits
            if (isNaN(value) || value < 100) {
                input.value = '100';
                if (this.onNotification) this.onNotification('Minimum value is 100 words', 'error');
            } else if (value > 10000) {
                input.value = '10000';
                if (this.onNotification) this.onNotification('Maximum value is 10,000 words', 'error');
            }
            
            // Update page stats color if visible
            if (document.getElementById('currentPageStats').style.display !== 'none') {
                this.updatePageStatsColor();
            }
        }
    }

    updatePageStatsColor() {
        const maxWords = parseInt(document.getElementById('maxWordsPerPage').value) || 10000;
        const currentWordCountText = document.getElementById('currentPageWordCount').textContent;
        const currentWordCount = parseInt(currentWordCountText.replace(/,/g, '')) || 0;
        const statsElement = document.getElementById('currentPageStats');
        
        if (currentWordCount > maxWords) {
            statsElement.style.background = '#ffebee';
            statsElement.style.borderLeftColor = '#f44336';
            statsElement.querySelector('.stats-text').style.color = '#c62828';
        } else if (currentWordCount > maxWords * 0.8) {
            statsElement.style.background = '#fff3e0';
            statsElement.style.borderLeftColor = '#ff9800';
            statsElement.querySelector('.stats-text').style.color = '#e65100';
        } else {
            statsElement.style.background = '#e3f2fd';
            statsElement.style.borderLeftColor = '#2196f3';
            statsElement.querySelector('.stats-text').style.color = '#1565c0';
        }
    }

    async resetAllSettings() {
        if (!confirm('⚠️ FACTORY RESET ⚠️\n\nThis will DELETE EVERYTHING:\n• All word lists and words\n• All settings and preferences\n• Cannot be undone!\n\nAre you absolutely sure?')) {
            return;
        }

        try {
            await this.storageManager.clearAllStorage();
            
            // Notify for UI reset
            if (this.onFactoryReset) this.onFactoryReset();

            if (this.onNotification) this.onNotification('Factory reset complete! Extension restored to defaults.');
        } catch (error) {
            if (this.onNotification) this.onNotification('Error during factory reset: ' + error.message, 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Event callbacks (to be set by the main popup class)
    setEventCallbacks(callbacks) {
        this.onNotification = callbacks.onNotification;
        this.onContentUpdate = callbacks.onContentUpdate;
        this.onSettingsReload = callbacks.onSettingsReload;
        this.onFactoryReset = callbacks.onFactoryReset;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedSettingsManager;
} else if (typeof window !== 'undefined') {
    window.AdvancedSettingsManager = AdvancedSettingsManager;
}