/**
 * Modal Manager - Handles all modal dialogs and their interactions
 */
class ModalManager {
    constructor(storageManager, styleManager) {
        this.storageManager = storageManager;
        this.styleManager = styleManager;
        this.currentListId = null;
        this.escapeHtml = this.escapeHtml.bind(this);
    }

    bindModalEvents() {
        // Modal events
        document.getElementById('createListBtn').addEventListener('click', this.createWordList.bind(this));
        document.getElementById('cancelListBtn').addEventListener('click', this.hideAddListModal.bind(this));
        document.getElementById('addWordsBtn').addEventListener('click', this.addWords.bind(this));
        document.getElementById('cancelWordBtn').addEventListener('click', this.hideAddWordModal.bind(this));
        document.getElementById('saveStylesBtn').addEventListener('click', () => {
            this.styleManager.saveEditedStyles(this.storageManager, () => {
                if (this.onStylesUpdated) this.onStylesUpdated();
            });
        });
        document.getElementById('cancelEditStylesBtn').addEventListener('click', () => {
            this.styleManager.hideEditStylesModal();
        });
        document.getElementById('resetStylesBtn').addEventListener('click', () => {
            const success = this.styleManager.resetStylesToDefault();
            if (this.onNotification) {
                this.onNotification(success ? 'Styles reset to default!' : 'Error resetting styles', success ? 'success' : 'error');
            }
        });

        // New list style customization
        document.getElementById('customizeNewListStyle').addEventListener('click', () => {
            this.styleManager.openStyleCustomization();
        });
        
        // Quick style selection for new lists
        this.styleManager.bindQuickStyleEvents();

        // Close modals when clicking X
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    this.hideModals();
                }
            });
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModals();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape key closes modals
            if (e.key === 'Escape') {
                this.hideModals();
            }
            
            // Enter key in modal forms
            if (e.key === 'Enter') {
                // In add list modal
                if (document.getElementById('addListModal').style.display === 'block') {
                    if (document.activeElement === document.getElementById('newListName')) {
                        e.preventDefault();
                        this.createWordList();
                    }
                }
                
                // In add word modal - Ctrl+Enter to submit (regular Enter for new line)
                if (document.getElementById('addWordModal').style.display === 'block') {
                    if (document.activeElement === document.getElementById('newWords') && e.ctrlKey) {
                        e.preventDefault();
                        this.addWords();
                    }
                }
            }
        });
    }

    showAddListModal() {
        document.getElementById('addListModal').style.display = 'block';
        document.getElementById('newListName').value = '';
        
        // Reset to default style selection
        document.querySelectorAll('.quick-style-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.quick-style-btn[data-style="default"]').classList.add('active');
        
        // Focus on name input
        setTimeout(() => document.getElementById('newListName').focus(), 100);
    }

    hideAddListModal() {
        document.getElementById('addListModal').style.display = 'none';
    }

    showAddWordModal(listId) {
        this.currentListId = listId;
        document.getElementById('newWords').value = '';
        document.getElementById('addWordModal').style.display = 'block';
        
        // Focus on textarea
        setTimeout(() => document.getElementById('newWords').focus(), 100);
    }

    hideAddWordModal() {
        document.getElementById('addWordModal').style.display = 'none';
        this.currentListId = null;
    }

    hideModals() {
        document.getElementById('addListModal').style.display = 'none';
        document.getElementById('addWordModal').style.display = 'none';
        this.styleManager.hideEditStylesModal();
        this.currentListId = null;
    }

    async createWordList() {
        const rawName = document.getElementById('newListName').value.trim();
        const name = this.storageManager.sanitizeInput(rawName, 50);

        if (!name) {
            if (this.onNotification) this.onNotification('Please enter a list name', 'error');
            return;
        }
        
        if (name.length < 2) {
            if (this.onNotification) this.onNotification('List name must be at least 2 characters', 'error');
            return;
        }
        
        // Check for duplicate list names
        const wordLists = await this.storageManager.loadWordLists();
        const existingNames = wordLists.map(list => list.name.toLowerCase().trim());
        
        if (existingNames.includes(name.toLowerCase().trim())) {
            if (this.onNotification) this.onNotification('A list with this name already exists', 'error');
            return;
        }

        // Get selected style preset or use pending custom styles
        let styles;
        if (this.styleManager.getPendingNewListStyles()) {
            styles = this.styleManager.getPendingNewListStyles();
            this.styleManager.clearPendingNewListStyles();
        } else {
            styles = this.styleManager.getSelectedQuickStyle();
        }

        const listId = Date.now().toString();
        const wordList = {
            id: listId,
            name: name,
            color: styles.backgroundColor, // Keep backward compatibility
            styles: styles,
            words: [],
            enabled: true
        };

        // Use safe storage operation to prevent race conditions
        await this.storageManager.safeStorageOperation(async () => {
            const currentWordLists = await this.storageManager.loadWordLists();
            currentWordLists.push(wordList);
            await this.storageManager.saveWordLists(currentWordLists);
            return { wordLists: currentWordLists };
        }, 'createWordList');
        
        // Notify listeners
        if (this.onWordListCreated) this.onWordListCreated(listId);
        
        this.hideAddListModal();
        if (this.onContentUpdate) this.onContentUpdate();
        
        // Trigger immediate word list refresh
        if (this.onWordListsRefresh) this.onWordListsRefresh();
    }

    async addWords() {
        if (!this.currentListId) return;

        const wordsText = document.getElementById('newWords').value.trim();
        if (!wordsText) {
            if (this.onNotification) this.onNotification('Please enter some words', 'error');
            return;
        }

        // Enhanced input validation
        if (wordsText.length > 5000) {
            if (this.onNotification) this.onNotification('Input too long. Maximum 5000 characters allowed.', 'error');
            return;
        }

        // Parse and validate words
        const rawWords = wordsText
            .split(/[,\n]/)
            .map(word => this.storageManager.sanitizeInput(word.trim(), 100))
            .filter(word => word.length > 0);
            
        if (rawWords.length === 0) {
            if (this.onNotification) this.onNotification('No valid words found', 'error');
            return;
        }
        
        if (rawWords.length > 200) {
            if (this.onNotification) this.onNotification('Too many words. Maximum 200 words per batch.', 'error');
            return;
        }

        // Validate each word
        const validWords = [];
        const invalidWords = [];
        
        for (const word of rawWords) {
            if (this.storageManager.validateWordInput(word)) {
                validWords.push(word);
            } else {
                invalidWords.push(word);
            }
        }
        
        if (invalidWords.length > 0) {
            if (this.onNotification) this.onNotification(`${invalidWords.length} invalid words skipped. Only letters, numbers, and basic punctuation allowed.`, 'warning');
        }
        
        if (validWords.length === 0) {
            if (this.onNotification) this.onNotification('No valid words to add', 'error');
            return;
        }

        // Get current list to check for duplicates
        const wordLists = await this.storageManager.loadWordLists();
        const currentListIndex = wordLists.findIndex(list => list.id === this.currentListId);
        
        if (currentListIndex === -1) {
            if (this.onNotification) this.onNotification('Word list not found', 'error');
            return;
        }
        
        const existingWords = wordLists[currentListIndex].words || [];
        const newWords = [];
        const duplicateWords = [];
        
        for (const word of validWords) {
            if (this.storageManager.checkDuplicateWord(word, existingWords)) {
                duplicateWords.push(word);
            } else {
                newWords.push({ 
                    text: word, 
                    enabled: true, 
                    id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 11)
                });
            }
        }
        
        if (duplicateWords.length > 0) {
            if (this.onNotification) this.onNotification(`${duplicateWords.length} duplicate words skipped`, 'warning');
        }
        
        if (newWords.length === 0) {
            if (this.onNotification) this.onNotification('All words already exist in this list', 'warning');
            return;
        }

        // Use safe storage operation to prevent race conditions
        await this.storageManager.safeStorageOperation(async () => {
            const finalWordLists = await this.storageManager.loadWordLists();
            const finalListIndex = finalWordLists.findIndex(list => list.id === this.currentListId);
            
            if (finalListIndex !== -1) {
                finalWordLists[finalListIndex].words.push(...newWords);
                await this.storageManager.saveWordLists(finalWordLists);
            }
            return { wordLists: finalWordLists };
        }, 'addWords');
        
        this.hideAddWordModal();
        if (this.onContentUpdate) this.onContentUpdate();
        
        // Trigger immediate word list refresh
        if (this.onWordListsRefresh) this.onWordListsRefresh();
        
        // Refresh word counts after a short delay
        if (this.onWordCountsRefresh) {
            setTimeout(() => this.onWordCountsRefresh(), 200);
        }
    }

    // Utility method for HTML escaping
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Event callbacks (to be set by the main popup class)
    setEventCallbacks(callbacks) {
        this.onNotification = callbacks.onNotification;
        this.onWordListCreated = callbacks.onWordListCreated;
        this.onContentUpdate = callbacks.onContentUpdate;
        this.onWordCountsRefresh = callbacks.onWordCountsRefresh;
        this.onStylesUpdated = callbacks.onStylesUpdated;
        this.onWordListsRefresh = callbacks.onWordListsRefresh;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalManager;
} else if (typeof window !== 'undefined') {
    window.ModalManager = ModalManager;
}