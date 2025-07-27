/**
 * Word List Renderer - Handles rendering and interactions of word lists
 */
class WordListRenderer {
    constructor(storageManager, styleManager) {
        this.storageManager = storageManager;
        this.styleManager = styleManager;
        this.wordCounts = {};
        this.settings = { showWordCount: true };
        this.lastExpandedListId = null;
        this.escapeHtml = this.escapeHtml.bind(this);
    }

    async loadWordLists() {
        // Load settings first to get showWordCount setting
        const settingsResult = await this.storageManager.loadAdvancedSettings();
        this.settings = {
            ...this.settings,
            showWordCount: settingsResult.showWordCount
        };
        
        const wordLists = await this.storageManager.loadWordLists();
        
        const container = document.getElementById('wordListsContainer');
        const emptyState = document.getElementById('emptyState');
        const listsCount = document.getElementById('listsCount');

        // Update lists count
        const enabledLists = wordLists.filter(list => list.enabled !== false).length;
        
        if (wordLists.length === 0) {
            listsCount.textContent = '0 active';
            container.style.display = 'none';
            emptyState.style.display = 'flex';
            if (this.onStatusUpdate) this.onStatusUpdate('Create your first word list to get started', 'info');
            return;
        } else {
            listsCount.textContent = `${enabledLists} of ${wordLists.length} active`;
        }

        container.style.display = 'block';
        emptyState.style.display = 'none';
        container.innerHTML = wordLists.map(list => this.renderWordList(list)).join('');
        this.bindWordListEvents();
        
        // Update status based on active lists
        if (enabledLists === 0) {
            if (this.onStatusUpdate) this.onStatusUpdate('All lists are disabled - enable some to start highlighting', 'warning');
        } else {
            const totalWords = wordLists
                .filter(list => list.enabled !== false)
                .reduce((sum, list) => sum + (list.words?.filter(w => w.enabled !== false)?.length || 0), 0);
            if (this.onStatusUpdate) this.onStatusUpdate(`${totalWords} words ready for highlighting`, 'success');
        }
        
        // Expand the last expanded list only if there was one explicitly set
        if (this.lastExpandedListId && wordLists.find(list => list.id === this.lastExpandedListId)) {
            this.expandList(this.lastExpandedListId);
        }

        // Only show loading state for word counts if they should be displayed
        if (this.settings.showWordCount) {
            this.showWordCountsLoading();
            // Load word counts after a short delay
            setTimeout(() => this.loadWordCounts(), 100);
        }
    }

