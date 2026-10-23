# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Text color shortcuts for the 8 official Zotero colors, plus restore-default
- Highlight shortcuts for the 8 official Zotero colors, plus clear-highlight and clear-all
- Selection-first behavior, with current-paragraph fallback when nothing is selected
- Toggle behavior: pressing the same color again removes it
- Custom keybinding preference pane with recorder, conflict detection and reset-to-default
- zh-CN / en-US / zh-TW localization (Fluent)
- Optional Better Notes integration: color commands registered in its Magic Key palette
- Diagnostics block in preferences (attached editors, Better Notes detection, last error)

### Engineering

- Self-written bootstrap/manifest/prefs (MIT); build via `zotero-plugin-scaffold`
- Unit tests for color normalization, keymap parsing/matching/conflicts
- Spike + E2E notes under `docs/spike/` and `docs/testing/`
