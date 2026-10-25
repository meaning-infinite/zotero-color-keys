# Changelog

All notable changes to this project are documented in this file.

## [0.2.0-beta.1] - 2026-10-25

### Added

- PDF reader: highlight shortcuts (`Ctrl+Alt+color`) now create a highlight for the current text selection, or recolor the selected annotation
- `diagnostics.pdfBridge` / `pdfReaders` counters for troubleshooting PDF integration

### Notes

- Requires user testing on real PDFs before promoting to 0.2.0
- Reader toolbar redesign (second UX scheme) still pending

## [0.1.1] - 2026-10-25

### Added

- Plugin icon shown in Zotero's add-on manager and the add-on market

### Changed

- README redesigned: banner, badges, shortcut tables, install and troubleshooting sections
- Repository description and topics for better discoverability

## [0.1.0] - 2026-10-23

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
