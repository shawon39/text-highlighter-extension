/**
 * Storage Manager - Handles all Chrome storage operations with validation and error handling
 */
class StorageManager {
    constructor() {
        // Storage operation management
        this.storageOperations = new Map();
        this.operationId = 0;
    }
    
    // Safe storage operations with locking mechanism
    async safeStorageOperation(operation, operationName = 'unknown') {
        const opId = ++this.operationId;
        const lockKey = `storage_${operationName}`;
        
        // Wait for any existing operation of the same type to complete
        if (this.storageOperations.has(lockKey)) {
            try {
                await this.storageOperations.get(lockKey);
            } catch (error) {
                // Continue with new operation
            }
        }
        
        // Create new operation promise
        const operationPromise = this.executeStorageOperation(operation, operationName, opId);
        this.storageOperations.set(lockKey, operationPromise);
        
        try {
            const result = await operationPromise;
            return result;
        } finally {
            // Clean up completed operation
            if (this.storageOperations.get(lockKey) === operationPromise) {
                this.storageOperations.delete(lockKey);
            }
        }
    }
    
    async executeStorageOperation(operation, operationName, opId) {
        const maxRetries = 3;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                
                // Validate result structure
                if (result && typeof result === 'object') {
                    this.validateStorageData(result);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        // All retries failed
        throw new Error(`Storage operation failed: ${lastError.message}`);
    }
    
    validateStorageData(data) {
        if (data.wordLists && Array.isArray(data.wordLists)) {
            // Check for data corruption
            data.wordLists.forEach((list, index) => {
                if (!list || typeof list !== 'object') {
                    throw new Error(`Invalid list at index ${index}`);
                }
                if (!list.id || !list.name) {
                    throw new Error(`Missing required fields in list ${index}`);
                }
                if (list.words && !Array.isArray(list.words)) {
                    throw new Error(`Invalid words array in list ${index}`);
                }
            });
        }
        
        // Check storage size (Chrome sync storage limit is ~8KB per item)
        const dataSize = JSON.stringify(data).length;
        if (dataSize > 7000) { // Leave some buffer
            console.warn(`Storage data size (${dataSize} bytes) approaching limit`);
        }
        
        return true;
    }

    // Settings management
    async loadSettings() {
        const result = await chrome.storage.sync.get({
            enableHighlighting: true,
            caseSensitive: false,
            wholeWordsOnly: false,
            lastExpandedListId: null
        });

        return result;
    }

    async saveSettings(settings) {
        await chrome.storage.sync.set(settings);
    }

    // Word lists management
    async loadWordLists() {
        const result = await chrome.storage.sync.get({ wordLists: [] });
        return result.wordLists;
    }

    async saveWordLists(wordLists) {
        await this.safeStorageOperation(async () => {
            await chrome.storage.sync.set({ wordLists });
            return { wordLists };
        }, 'saveWordLists');
    }

    // Advanced settings management
    async loadAdvancedSettings() {
        const result = await chrome.storage.sync.get({
            websiteRule: 'all',
            includeWebsites: [],
            excludeWebsites: [],
            maxWordsPerPage: 10000,
            showWordCount: true,
            highlightAnimation: 'normal',
            enableKeyboardShortcuts: true
        });

        return result;
    }

    async saveAdvancedSettings(settings) {
        await chrome.storage.sync.set(settings);
    }

    // Input validation and sanitization utilities
    sanitizeInput(text, maxLength = 100) {
        if (typeof text !== 'string') return '';
        
        // Remove HTML tags and potentially dangerous characters
        const sanitized = text
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[<>'"&]/g, '') // Remove dangerous characters
            .trim();
            
        // Enforce length limit
        return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
    }
    
    validateWordInput(word) {
        if (!word || typeof word !== 'string') return false;
        
        // Check length constraints
        if (word.length < 1 || word.length > 100) return false;
        
        // Check for valid characters (letters, numbers, spaces, basic punctuation)
        const validPattern = /^[a-zA-Z0-9\s\-_.,!?()]+$/;
        return validPattern.test(word);
    }
    
    checkDuplicateWord(newWord, existingWords) {
        const normalizedNew = newWord.toLowerCase().trim();
        return existingWords.some(word => 
            word.text.toLowerCase().trim() === normalizedNew
        );
    }

    // Import/Export functionality
    async exportAllSettings() {
        const allData = await chrome.storage.sync.get(null);
        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            settings: allData
        };
        return exportData;
    }

    async importSettings(importData) {
        // Validate structure
        if (!importData || typeof importData !== 'object') {
            throw new Error('Invalid settings file structure');
        }

        if (!importData.settings || typeof importData.settings !== 'object') {
            throw new Error('Settings data not found in file');
        }

        // Validate version compatibility
        if (importData.version && !this.isVersionCompatible(importData.version)) {
            throw new Error('Settings file version not compatible');
        }

        // Validate individual settings before import
        const validatedSettings = this.validateImportSettings(importData.settings);

        await chrome.storage.sync.clear();
        await chrome.storage.sync.set(validatedSettings);
        
        return validatedSettings;
    }

    isVersionCompatible(version) {
        // Simple version compatibility check
        const majorVersion = version.split('.')[0];
        return majorVersion === '1'; // Only accept version 1.x
    }

    validateImportSettings(settings) {
        const validated = {};
        
        // Validate and copy known settings with defaults
        validated.enableHighlighting = typeof settings.enableHighlighting === 'boolean' ? 
            settings.enableHighlighting : true;
        validated.caseSensitive = typeof settings.caseSensitive === 'boolean' ? 
            settings.caseSensitive : false;
        validated.wholeWordsOnly = typeof settings.wholeWordsOnly === 'boolean' ? 
            settings.wholeWordsOnly : false;
        validated.showWordCount = typeof settings.showWordCount === 'boolean' ? 
            settings.showWordCount : true;
        validated.enableKeyboardShortcuts = typeof settings.enableKeyboardShortcuts === 'boolean' ? 
            settings.enableKeyboardShortcuts : true;
        
        // Validate string settings
        validated.websiteRule = ['all', 'include', 'exclude'].includes(settings.websiteRule) ? 
            settings.websiteRule : 'all';
        validated.highlightAnimation = ['none', 'fast', 'normal', 'slow'].includes(settings.highlightAnimation) ? 
            settings.highlightAnimation : 'normal';
        
        // Validate number settings
        validated.maxWordsPerPage = Number.isInteger(settings.maxWordsPerPage) && 
            settings.maxWordsPerPage >= 100 && settings.maxWordsPerPage <= 10000 ? 
            settings.maxWordsPerPage : 10000;
        
        // Validate arrays
        validated.includeWebsites = Array.isArray(settings.includeWebsites) ? 
            settings.includeWebsites.filter(url => typeof url === 'string' && url.length > 0) : [];
        validated.excludeWebsites = Array.isArray(settings.excludeWebsites) ? 
            settings.excludeWebsites.filter(url => typeof url === 'string' && url.length > 0) : [];
        
        // Validate word lists
        if (Array.isArray(settings.wordLists)) {
            validated.wordLists = settings.wordLists
                .filter(list => list && typeof list === 'object' && typeof list.name === 'string')
                .map(list => ({
                    id: list.id || Date.now() + Math.random(),
                    name: list.name.substring(0, 100), // Limit name length
                    color: typeof list.color === 'string' ? list.color : '#ffeb3b',
                    enabled: typeof list.enabled === 'boolean' ? list.enabled : true,
                    words: Array.isArray(list.words) ? 
                        list.words
                            .filter(word => word && typeof word.text === 'string' && word.text.trim().length > 0)
                            .map(word => ({
                                id: word.id || Date.now() + Math.random(),
                                text: word.text.trim().substring(0, 500), // Limit word length
                                enabled: typeof word.enabled === 'boolean' ? word.enabled : true
                            })) : [],
                    styles: list.styles && typeof list.styles === 'object' ? list.styles : undefined
                }));
        } else {
            validated.wordLists = [];
        }
        
        return validated;
    }

    // Clear all data
    async clearAllStorage() {
        await chrome.storage.sync.clear();
        await chrome.storage.local.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
} else if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
}