class BackgroundService {
    constructor() {
        this.init();
    }

    init() {
        this.setupInstallListener();
        this.setupStorageListener();
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
            }
        });
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