    renderWordList(list) {
        // Get the showWordCount setting from this.settings
        const showWordCount = this.settings?.showWordCount !== false;
        
        const wordsHtml = list.words.map(word => `
            <div class="word-item">
                <div class="word-checkbox">
                    <input type="checkbox" id="word-${word.id}" ${word.enabled ? 'checked' : ''}>
                    <label for="word-${word.id}">${this.escapeHtml(word.text)}</label>
                </div>
                <div class="word-item-right">
                    ${showWordCount ? `<span class="word-count loading" data-word="${this.escapeHtml(word.text)}">...</span>` : ''}
                    <button class="delete-word" data-word-id="${word.id}" data-list-id="${list.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');

        const checkedCount = list.words.filter(w => w.enabled).length;
        const totalCount = list.words.length;
        const allChecked = totalCount > 0 && checkedCount === totalCount;
        const isEnabled = list.enabled !== false;

        // Show check-all-container only if there are words in the list
        const checkAllHtml = totalCount > 0 ? `
            <div class="check-all-container">
                <input type="checkbox" id="checkAll-${list.id}" ${allChecked ? 'checked' : ''}>
                <label for="checkAll-${list.id}">All</label>
            </div>
        ` : '';

        // Search input - only show if there are words in the list
        const searchInputHtml = totalCount > 0 ? `
            <div class="word-search-container">
                <input type="text" class="word-search-input" placeholder="Search words..." data-list-id="${list.id}">
                <i class="fas fa-search search-icon"></i>
            </div>
        ` : '';

        return `
            <div class="word-list" data-list-id="${list.id}" data-enabled="${isEnabled}">
                <div class="word-list-header" data-list-id="${list.id}">
                    <div class="word-list-header-left">
                        <div class="expand-icon">▶</div>
                        <div class="color-indicator" style="background-color: ${list.color}" data-list-id="${list.id}" title="Click to change color"></div>
                        <div class="word-list-title">
                            ${this.escapeHtml(list.name)}
                        </div>
                    </div>
                    <div class="word-list-controls">
                        <button class="btn-small toggle-list ${isEnabled ? 'enabled' : ''}" data-list-id="${list.id}">
                            <i class="fas fa-eye${isEnabled ? '' : '-slash'}"></i>
                        </button>
                        <button class="btn-small delete-list" data-list-id="${list.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="word-list-body">
                    <div class="list-controls">
                        ${checkAllHtml}
                        ${searchInputHtml}
                        <button class="btn-small add-words" data-list-id="${list.id}">
                            <i class="fas fa-plus"></i>
                            Add Words
                        </button>
                    </div>
                    <div class="words-container">
                        ${wordsHtml || '<div style="color: #999; font-size: 11px; text-align: center; padding: 20px;">No words added yet</div>'}
                    </div>
                </div>
            </div>
        `;
    }

    bindWordListEvents() {
        // Expand/collapse list headers
        document.querySelectorAll('.word-list-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking on control buttons or color indicator
                if (e.target.closest('.word-list-controls') || e.target.classList.contains('color-indicator')) {
                    return;
                }
                const listId = header.dataset.listId;
                this.toggleListExpansion(listId);
            });
        });

        // Color indicator click for editing styles
        document.querySelectorAll('.color-indicator').forEach(indicator => {
            indicator.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent header click
                const listId = indicator.dataset.listId;
                this.styleManager.showEditStylesModal(listId, this.storageManager);
            });
        });

        // Toggle word enabled/disabled
        document.querySelectorAll('input[id^="word-"]').forEach(checkbox => {
            checkbox.addEventListener('change', async () => {
                const wordId = checkbox.id.replace('word-', '');
                await this.toggleWord(wordId, checkbox.checked);
            });
        });

        // Check all functionality
        document.querySelectorAll('input[id^="checkAll-"]').forEach(checkbox => {
            checkbox.addEventListener('change', async () => {
                const listId = checkbox.id.replace('checkAll-', '');
                await this.toggleAllWords(listId, checkbox.checked);
            });
        });

        // Add words button
        document.querySelectorAll('.add-words').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.onShowAddWordModal) this.onShowAddWordModal(btn.dataset.listId);
            });
        });

        // Delete word button
        document.querySelectorAll('.delete-word').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.deleteWord(btn.dataset.listId, btn.dataset.wordId);
            });
        });

        // Toggle list enabled/disabled
        document.querySelectorAll('.toggle-list').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent header click
                await this.toggleList(btn.dataset.listId);
            });
        });

        // Delete list
        document.querySelectorAll('.delete-list').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent header click
                if (confirm('Are you sure you want to delete this word list?')) {
                    await this.deleteList(btn.dataset.listId);
                }
            });
        });

        // Search functionality
        document.querySelectorAll('.word-search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const listId = input.dataset.listId;
                const searchTerm = e.target.value.toLowerCase().trim();
                this.filterWords(listId, searchTerm);
            });
        });
    }

    filterWords(listId, searchTerm) {
        const wordList = document.querySelector(`.word-list[data-list-id="${listId}"]`);
        if (!wordList) return;

        const wordItems = wordList.querySelectorAll('.word-item');
        let visibleCount = 0;

        wordItems.forEach(wordItem => {
            const label = wordItem.querySelector('.word-checkbox label');
            if (!label) return;

            const wordText = label.textContent.toLowerCase();
            const isVisible = searchTerm === '' || wordText.includes(searchTerm);
            
            wordItem.style.display = isVisible ? 'flex' : 'none';
            if (isVisible) visibleCount++;
        });

        // Show/hide "no results" message
        this.updateNoResultsMessage(listId, visibleCount, searchTerm);
    }

    updateNoResultsMessage(listId, visibleCount, searchTerm) {
        const wordList = document.querySelector(`.word-list[data-list-id="${listId}"]`);
        if (!wordList) return;

        const wordsContainer = wordList.querySelector('.words-container');
        let noResultsMsg = wordsContainer.querySelector('.no-search-results');

        if (visibleCount === 0 && searchTerm !== '') {
            // Show "no results" message
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-search-results';
                noResultsMsg.style.cssText = 'color: #999; font-size: 12px; text-align: center; padding: 20px; font-style: italic;';
                wordsContainer.appendChild(noResultsMsg);
            }
            noResultsMsg.textContent = `No words found matching "${searchTerm}"`;
            noResultsMsg.style.display = 'block';
        } else {
            // Hide "no results" message
            if (noResultsMsg) {
                noResultsMsg.style.display = 'none';
            }
        }
    }

    toggleListExpansion(listId) {
        const wordList = document.querySelector(`.word-list[data-list-id="${listId}"]`);
        const isCurrentlyExpanded = wordList.classList.contains('expanded');
        
        // Collapse all lists first
        document.querySelectorAll('.word-list').forEach(list => {
            list.classList.remove('expanded');
        });
        
        // If it wasn't expanded, expand it
        if (!isCurrentlyExpanded) {
            wordList.classList.add('expanded');
            this.lastExpandedListId = listId;
            if (this.onSaveSettings) this.onSaveSettings();
        } else {
            this.lastExpandedListId = null;
            if (this.onSaveSettings) this.onSaveSettings();
        }
    }

    expandList(listId) {
        // Collapse all lists first
        document.querySelectorAll('.word-list').forEach(list => {
            list.classList.remove('expanded');
        });
        
        // Expand the specified list
        const wordList = document.querySelector(`.word-list[data-list-id="${listId}"]`);
        if (wordList) {
            wordList.classList.add('expanded');
        }
    }

    // Show loading state for all word counts
    showWordCountsLoading() {
        document.querySelectorAll('.word-count').forEach(countElement => {
            countElement.textContent = '...';
            countElement.classList.add('loading');
            countElement.classList.remove('zero');
        });
    }

    async toggleWord(wordId, enabled) {
        const wordLists = await this.storageManager.loadWordLists();

        for (let list of wordLists) {
            const word = list.words.find(w => w.id.toString() === wordId);
            if (word) {
                word.enabled = enabled;
                break;
            }
        }

        await this.storageManager.saveWordLists(wordLists);
        await this.loadWordLists();
        if (this.onContentUpdate) this.onContentUpdate();
        
        // Refresh word counts after a short delay
        setTimeout(() => this.loadWordCounts(), 200);
    }

    async toggleAllWords(listId, enabled) {
        const wordLists = await this.storageManager.loadWordLists();
        const list = wordLists.find(l => l.id === listId);

        if (list) {
            list.words.forEach(word => word.enabled = enabled);
            await this.storageManager.saveWordLists(wordLists);
            await this.loadWordLists();
            if (this.onContentUpdate) this.onContentUpdate();
            
            // Refresh word counts after a short delay
            setTimeout(() => this.loadWordCounts(), 200);
        }
    }

    async deleteWord(listId, wordId) {
        const wordLists = await this.storageManager.loadWordLists();
        const list = wordLists.find(l => l.id === listId);

        if (list) {
            list.words = list.words.filter(w => w.id.toString() !== wordId);
            await this.storageManager.saveWordLists(wordLists);
            await this.loadWordLists();
            if (this.onContentUpdate) this.onContentUpdate();
        }
    }

    async toggleList(listId) {
        const wordLists = await this.storageManager.loadWordLists();
        const list = wordLists.find(l => l.id === listId);

        if (list) {
            list.enabled = !list.enabled;
            await this.storageManager.saveWordLists(wordLists);
            await this.refreshWordLists();
            if (this.onContentUpdate) this.onContentUpdate();
            
            // Refresh word counts after a short delay
            setTimeout(() => this.loadWordCounts(), 200);
        }
    }

    async deleteList(listId) {
        let wordLists = await this.storageManager.loadWordLists();
        wordLists = wordLists.filter(l => l.id !== listId);

        // If we're deleting the last expanded list, clear the preference
        if (this.lastExpandedListId === listId) {
            this.lastExpandedListId = null;
        }

        await this.storageManager.saveWordLists(wordLists);
        if (this.onSaveSettings) this.onSaveSettings();
        await this.loadWordLists();
        if (this.onContentUpdate) this.onContentUpdate();
    }

    async refreshWordLists() {
        // Store current expansion state
        const currentlyExpanded = [];
        document.querySelectorAll('.word-list.expanded').forEach(list => {
            currentlyExpanded.push(list.dataset.listId);
        });

        const wordLists = await this.storageManager.loadWordLists();
        const container = document.getElementById('wordListsContainer');
        const emptyState = document.getElementById('emptyState');
        const listsCount = document.getElementById('listsCount');

        // Update lists count
        const enabledLists = wordLists.filter(list => list.enabled !== false).length;
        listsCount.textContent = `${enabledLists} of ${wordLists.length} active`;

        if (wordLists.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'flex';
            return;
        }

        container.style.display = 'block';
        emptyState.style.display = 'none';
        container.innerHTML = wordLists.map(list => this.renderWordList(list)).join('');
        this.bindWordListEvents();
        
        // Restore previous expansion state
        currentlyExpanded.forEach(listId => {
            const wordList = document.querySelector(`.word-list[data-list-id="${listId}"]`);
            if (wordList) {
                wordList.classList.add('expanded');
            }
        });

        // Show loading state immediately
        this.showWordCountsLoading();
        
        // Load word counts after a short delay
        setTimeout(() => this.loadWordCounts(), 100);
    }

    async loadWordCounts() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we can access the tab
            if (!tab || !tab.id) {
                this.wordCounts = {};
                this.updateWordCountDisplay();
                return;
            }

            // Check if tab URL is accessible (not chrome:// or extension pages)
            if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://') || tab.url.startsWith('about:'))) {
                this.wordCounts = {};
                this.updateWordCountDisplay();
                return;
            }

            const wordLists = await this.storageManager.loadWordLists();
            const settings = await this.storageManager.loadSettings();
            
            // Collect all words from all lists
            const allWords = [];
            wordLists.forEach(list => {
                // Check if list is enabled (default to true if not set)
                if (list.enabled !== false) {
                    list.words.forEach(word => {
                        // Check if word is enabled (default to true if not set)
                        if (word.enabled !== false && word.text && word.text.trim()) {
                            allWords.push({ text: word.text.trim() });
                        }
                    });
                }
            });

            if (allWords.length === 0) {
                this.wordCounts = {};
                this.updateWordCountDisplay();
                return;
            }
            
            // Function to attempt message sending with proper error handling
            const attemptMessage = async (maxRetries = 2) => {
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        const response = await new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => {
                                reject(new Error('Message timeout'));
                            }, 8000); // 8 second timeout
                            
                            chrome.tabs.sendMessage(tab.id, {
                                action: 'getWordCounts',
                                words: allWords,
                                settings: settings
                            }, (response) => {
                                clearTimeout(timeout);
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    resolve(response);
                                }
                            });
                        });
                        
                        return response;
                        
                    } catch (error) {
                        // Content scripts are already loaded via manifest.json
                        // If first attempt failed, wait before retry
                        if (attempt === 0) {
                            // Wait a moment for content script to be ready
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        // If this was the last attempt, throw the error
                        if (attempt === maxRetries) {
                            throw error;
                        }
                    }
                }
            };
            
            const response = await attemptMessage();
            
            if (response && response.counts && typeof response.counts === 'object') {
                this.wordCounts = response.counts;
            } else {
                this.wordCounts = {};
            }
            
            this.updateWordCountDisplay();
            
        } catch (error) {
            // Content script not available or tab can't be accessed
            this.wordCounts = {};
            this.updateWordCountDisplay();
        }
    }

    updateWordCountDisplay() {
        document.querySelectorAll('.word-count').forEach(countElement => {
            const wordText = countElement.dataset.word;
            
            if (!wordText) {
                countElement.textContent = '0';
                countElement.classList.remove('loading');
                countElement.classList.add('zero');
                return;
            }
            
            // Clean the word text to match what we're searching for
            const cleanWordText = wordText.trim();
            const count = this.wordCounts[cleanWordText] || this.wordCounts[wordText];
            
            // Handle undefined/null counts
            if (count === undefined || count === null) {
                countElement.textContent = '0';
                countElement.classList.remove('loading');
                countElement.classList.add('zero');
                return;
            }
            
            const finalCount = parseInt(count, 10) || 0;
            countElement.textContent = finalCount.toString();
            countElement.classList.remove('loading', 'zero');
            
            if (finalCount === 0) {
                countElement.classList.add('zero');
            }
        });
    }

    // Add new method to update word counts visibility
    updateWordCountsVisibility() {
        const showWordCount = this.settings?.showWordCount !== false;
        document.querySelectorAll('.word-count').forEach(countElement => {
            if (showWordCount) {
                countElement.style.display = '';
            } else {
                countElement.style.display = 'none';
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Setters for callback functions
    setLastExpandedListId(listId) {
        this.lastExpandedListId = listId;
    }

    getLastExpandedListId() {
        return this.lastExpandedListId;
    }

    // Event callbacks (to be set by the main popup class)
    setEventCallbacks(callbacks) {
        this.onStatusUpdate = callbacks.onStatusUpdate;
        this.onSaveSettings = callbacks.onSaveSettings;
        this.onContentUpdate = callbacks.onContentUpdate;
        this.onShowAddWordModal = callbacks.onShowAddWordModal;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WordListRenderer;
} else if (typeof window !== 'undefined') {
    window.WordListRenderer = WordListRenderer;
}