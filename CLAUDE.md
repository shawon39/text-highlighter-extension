# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension called "Keyword List Highlighter" that automatically highlights specified words on web pages with customizable colors and word lists. The extension allows users to create multiple themed word lists and highlight them with different colors for productivity purposes (e.g., highlighting resume keywords on LinkedIn).

## Architecture

### Core Components

- **Background Service Worker** (`background.js`): Handles extension lifecycle, default settings, and badge updates
- **Content Scripts** (loaded in order):
  - `highlighter-core.js`: Main TextHighlighter class managing highlighting logic
  - `dom-manager.js`: DOMManager class for DOM manipulation and observation
  - `settings-handler.js`: SettingsHandler class for settings management
  - `content-main.js`: Entry point that initializes the highlighter
- **Popup Interface** (`popup.html` + `js/core/popup-core.js`): Extension popup for managing word lists and settings

### Key Architecture Patterns

- **Class-based components**: TextHighlighter, DOMManager, SettingsHandler work together via composition
- **Chrome Storage API**: All settings and word lists stored using chrome.storage.sync
- **MutationObserver**: Watches for DOM changes to re-highlight dynamically added content
- **Message passing**: Communication between popup and content scripts via chrome.runtime.sendMessage

### File Structure

```
js/
├── content/           # Content script files (run on web pages)
├── core/             # Popup logic
├── settings/         # Advanced settings functionality
├── storage/          # Storage management utilities
├── styles/           # Style management for highlights
└── ui/               # UI components (modals, word lists)

css/
├── base/             # Base styles
├── components/       # Component-specific styles
├── styles/           # Style editor styles
└── advanced/         # Advanced settings styles
```

### Data Models

- **Word Lists**: Objects with `id`, `name`, `words` (array), `color`, `enabled` properties
- **Settings**: Global configuration including `enableHighlighting`, `caseSensitive`, `wholeWordsOnly`, website rules
- **Highlights**: Applied as `<span>` elements with inline styles and data attributes for cleanup

## Important Notes

- Extension uses Manifest V3 with service worker architecture
- All highlighting is applied via DOM manipulation without modifying original page content
- Memory leak prevention is critical - proper cleanup in destroy() methods
- Context invalidation handling for when extension is reloaded while content scripts are active
- Color picker integration for custom highlight colors
- Real-time DOM observation for dynamic content highlighting


Follow this always:
1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.

2. The plan should have a list of todo items that you can check off as you complete them

3. Before you begin working, check in with me and I will verify the plan.

4. Then, begin working on the todo items, marking them as complete as you go.

5. Please every step of the way just give me a high level explanation of what changes you made

6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.

7. Finally, add a review section to the todo.md file with a summary of the changes you made and any other relevant information.

8. DO NOT BE LAZY. NEVER BE LAZY. IF THERE IS A BUG FIND THE ROOT CAUSE AND FIX IT. NO TEMPORARY FIXES. YOU ARE A SENIOR DEVELOPER. NEVER BE LAZY

9. MAKE ALL FIXES AND CODE CHANGES AS SIMPLE AS HUMANLY POSSIBLE. THEY SHOULD ONLY IMPACT NECESSARY CODE RELEVANT TO THE TASK AND NOTHING ELSE. IT SHOULD IMPACT AS LITTLE CODE AS POSSIBLE. YOUR GOAL IS TO NOT INTRODUCE ANY BUGS. IT'S ALL ABOUT SIMPLICITY

10. Not js exceeds 500 lines
