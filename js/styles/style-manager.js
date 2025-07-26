/**
 * Style Manager - Handles all highlighting style customization and presets
 */
class StyleManager {
    constructor() {
        this.currentEditStylesListId = null;
        this.pendingNewListStyles = null;
        this.boundEventHandlers = {};
    }

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
        this.boundEventHandlers.colorInputHandler = () => this.updateStylePreview();
        document.getElementById('editBackgroundColor').addEventListener('input', this.boundEventHandlers.colorInputHandler);
        document.getElementById('editTextColor').addEventListener('input', this.boundEventHandlers.colorInputHandler);
        
        // Text inputs for colors
        this.boundEventHandlers.colorTextHandler = (e) => {
            const colorInput = e.target.id === 'editBackgroundColorText' ? 
                document.getElementById('editBackgroundColor') : 
                document.getElementById('editTextColor');
            colorInput.value = e.target.value;
            this.updateStylePreview();
        };
        document.getElementById('editBackgroundColorText').addEventListener('input', this.boundEventHandlers.colorTextHandler);
        document.getElementById('editTextColorText').addEventListener('input', this.boundEventHandlers.colorTextHandler);
        
        // Other style inputs
        const styleInputs = [
            'editFontWeight', 'editFontStyle', 'editUnderline', 'editStrikethrough', 'editOverline',
            'editBorderWidth', 'editBorderStyle', 'editBorderColor', 'editTextTransform',
            'editPaddingTop', 'editPaddingRight', 'editPaddingBottom', 'editPaddingLeft', 'editBorderRadius'
        ];
        
        this.boundEventHandlers.styleInputHandler = () => this.updateStylePreview();
        styleInputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', this.boundEventHandlers.styleInputHandler);
                element.addEventListener('change', this.boundEventHandlers.styleInputHandler);
            }
        });
        
        // Preset buttons
        this.boundEventHandlers.presetHandler = (e) => {
            const presetName = e.target.closest('.preset-btn').dataset.preset;
            const presetStyles = this.getPresetStyles(presetName);
            this.loadStylesIntoModal(presetStyles);
            this.updateStylePreview();
            
            // Update active state
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
            e.target.closest('.preset-btn').classList.add('active');
        };
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', this.boundEventHandlers.presetHandler);
        });
    }

    unbindStyleInputEvents() {
        if (this.boundEventHandlers.colorInputHandler) {
            document.getElementById('editBackgroundColor').removeEventListener('input', this.boundEventHandlers.colorInputHandler);
            document.getElementById('editTextColor').removeEventListener('input', this.boundEventHandlers.colorInputHandler);
        }
        
        if (this.boundEventHandlers.colorTextHandler) {
            document.getElementById('editBackgroundColorText').removeEventListener('input', this.boundEventHandlers.colorTextHandler);
            document.getElementById('editTextColorText').removeEventListener('input', this.boundEventHandlers.colorTextHandler);
        }
        
        if (this.boundEventHandlers.styleInputHandler) {
            const styleInputs = [
                'editFontWeight', 'editFontStyle', 'editUnderline', 'editStrikethrough', 'editOverline',
                'editBorderWidth', 'editBorderStyle', 'editBorderColor', 'editTextTransform',
                'editPaddingTop', 'editPaddingRight', 'editPaddingBottom', 'editPaddingLeft', 'editBorderRadius'
            ];
            
            styleInputs.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.removeEventListener('input', this.boundEventHandlers.styleInputHandler);
                    element.removeEventListener('change', this.boundEventHandlers.styleInputHandler);
                }
            });
        }
        
        if (this.boundEventHandlers.presetHandler) {
            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.removeEventListener('click', this.boundEventHandlers.presetHandler);
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
            
            return true;
        } catch (error) {
            console.error('Error resetting styles:', error);
            return false;
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

    showEditStylesModal(listId, storageManager) {
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

    async saveEditedStyles(storageManager, onComplete) {
        if (!this.currentEditStylesListId) return;

        const newStyles = this.getCurrentStylesFromModal();
        
        if (this.currentEditStylesListId === 'new') {
            // Store styles for new list creation
            this.pendingNewListStyles = newStyles;
            this.hideEditStylesModal();
            if (onComplete) onComplete();
            return;
        }
        
        const wordLists = await storageManager.loadWordLists();
        const listIndex = wordLists.findIndex(list => list.id === this.currentEditStylesListId);
        if (listIndex !== -1) {
            wordLists[listIndex].styles = newStyles;
            // Keep backward compatibility with color property
            wordLists[listIndex].color = newStyles.backgroundColor;
            await storageManager.saveWordLists(wordLists);
            if (onComplete) onComplete();
        }
        
        this.hideEditStylesModal();
    }

    getPendingNewListStyles() {
        return this.pendingNewListStyles;
    }

    clearPendingNewListStyles() {
        this.pendingNewListStyles = null;
    }

    getSelectedQuickStyle() {
        const activeBtn = document.querySelector('.quick-style-btn.active');
        const presetName = activeBtn ? activeBtn.dataset.style : 'default';
        return this.getPresetStyles(presetName);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StyleManager;
} else if (typeof window !== 'undefined') {
    window.StyleManager = StyleManager;
}