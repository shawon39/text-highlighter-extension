class TextHighlighterPopup {
    constructor() {
        this.currentListId = null;
        this.currentEditColorListId = null;
        this.currentEditStylesListId = null;
        this.lastExpandedListId = null;
        this.wordCounts = {};
        this.pendingNewListStyles = null;
        this.settings = {
            showWordCount: true
        };
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.bindEvents();
        await this.loadWordLists();
    }

    async loadSettings() {
        const result = await chrome.storage.sync.get({
            enableHighlighting: true,
            caseSensitive: false,
            wholeWordsOnly: false,
            lastExpandedListId: null
        });

        document.getElementById('enableHighlighting').checked = result.enableHighlighting;
        document.getElementById('caseSensitive').checked = result.caseSensitive;
        document.getElementById('wholeWordsOnly').checked = result.wholeWordsOnly;
        this.lastExpandedListId = result.lastExpandedListId;
        
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
        document.getElementById('addListBtn').addEventListener('click', this.showAddListModal.bind(this));

        // Modal events
        document.getElementById('createListBtn').addEventListener('click', this.createWordList.bind(this));
        document.getElementById('cancelListBtn').addEventListener('click', this.hideAddListModal.bind(this));
        document.getElementById('addWordsBtn').addEventListener('click', this.addWords.bind(this));
        document.getElementById('cancelWordBtn').addEventListener('click', this.hideAddWordModal.bind(this));
        document.getElementById('saveStylesBtn').addEventListener('click', this.saveEditedStyles.bind(this));
        document.getElementById('cancelEditStylesBtn').addEventListener('click', this.hideEditStylesModal.bind(this));
        document.getElementById('resetStylesBtn').addEventListener('click', this.resetStylesToDefault.bind(this));

        // Advanced settings modal events
        document.getElementById('closeAdvancedBtn').addEventListener('click', this.hideAdvancedSettingsModal.bind(this));
        document.getElementById('resetAdvancedBtn').addEventListener('click', this.resetAdvancedSettings.bind(this));

        // New list style customization
        document.getElementById('customizeNewListStyle').addEventListener('click', this.openStyleCustomization.bind(this));
        
        // Quick style selection for new lists
        this.bindQuickStyleEvents();

        // Close modals when clicking X
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Check which modal this close button belongs to
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    if (modal.id === 'advancedSettingsModal') {
                        this.hideAdvancedSettingsModal();
                    } else {
                        this.hideModals();
                    }
                }
            });
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                if (e.target.id === 'advancedSettingsModal') {
                    this.hideAdvancedSettingsModal();
                } else {
                    this.hideModals();
                }
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape key closes modals
            if (e.key === 'Escape') {
                // Check if advanced settings modal is open
                if (document.getElementById('advancedSettingsModal').style.display === 'block') {
                    this.hideAdvancedSettingsModal();
                } else {
                    this.hideModals();
                }
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

        // Update toggle status icon when the toggle changes
        document.getElementById('enableHighlighting').addEventListener('change', () => {
            this.updateToggleStatusIcon();
        });

        // Advanced settings button
        document.getElementById('advancedSettingsBtn').addEventListener('click', this.showAdvancedSettingsModal.bind(this));
    }

    async saveSettings() {
        const settings = {
            enableHighlighting: document.getElementById('enableHighlighting').checked,
            caseSensitive: document.getElementById('caseSensitive').checked,
            wholeWordsOnly: document.getElementById('wholeWordsOnly').checked,
            lastExpandedListId: this.lastExpandedListId
        };

        await chrome.storage.sync.set(settings);
        this.updateContentScript();
        
        // Refresh word counts when settings change
        await this.loadWordCounts();
    }

    async updateContentScript() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { action: 'updateHighlighting' });
        } catch (error) {
            // Tab might not have content script loaded
        }
    }

    async loadWordLists() {
        // Load settings first to get showWordCount setting
        const settingsResult = await chrome.storage.sync.get({
            showWordCount: true
        });
        this.settings = {
            ...this.settings,
            showWordCount: settingsResult.showWordCount
        };
        
        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        const container = document.getElementById('wordListsContainer');
        const emptyState = document.getElementById('emptyState');
        const listsCount = document.getElementById('listsCount');

        // Update lists count
        const enabledLists = wordLists.filter(list => list.enabled !== false).length;
        
        if (wordLists.length === 0) {
            listsCount.textContent = '0 lists active';
            container.style.display = 'none';
            emptyState.style.display = 'flex';
            this.updateStatusBar('Create your first word list to get started', 'info');
            return;
        } else {
            listsCount.textContent = `${enabledLists} of ${wordLists.length} lists active`;
        }

        container.style.display = 'block';
        emptyState.style.display = 'none';
        container.innerHTML = wordLists.map(list => this.renderWordList(list)).join('');
        this.bindWordListEvents();
        
        // Update status based on active lists
        if (enabledLists === 0) {
            this.updateStatusBar('All lists are disabled - enable some to start highlighting', 'warning');
        } else {
            const totalWords = wordLists
                .filter(list => list.enabled !== false)
                .reduce((sum, list) => sum + (list.words?.filter(w => w.enabled !== false)?.length || 0), 0);
            this.updateStatusBar(`${totalWords} words ready for highlighting`, 'success');
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
                this.showEditStylesModal(listId);
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
                this.showAddWordModal(btn.dataset.listId);
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
            this.saveSettings();
        } else {
            this.lastExpandedListId = null;
            this.saveSettings();
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
        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;

        for (let list of wordLists) {
            const word = list.words.find(w => w.id.toString() === wordId);
            if (word) {
                word.enabled = enabled;
                break;
            }
        }

        await chrome.storage.sync.set({ wordLists });
        await this.loadWordLists();
        this.updateContentScript();
        
        // Refresh word counts after a short delay
        setTimeout(() => this.loadWordCounts(), 200);
    }

    async toggleAllWords(listId, enabled) {
        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        const list = wordLists.find(l => l.id === listId);

        if (list) {
            list.words.forEach(word => word.enabled = enabled);
            await chrome.storage.sync.set({ wordLists });
            await this.loadWordLists();
            this.updateContentScript();
            
            // Refresh word counts after a short delay
            setTimeout(() => this.loadWordCounts(), 200);
        }
    }

    async deleteWord(listId, wordId) {
        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        const list = wordLists.find(l => l.id === listId);

        if (list) {
            list.words = list.words.filter(w => w.id.toString() !== wordId);
            await chrome.storage.sync.set({ wordLists });
            await this.loadWordLists();
            this.updateContentScript();
        }
    }

    async toggleList(listId) {
        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        const list = wordLists.find(l => l.id === listId);

        if (list) {
            list.enabled = !list.enabled;
            await chrome.storage.sync.set({ wordLists });
            await this.refreshWordLists();
            this.updateContentScript();
            
            // Refresh word counts after a short delay
            setTimeout(() => this.loadWordCounts(), 200);
        }
    }

    async deleteList(listId) {
        const result = await chrome.storage.sync.get({ wordLists: [] });
        let wordLists = result.wordLists;
        wordLists = wordLists.filter(l => l.id !== listId);

        // If we're deleting the last expanded list, clear the preference
        if (this.lastExpandedListId === listId) {
            this.lastExpandedListId = null;
        }

        await chrome.storage.sync.set({ wordLists });
        await this.saveSettings();
        await this.loadWordLists();
        this.updateContentScript();
    }

    async refreshWordLists() {
        // Store current expansion state
        const currentlyExpanded = [];
        document.querySelectorAll('.word-list.expanded').forEach(list => {
            currentlyExpanded.push(list.dataset.listId);
        });

        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        const container = document.getElementById('wordListsContainer');
        const emptyState = document.getElementById('emptyState');
        const listsCount = document.getElementById('listsCount');

        // Update lists count
        const enabledLists = wordLists.filter(list => list.enabled !== false).length;
        listsCount.textContent = `${wordLists.length} list${wordLists.length !== 1 ? 's' : ''}${enabledLists !== wordLists.length ? ` (${enabledLists} enabled)` : ''}`;

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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    // ===== NEW STYLING SYSTEM FUNCTIONS =====

    getDefaultStyles() {
        return {
            backgroundColor: '#ffd700',
            color: '#333333',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            borderWidth: 0,
            borderStyle: 'none',
            borderColor: '#000000',
            textTransform: 'none',
            paddingTop: 2,
            paddingRight: 4,
            paddingBottom: 2,
            paddingLeft: 4,
            borderRadius: 6
        };
    }

    getPresetStyles(presetName) {
        const presets = {
            default: {
                backgroundColor: '#ffd700',
                color: '#333333',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: '#000000',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            important: {
                backgroundColor: '#ff5722',
                color: '#ffffff',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: '#000000',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            success: {
                backgroundColor: '#4caf50',
                color: '#ffffff',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: '#000000',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            warning: {
                backgroundColor: '#ff9800',
                color: '#ffffff',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: '#000000',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            info: {
                backgroundColor: '#2196f3',
                color: '#ffffff',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: '#000000',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            subtle: {
                backgroundColor: '#f5f5f5',
                color: '#666666',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#dddddd',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            underline: {
                backgroundColor: 'transparent',
                color: '#7c3aed',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'underline',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: '#000000',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            },
            border: {
                backgroundColor: 'transparent',
                color: '#e74c3c',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: 'none',
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: '#e74c3c',
                textTransform: 'none',
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                paddingLeft: 4,
                borderRadius: 6
            }
        };
        return presets[presetName] || presets.default;
    }

    loadStylesIntoModal(styles) {
        // Extract hex color from gradient if needed
        let backgroundColor = styles.backgroundColor;
        if (backgroundColor.includes('gradient')) {
            // Extract the first hex color from the gradient
            const hexMatch = backgroundColor.match(/#[0-9a-fA-F]{6}/);
            backgroundColor = hexMatch ? hexMatch[0] : '#ffeb3b';
        }
        
        // Ensure color inputs are synchronized
        const bgColorInput = document.getElementById('editBackgroundColor');
        const bgColorText = document.getElementById('editBackgroundColorText');
        const textColorInput = document.getElementById('editTextColor');
        const textColorText = document.getElementById('editTextColorText');
        
        if (bgColorInput) bgColorInput.value = backgroundColor;
        if (bgColorText) bgColorText.value = backgroundColor;
        if (textColorInput) textColorInput.value = styles.color;
        if (textColorText) textColorText.value = styles.color;
        document.getElementById('editFontWeight').value = styles.fontWeight;
        document.getElementById('editFontStyle').value = styles.fontStyle;
        
        // Handle text decoration checkboxes
        const decorations = styles.textDecoration.split(' ');
        document.getElementById('editUnderline').checked = decorations.includes('underline');
        document.getElementById('editStrikethrough').checked = decorations.includes('line-through');
        document.getElementById('editOverline').checked = decorations.includes('overline');
        
        document.getElementById('editBorderWidth').value = styles.borderWidth;
        document.getElementById('editBorderStyle').value = styles.borderStyle;
        document.getElementById('editBorderColor').value = styles.borderColor;
        document.getElementById('editTextTransform').value = styles.textTransform;
        document.getElementById('editPaddingTop').value = styles.paddingTop;
        document.getElementById('editPaddingRight').value = styles.paddingRight;
        document.getElementById('editPaddingBottom').value = styles.paddingBottom;
        document.getElementById('editPaddingLeft').value = styles.paddingLeft;
        document.getElementById('editBorderRadius').value = styles.borderRadius;
    }

    getCurrentStylesFromModal() {
        const decorations = [];
        if (document.getElementById('editUnderline').checked) decorations.push('underline');
        if (document.getElementById('editStrikethrough').checked) decorations.push('line-through');
        if (document.getElementById('editOverline').checked) decorations.push('overline');
        
        return {
            backgroundColor: document.getElementById('editBackgroundColor').value,
            color: document.getElementById('editTextColor').value,
            fontWeight: document.getElementById('editFontWeight').value,
            fontStyle: document.getElementById('editFontStyle').value,
            textDecoration: decorations.length > 0 ? decorations.join(' ') : 'none',
            borderWidth: parseInt(document.getElementById('editBorderWidth').value) || 0,
            borderStyle: document.getElementById('editBorderStyle').value,
            borderColor: document.getElementById('editBorderColor').value,
            textTransform: document.getElementById('editTextTransform').value,
            paddingTop: parseInt(document.getElementById('editPaddingTop').value) || 0,
            paddingRight: parseInt(document.getElementById('editPaddingRight').value) || 0,
            paddingBottom: parseInt(document.getElementById('editPaddingBottom').value) || 0,
            paddingLeft: parseInt(document.getElementById('editPaddingLeft').value) || 0,
            borderRadius: parseInt(document.getElementById('editBorderRadius').value) || 0
        };
    }

    updateStylePreview() {
        const styles = this.getCurrentStylesFromModal();
        const preview = document.getElementById('stylePreviewText');
        
        let cssStyle = `
            background: ${styles.backgroundColor};
            color: ${styles.color};
            font-weight: ${styles.fontWeight};
            font-style: ${styles.fontStyle};
            text-decoration: ${styles.textDecoration};
            text-transform: ${styles.textTransform};
            padding: ${styles.paddingTop}px ${styles.paddingRight}px ${styles.paddingBottom}px ${styles.paddingLeft}px;
            border-radius: ${styles.borderRadius}px;
        `;
        
        if (styles.borderWidth > 0) {
            cssStyle += `border: ${styles.borderWidth}px ${styles.borderStyle} ${styles.borderColor};`;
        } else {
            cssStyle += 'border: none;';
        }
        
        preview.style.cssText = cssStyle;
    }

    bindStyleInputEvents() {
        // Remove any existing listeners first
        this.unbindStyleInputEvents();
        
        // Color inputs
        this.boundColorInputHandler = () => this.updateStylePreview();
        document.getElementById('editBackgroundColor').addEventListener('input', this.boundColorInputHandler);
        document.getElementById('editTextColor').addEventListener('input', this.boundColorInputHandler);
        
        // Text inputs for colors
        this.boundColorTextHandler = (e) => {
            const colorInput = e.target.id === 'editBackgroundColorText' ? 
                document.getElementById('editBackgroundColor') : 
                document.getElementById('editTextColor');
            colorInput.value = e.target.value;
            this.updateStylePreview();
        };
        document.getElementById('editBackgroundColorText').addEventListener('input', this.boundColorTextHandler);
        document.getElementById('editTextColorText').addEventListener('input', this.boundColorTextHandler);
        
        // Other style inputs
        const styleInputs = [
            'editFontWeight', 'editFontStyle', 'editUnderline', 'editStrikethrough', 'editOverline',
            'editBorderWidth', 'editBorderStyle', 'editBorderColor', 'editTextTransform',
            'editPaddingTop', 'editPaddingRight', 'editPaddingBottom', 'editPaddingLeft', 'editBorderRadius'
        ];
        
        this.boundStyleInputHandler = () => this.updateStylePreview();
        styleInputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', this.boundStyleInputHandler);
                element.addEventListener('change', this.boundStyleInputHandler);
            }
        });
        
        // Preset buttons
        this.boundPresetHandler = (e) => {
            const presetName = e.target.closest('.preset-btn').dataset.preset;
            const presetStyles = this.getPresetStyles(presetName);
            this.loadStylesIntoModal(presetStyles);
            this.updateStylePreview();
            
            // Update active state
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
            e.target.closest('.preset-btn').classList.add('active');
        };
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', this.boundPresetHandler);
        });
    }

    unbindStyleInputEvents() {
        if (this.boundColorInputHandler) {
            document.getElementById('editBackgroundColor').removeEventListener('input', this.boundColorInputHandler);
            document.getElementById('editTextColor').removeEventListener('input', this.boundColorInputHandler);
        }
        
        if (this.boundColorTextHandler) {
            document.getElementById('editBackgroundColorText').removeEventListener('input', this.boundColorTextHandler);
            document.getElementById('editTextColorText').removeEventListener('input', this.boundColorTextHandler);
        }
        
        if (this.boundStyleInputHandler) {
            const styleInputs = [
                'editFontWeight', 'editFontStyle', 'editUnderline', 'editStrikethrough', 'editOverline',
                'editBorderWidth', 'editBorderStyle', 'editBorderColor', 'editTextTransform',
                'editPaddingTop', 'editPaddingRight', 'editPaddingBottom', 'editPaddingLeft', 'editBorderRadius'
            ];
            
            styleInputs.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.removeEventListener('input', this.boundStyleInputHandler);
                    element.removeEventListener('change', this.boundStyleInputHandler);
                }
            });
        }
        
        if (this.boundPresetHandler) {
            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.removeEventListener('click', this.boundPresetHandler);
            });
        }
    }

    resetStylesToDefault() {
        try {
            const defaultStyles = this.getDefaultStyles();
            this.loadStylesIntoModal(defaultStyles);
            this.updateStylePreview();
            
            // Reset preset button selection to default
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
            const defaultBtn = document.querySelector('.preset-btn[data-preset="default"]');
            if (defaultBtn) {
                defaultBtn.classList.add('active');
            }
            
            // Show brief confirmation
            this.showNotification('Styles reset to default!', 'success');
        } catch (error) {
            console.error('Error resetting styles:', error);
            this.showNotification('Error resetting styles', 'error');
        }
    }

    bindQuickStyleEvents() {
        document.querySelectorAll('.quick-style-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active state
                document.querySelectorAll('.quick-style-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    openStyleCustomization() {
        // Get currently selected style preset
        const activeBtn = document.querySelector('.quick-style-btn.active');
        const presetName = activeBtn ? activeBtn.dataset.style : 'default';
        const presetStyles = this.getPresetStyles(presetName);
        
        this.currentEditStylesListId = 'new'; // Special ID for new list
        this.loadStylesIntoModal(presetStyles);
        document.getElementById('editStylesModal').style.display = 'block';
        this.updateStylePreview();
        this.bindStyleInputEvents();
    }

    // Advanced Settings Modal Functions
    async showAdvancedSettingsModal() {
        await this.loadAdvancedSettings();
        this.bindAdvancedSettingsEvents();
        document.getElementById('advancedSettingsModal').style.display = 'block';
    }

    hideAdvancedSettingsModal() {
        document.getElementById('advancedSettingsModal').style.display = 'none';
        this.unbindAdvancedSettingsEvents();
    }

    async loadAdvancedSettings() {
        const result = await chrome.storage.sync.get({
            websiteRule: 'all',
            includeWebsites: [],
            excludeWebsites: [],
            enableRealTimeHighlighting: true,
            maxWordsPerPage: 10000,
            showWordCount: true,
            highlightOnPageLoad: true,
            highlightAnimation: 'normal',
            enableKeyboardShortcuts: true
        });

        // Update settings in memory
        this.settings = {
            ...this.settings,
            showWordCount: result.showWordCount
        };

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
        document.getElementById('enableRealTimeHighlighting').checked = result.enableRealTimeHighlighting;
        document.getElementById('maxWordsPerPage').value = result.maxWordsPerPage;
        document.getElementById('showWordCount').checked = result.showWordCount;
        document.getElementById('highlightOnPageLoad').checked = result.highlightOnPageLoad;
        document.getElementById('highlightAnimation').value = result.highlightAnimation;
        document.getElementById('enableKeyboardShortcuts').checked = result.enableKeyboardShortcuts;
        
        // Update word counts visibility based on showWordCount setting
        this.updateWordCountsVisibility();
        
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
            console.log('Could not load page statistics:', error);
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

    setupAutoSaveListeners() {
        // Auto-save for website rules
        document.querySelectorAll('input[name="websiteRule"]').forEach(radio => {
            radio.addEventListener('change', () => this.autoSaveAdvancedSettings());
        });

        // Auto-save for checkboxes
        const checkboxIds = [
            'enableRealTimeHighlighting',
            'showWordCount',
            'highlightOnPageLoad',
            'enableKeyboardShortcuts'
        ];
        
        checkboxIds.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.autoSaveAdvancedSettings());
        });

        // Auto-save for select
        document.getElementById('highlightAnimation').addEventListener('change', () => this.autoSaveAdvancedSettings());
    }

    bindAdvancedSettingsEvents() {
        // Website rule radio buttons
        this.boundWebsiteRuleHandler = (e) => {
            this.updateWebsiteContainers(e.target.value);
            this.autoSaveAdvancedSettings(); // Auto-save when website rule changes
        };
        document.querySelectorAll('input[name="websiteRule"]').forEach(radio => {
            radio.addEventListener('change', this.boundWebsiteRuleHandler);
        });

        // Add website buttons
        this.boundAddIncludeHandler = () => this.addWebsite('include');
        this.boundAddExcludeHandler = () => this.addWebsite('exclude');
        document.getElementById('addIncludeWebsite').addEventListener('click', this.boundAddIncludeHandler);
        document.getElementById('addExcludeWebsite').addEventListener('click', this.boundAddExcludeHandler);

        // Website input enter key
        this.boundWebsiteInputHandler = (e) => {
            if (e.key === 'Enter') {
                const type = e.target.id.includes('include') ? 'include' : 'exclude';
                this.addWebsite(type);
            }
        };
        document.getElementById('includeWebsiteInput').addEventListener('keydown', this.boundWebsiteInputHandler);
        document.getElementById('excludeWebsiteInput').addEventListener('keydown', this.boundWebsiteInputHandler);

        // Remove website buttons (delegated)
        this.boundRemoveWebsiteHandler = (e) => {
            if (e.target.closest('.website-item-remove')) {
                const button = e.target.closest('.website-item-remove');
                const website = button.dataset.website;
                const type = button.dataset.type;
                this.removeWebsite(type, website);
            }
        };
        document.getElementById('includeWebsiteList').addEventListener('click', this.boundRemoveWebsiteHandler);
        document.getElementById('excludeWebsiteList').addEventListener('click', this.boundRemoveWebsiteHandler);

        // Data management buttons
        this.boundExportHandler = () => this.exportSettings();
        this.boundImportHandler = () => this.importSettings();
        this.boundResetAllHandler = () => this.resetAllSettings();
        document.getElementById('exportSettingsBtn').addEventListener('click', this.boundExportHandler);
        document.getElementById('importSettingsBtn').addEventListener('click', this.boundImportHandler);
        document.getElementById('resetAllSettingsBtn').addEventListener('click', this.boundResetAllHandler);

        // File input for import
        this.boundFileInputHandler = (e) => this.handleImportFile(e);
        document.getElementById('importFileInput').addEventListener('change', this.boundFileInputHandler);

        // Max words input validation and auto-save
        this.boundMaxWordsHandler = (e) => this.validateMaxWordsInput(e);
        document.getElementById('maxWordsPerPage').addEventListener('input', this.boundMaxWordsHandler);
        document.getElementById('maxWordsPerPage').addEventListener('blur', this.boundMaxWordsHandler);
        document.getElementById('maxWordsPerPage').addEventListener('change', () => this.autoSaveAdvancedSettings());

        // Auto-save event listeners for all Advanced Settings inputs
        this.setupAutoSaveListeners();
    }

    unbindAdvancedSettingsEvents() {
        if (this.boundWebsiteRuleHandler) {
            document.querySelectorAll('input[name="websiteRule"]').forEach(radio => {
                radio.removeEventListener('change', this.boundWebsiteRuleHandler);
            });
        }

        if (this.boundAddIncludeHandler) {
            document.getElementById('addIncludeWebsite').removeEventListener('click', this.boundAddIncludeHandler);
        }
        if (this.boundAddExcludeHandler) {
            document.getElementById('addExcludeWebsite').removeEventListener('click', this.boundAddExcludeHandler);
        }

        if (this.boundWebsiteInputHandler) {
            document.getElementById('includeWebsiteInput').removeEventListener('keydown', this.boundWebsiteInputHandler);
            document.getElementById('excludeWebsiteInput').removeEventListener('keydown', this.boundWebsiteInputHandler);
        }

        if (this.boundRemoveWebsiteHandler) {
            document.getElementById('includeWebsiteList').removeEventListener('click', this.boundRemoveWebsiteHandler);
            document.getElementById('excludeWebsiteList').removeEventListener('click', this.boundRemoveWebsiteHandler);
        }

        if (this.boundExportHandler) {
            document.getElementById('exportSettingsBtn').removeEventListener('click', this.boundExportHandler);
        }
        if (this.boundImportHandler) {
            document.getElementById('importSettingsBtn').removeEventListener('click', this.boundImportHandler);
        }
        if (this.boundResetAllHandler) {
            document.getElementById('resetAllSettingsBtn').removeEventListener('click', this.boundResetAllHandler);
        }

        if (this.boundFileInputHandler) {
            document.getElementById('importFileInput').removeEventListener('change', this.boundFileInputHandler);
        }

        if (this.boundMaxWordsHandler) {
            document.getElementById('maxWordsPerPage').removeEventListener('input', this.boundMaxWordsHandler);
            document.getElementById('maxWordsPerPage').removeEventListener('blur', this.boundMaxWordsHandler);
        }

        // Clear auto-save timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
    }

    addWebsite(type) {
        const input = document.getElementById(`${type}WebsiteInput`);
        const website = input.value.trim();
        
        if (!website) {
            this.showNotification('Please enter a website URL', 'error');
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
            this.showNotification('Please enter a valid domain (e.g., example.com)', 'error');
            return;
        }

        // Check for minimum domain length
        if (cleanUrl.length < 3) {
            this.showNotification('Domain name too short', 'error');
            return;
        }

        // Get current websites
        chrome.storage.sync.get({ [`${type}Websites`]: [] }, (result) => {
            const websites = result[`${type}Websites`];
            if (websites.includes(cleanUrl)) {
                this.showNotification('Website already exists in the list', 'error');
                input.value = '';
                return;
            }
            
            websites.push(cleanUrl);
            chrome.storage.sync.set({ [`${type}Websites`]: websites }, () => {
                this.loadWebsiteList(type, websites);
                input.value = '';
                this.showNotification(`Website added to ${type} list`, 'success');
                // Auto-save and update content script
                this.updateContentScript();
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
                    this.updateContentScript();
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
                    enableRealTimeHighlighting: document.getElementById('enableRealTimeHighlighting').checked,
                    maxWordsPerPage: parseInt(document.getElementById('maxWordsPerPage').value) || 10000,
                    showWordCount: document.getElementById('showWordCount').checked,
                    highlightOnPageLoad: document.getElementById('highlightOnPageLoad').checked,
                    highlightAnimation: document.getElementById('highlightAnimation').value,
                    enableKeyboardShortcuts: document.getElementById('enableKeyboardShortcuts').checked
                };

                await chrome.storage.sync.set(settings);
                
                // Update this.settings
                this.settings = {
                    ...this.settings,
                    showWordCount: settings.showWordCount
                };

                // Update word counts visibility based on showWordCount setting
                this.updateWordCountsVisibility();
                
                // Update content script with new settings
                this.updateContentScript();
                
                // Show subtle success indicator
                this.showAutoSaveIndicator();
            }, 500); // 500ms debounce
        } catch (error) {
            console.error('Error auto-saving advanced settings:', error);
        }
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
            enableRealTimeHighlighting: true,
            maxWordsPerPage: 10000,
            showWordCount: true,
            highlightOnPageLoad: true,
            highlightAnimation: 'normal',
            enableKeyboardShortcuts: true
        };

        await chrome.storage.sync.set(defaultSettings);
        await this.loadAdvancedSettings();
        
        // Update content script with new settings
        this.updateContentScript();
        
        this.showNotification('Advanced settings reset to defaults! Word lists preserved.');
    }

    async exportSettings() {
        try {
            const allData = await chrome.storage.sync.get(null);
            const exportData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                settings: allData
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `smart-highlighter-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Settings exported successfully!');
        } catch (error) {
            this.showNotification('Failed to export settings: ' + error.message, 'error');
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

            // Validate structure
            if (!importData || typeof importData !== 'object') {
                throw new Error('Invalid settings file structure');
            }

            if (!importData.settings || typeof importData.settings !== 'object') {
                throw new Error('Settings data not found in file');
            }

            // Validate version compatibility (if version exists)
            if (importData.version && !this.isVersionCompatible(importData.version)) {
                if (!confirm('This settings file may be from a different version. Import anyway?')) {
                    return;
                }
            }

            // Show import preview
            const previewInfo = this.generateImportPreview(importData.settings);
            const confirmMessage = `Import settings?\n\n${previewInfo}\n\nThis will overwrite your current settings.`;
            
            if (!confirm(confirmMessage)) {
                return;
            }

            // Validate individual settings before import
            const validatedSettings = this.validateImportSettings(importData.settings);

            await chrome.storage.sync.clear();
            await chrome.storage.sync.set(validatedSettings);
            
            // Reload the popup
            await this.loadSettings();
            await this.loadWordLists();
            await this.loadAdvancedSettings();

            this.showNotification('Settings imported successfully!');
        } catch (error) {
            this.showNotification('Failed to import settings: ' + error.message, 'error');
        }

        // Clear the file input
        event.target.value = '';
    }

    isVersionCompatible(version) {
        // Simple version compatibility check
        const majorVersion = version.split('.')[0];
        return majorVersion === '1'; // Only accept version 1.x
    }

    generateImportPreview(settings) {
        const items = [];
        
        if (settings.wordLists && Array.isArray(settings.wordLists)) {
            items.push(`• ${settings.wordLists.length} word list(s)`);
        }
        
        if (settings.enableHighlighting !== undefined) {
            items.push(`• Highlighting: ${settings.enableHighlighting ? 'enabled' : 'disabled'}`);
        }
        
        if (settings.websiteRule) {
            items.push(`• Website rule: ${settings.websiteRule}`);
        }
        
        return items.length > 0 ? items.join('\n') : 'No recognizable settings found';
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
        validated.highlightOnPageLoad = typeof settings.highlightOnPageLoad === 'boolean' ? 
            settings.highlightOnPageLoad : true;
        validated.enableKeyboardShortcuts = typeof settings.enableKeyboardShortcuts === 'boolean' ? 
            settings.enableKeyboardShortcuts : true;
        validated.enableRealTimeHighlighting = typeof settings.enableRealTimeHighlighting === 'boolean' ? 
            settings.enableRealTimeHighlighting : true;
        
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

    validateMaxWordsInput(event) {
        const input = event.target;
        let value = parseInt(input.value);
        
        // Remove any non-numeric characters
        input.value = input.value.replace(/[^0-9]/g, '');
        
        if (event.type === 'blur') {
            // On blur, enforce min/max limits
            if (isNaN(value) || value < 100) {
                input.value = '100';
                this.showNotification('Minimum value is 100 words', 'error');
            } else if (value > 10000) {
                input.value = '10000';
                this.showNotification('Maximum value is 10,000 words', 'error');
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
            // Clear ALL storage (both sync and local)
            await chrome.storage.sync.clear();
            await chrome.storage.local.clear();
            
            // Reset all in-memory variables
            this.lastExpandedListId = null;
            this.currentListId = null;
            this.currentEditStylesListId = null;
            this.pendingNewListStyles = null;
            this.settings = {};
            
            // Reset all UI elements to default states
            this.resetUIToDefaults();
            
            // Reload all components with fresh defaults
            await this.loadSettings();
            await this.loadWordLists();
            await this.loadAdvancedSettings();
            
            // Update content script to clear any highlighting
            this.updateContentScript();
            
            // Close any open modals
            this.hideModals();
            this.hideAdvancedSettingsModal();

            this.showNotification('Factory reset complete! Extension restored to defaults.');
        } catch (error) {
            console.error('Error during factory reset:', error);
            this.showNotification('Error during factory reset: ' + error.message, 'error');
        }
    }

    resetUIToDefaults() {
        // Reset main settings checkboxes
        document.getElementById('enableHighlighting').checked = true;
        document.getElementById('caseSensitive').checked = false;
        document.getElementById('wholeWordsOnly').checked = false;
        
        // Reset advanced settings to defaults
        document.getElementById('websiteRuleAll').checked = true;
        document.getElementById('websiteRuleInclude').checked = false;
        document.getElementById('websiteRuleExclude').checked = false;
        document.getElementById('enableRealTimeHighlighting').checked = true;
        document.getElementById('maxWordsPerPage').value = 10000;
        document.getElementById('showWordCount').checked = true;
        document.getElementById('highlightOnPageLoad').checked = true;
        document.getElementById('highlightAnimation').value = 'normal';
        document.getElementById('enableKeyboardShortcuts').checked = true;
        
        // Clear website lists
        document.getElementById('includeWebsiteList').innerHTML = '';
        document.getElementById('excludeWebsiteList').innerHTML = '';
        document.getElementById('includeWebsiteInput').value = '';
        document.getElementById('excludeWebsiteInput').value = '';
        
        // Hide website containers
        document.getElementById('includeWebsiteContainer').style.display = 'none';
        document.getElementById('excludeWebsiteContainer').style.display = 'none';
        
        // Clear modal inputs
        document.getElementById('newListName').value = '';
        document.getElementById('newWords').value = '';
        
        // Reset style modal to defaults
        const defaultStyles = this.getDefaultStyles();
        this.loadStylesIntoModal(defaultStyles);
        
        // Reset quick style selection
        document.querySelectorAll('.quick-style-btn').forEach(btn => btn.classList.remove('active'));
        const defaultBtn = document.querySelector('.quick-style-btn[data-style="default"]');
        if (defaultBtn) {
            defaultBtn.classList.add('active');
        }
        
        // Update toggle status icon
        this.updateToggleStatusIcon();
        
        // Clear status bar
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.style.display = 'none';
        }
        
        // Hide current page stats
        const currentPageStats = document.getElementById('currentPageStats');
        if (currentPageStats) {
            currentPageStats.style.display = 'none';
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

    showEditStylesModal(listId) {
        this.currentEditStylesListId = listId;
        
        // Get current styles
        chrome.storage.sync.get({ wordLists: [] }).then(result => {
            const list = result.wordLists.find(l => l.id === listId);
            if (list) {
                const currentStyles = list.styles || {
                    backgroundColor: list.color || '#ffeb3b',
                    color: '#000000',
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    textDecoration: 'none',
                    borderWidth: 0,
                    borderStyle: 'none',
                    borderColor: '#000000',
                    textTransform: 'none',
                    paddingTop: 1,
                    paddingRight: 2,
                    paddingBottom: 1,
                    paddingLeft: 2,
                    borderRadius: 2
                };
                this.loadStylesIntoModal(currentStyles);
                this.updateStylePreview();
            }
        });
        
        document.getElementById('editStylesModal').style.display = 'block';
        
        // Set up real-time preview updates
        this.bindStyleInputEvents();
    }

    hideEditStylesModal() {
        document.getElementById('editStylesModal').style.display = 'none';
        this.currentEditStylesListId = null;
        this.unbindStyleInputEvents();
    }

    async saveEditedStyles() {
        if (!this.currentEditStylesListId) return;

        const newStyles = this.getCurrentStylesFromModal();
        
        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        
        if (this.currentEditStylesListId === 'new') {
            // Store styles for new list creation
            this.pendingNewListStyles = newStyles;
            this.hideEditStylesModal();
            return;
        }
        
        const listIndex = wordLists.findIndex(list => list.id === this.currentEditStylesListId);
        if (listIndex !== -1) {
            wordLists[listIndex].styles = newStyles;
            // Keep backward compatibility with color property
            wordLists[listIndex].color = newStyles.backgroundColor;
            await chrome.storage.sync.set({ wordLists });
            await this.loadWordLists();
            this.updateContentScript();
        }
        
        this.hideEditStylesModal();
    }

    hideModals() {
        document.getElementById('addListModal').style.display = 'none';
        document.getElementById('addWordModal').style.display = 'none';
        document.getElementById('editStylesModal').style.display = 'none';
        this.currentListId = null;
        this.currentEditStylesListId = null;
        this.unbindStyleInputEvents();
    }

    async createWordList() {
        const name = document.getElementById('newListName').value.trim();

        if (!name) {
            alert('Please enter a list name');
            return;
        }

        // Get selected style preset or use pending custom styles
        let styles;
        if (this.pendingNewListStyles) {
            styles = this.pendingNewListStyles;
            this.pendingNewListStyles = null;
        } else {
            const activeBtn = document.querySelector('.quick-style-btn.active');
            const presetName = activeBtn ? activeBtn.dataset.style : 'default';
            styles = this.getPresetStyles(presetName);
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

        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        wordLists.push(wordList);

        await chrome.storage.sync.set({ wordLists });
        
        // Set the new list as the last expanded
        this.lastExpandedListId = listId;
        await this.saveSettings();
        
        await this.loadWordLists();
        this.hideAddListModal();
        this.updateContentScript();
    }

    async addWords() {
        if (!this.currentListId) return;

        const wordsText = document.getElementById('newWords').value.trim();
        if (!wordsText) {
            alert('Please enter some words');
            return;
        }

        // Parse words (support both comma-separated and line-separated)
        const words = wordsText
            .split(/[,\n]/)
            .map(word => word.trim())
            .filter(word => word.length > 0)
            .map(word => ({ text: word, enabled: true, id: Date.now() + Math.random() }));

        const result = await chrome.storage.sync.get({ wordLists: [] });
        const wordLists = result.wordLists;
        const listIndex = wordLists.findIndex(list => list.id === this.currentListId);

        if (listIndex !== -1) {
            wordLists[listIndex].words.push(...words);
            await chrome.storage.sync.set({ wordLists });
            await this.loadWordLists();
            this.hideAddWordModal();
            this.updateContentScript();
            
            // Refresh word counts after a short delay
            setTimeout(() => this.loadWordCounts(), 200);
        }
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

            const result = await chrome.storage.sync.get({ wordLists: [] });
            const settings = await chrome.storage.sync.get({
                caseSensitive: false,
                wholeWordsOnly: true
            });
            
            // Collect all words from all lists
            const allWords = [];
            result.wordLists.forEach(list => {
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
                        // If first attempt failed, try to inject content script
                        if (attempt === 0) {
                            try {
                                await chrome.scripting.executeScript({
                                    target: { tabId: tab.id },
                                    files: ['content.js']
                                });
                                // Wait a moment for initialization
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } catch (injectError) {
                                console.error('Failed to inject content script:', injectError);
                            }
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
            console.error('Word count failed with error:', error);
            
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
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TextHighlighterPopup();
}); 