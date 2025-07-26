class BackgroundService {
    constructor() {
        this.init();
    }

    init() {
        this.setupInstallListener();
        this.setupStorageListener();
        this.setupBadge();
    }

    setupInstallListener() {
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.setDefaultSettings();
            } else if (details.reason === 'update') {
                this.checkAndUpdateSettings();
            }
        });
    }

    async setDefaultSettings() {
        const defaultSettings = {
            enableHighlighting: true,
            caseSensitive: false,
            wholeWordsOnly: false,
            wordLists: [],
            websiteRule: 'all',
            includeWebsites: [],
            excludeWebsites: [],
            maxWordsPerPage: 10000,
            showWordCount: true,
            highlightAnimation: 'normal',
            enableKeyboardShortcuts: true
        };

        try {
            await chrome.storage.sync.set(defaultSettings);
        } catch (error) {
            // Silent error handling
        }
    }
    
    async checkAndUpdateSettings() {
        try {
            const currentSettings = await chrome.storage.sync.get(null);
            
            const requiredSettings = {
                enableHighlighting: true,
                caseSensitive: false,
                wholeWordsOnly: false,
                wordLists: [],
                websiteRule: 'all',
                includeWebsites: [],
                excludeWebsites: [],
                maxWordsPerPage: 10000,
                showWordCount: true,
                highlightAnimation: 'normal',
                enableKeyboardShortcuts: true
            };
            
            const newSettings = {};
            let hasUpdates = false;
            
            for (const [key, defaultValue] of Object.entries(requiredSettings)) {
                if (!(key in currentSettings)) {
                    newSettings[key] = defaultValue;
                    hasUpdates = true;
                }
            }
            
            if (hasUpdates) {
                await chrome.storage.sync.set(newSettings);
            }
        } catch (error) {
            // Silent error handling
        }
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync') {
                this.notifyAllTabs();
                if (changes.enableHighlighting) {
                    this.updateBadge(changes.enableHighlighting.newValue);
                }
            }
        });
    }

    async setupBadge() {
        try {
            const settings = await chrome.storage.sync.get(['enableHighlighting']);
            const isEnabled = settings.enableHighlighting !== false;
            this.updateBadge(isEnabled);
        } catch (error) {
            // Silent error handling
        }
    }

    updateBadge(isEnabled) {
        try {
            if (isEnabled) {
                chrome.action.setBadgeText({ text: 'ON' });
                chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }
        } catch (error) {
            // Silent error handling
        }
    }

    async notifyAllTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            const promises = tabs.map(tab => {
                return chrome.tabs.sendMessage(tab.id, { action: 'updateHighlighting' })
                    .catch(() => {
                        // Ignore errors for tabs that don't have content script
                    });
            });
            await Promise.all(promises);
        } catch (error) {
            // Silent error handling
        }
    }
}

// Initialize the background service
new BackgroundService(); 