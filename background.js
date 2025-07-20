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
            }
        });
    }

    async setDefaultSettings() {
        const defaultSettings = {
            enableHighlighting: true,
            caseSensitive: false,
            wholeWordsOnly: false,
            wordLists: []
        };

        await chrome.storage.sync.set(defaultSettings);
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync') {
                // Notify all content scripts about storage changes
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
            console.error('Error notifying tabs:', error);
        }
    }
}

// Initialize the background service
new BackgroundService(); 