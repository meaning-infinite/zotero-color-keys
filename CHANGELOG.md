# Changelog

All notable changes to this project are documented in this file.

## [0.2.0-beta.4] - 2026-10-26

### Changed

- Color shortcuts now work while the sidebar annotation input box has focus, so Tab refocusing is no longer needed (Tab handling removed)
- Selection popup: the mode indicator is merged into the first (color) row; the second row is a single gray hint line, with tighter spacing
- Settings keymap section switched to a real table with centered headers and inputs; single reset button kept

### Fixed

- Diagnostics PDF reader count now reflects currently open readers instead of a stale attachment count

## [0.2.0-beta.3] - 2026-10-25

### Added

- Selection popup redesign: the two native highlight/underline buttons are hidden and replaced by one mode indicator; hold Ctrl/Cmd to switch it to highlight mode
- Clicking a color in the selection popup applies an underline color by default, or a highlight color while Ctrl/Cmd is held
- Settings: Tab / Shift+Tab explanation for the sidebar annotation box focus problem

### Changed

- Settings keymap section is now a compact grid: one row per color, with text-color and highlight columns; only one "reset all" button remains
- PDF `Shift+Alt` note-color shortcut removed (not a native Zotero behavior)

### Removed

- Reader toolbar color swatches and their settings (misread requirement; the target was the selection popup)

## [0.2.0-beta.2] - 2026-10-25

### Added

- PDF reader: `Alt+letter` now colors underlines, `Shift+Alt+letter` colors sticky notes (when a note annotation is selected)
- PDF reader toolbar: 8 color swatches appended to the toolbar, click behavior configurable
- Settings: Tab jumps from the sidebar annotation box back to the reader (so color shortcuts work); toolbar swatches toggle; click action (`apply` vs `set-tool`)
- Diagnostics line now includes PDF reader count and last error

### Fixed

- PDF shortcuts now listen on the PDF.js view iframe as well, so keys work while focus is in the PDF body
- Selecting over an existing highlight recolors it instead of stacking a new annotation

### Notes

- Still beta: needs real-PDF verification before 0.2.0

## [0.2.0-beta.1] - 2026-10-25

### Added

- PDF reader: highlight shortcuts (`Ctrl+Alt+color`) now create a highlight for the current text selection, or recolor the selected annotation
- `diagnostics.pdfBridge` / `pdfReaders` counters for troubleshooting PDF integration

### Notes

- Keyboard listener is attached to both the reader UI window and the PDF.js view iframe (reader UI alone never sees keys while focus is in the PDF body)
- Selecting over an existing highlight recolors it instead of stacking a new annotation
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
