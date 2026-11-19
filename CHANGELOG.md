# Changelog

## Unreleased
- **Auto-paste:** turn on *Auto-paste copied items* (tray/menu-bar menu or the History panel) and whatever you copy lands on the active shelf, even while the shelf is hidden: files of any type copied in Finder/Explorer (by reference), images, links and text. *Paste clipboard to shelf* and ⌘/Ctrl+V do it once.
- **Screen capture:** the camera button in the shelf header (or the menu) adds a screenshot of the current display at 1×–4× resolution (*Screenshot resolution*).
- **History:** the clock button opens everything that ever landed on a shelf, with search, copy back to the clipboard and add to the shelf again. Right-click removes an entry.
- **Pinned items:** pin history entries to keep them on top; pins are never pruned or cleared.
- **Split / merge text:** right-click a text item → *Split / merge text…* to split or merge lines with any separator (`\n`, `\t`, `,` …), split one item into several shelf items, or merge all text items on a shelf into one.
- **Undo / redo:** undo and redo shelf changes (adding, removing, clearing, reordering, splitting, merging, drag-out removal) with the footer buttons, ⌘/Ctrl+Z / ⇧⌘Z or the menu; the text editor has its own undo / redo.

## 1.4.0
- Added automatic stable-release checks after startup and daily, plus a manual Check for updates menu action.
- Update prompts offer the matching Windows installer/portable build or Mac download, with remind-later and skip-version choices.
- Added background-check opt-out, localized dialogs, offline handling and trusted release URL validation.
- Added a responsive landing page with direct latest-release downloads and a delivery showcase.

## 1.3.1
- Recover original filesystem paths from explicit file URLs when Electron returns an empty path, before falling back to a blob copy.
- Capture all drop metadata synchronously, including drops onto the new-shelf button. Share this handling with the delivery workspace.
- Preserve browser blobs and mixed drops, decode Unicode/escaped file URLs and avoid duplicate stashed copies of resolved files.
- Added regression coverage on Linux, Windows and macOS, plus packaged Windows checks.

## 1.3.0
- Added the shelf-and-delivery workspace: editable requirements, readiness checks and an exact output preview.
- Prepare new copies with consistent filenames, PNG/JPEG conversion, image resizing, duplicate removal and per-file size limits.
- Export a new folder or ZIP with instructions, an offline visual index and a SHA-256 manifest; originals remain unchanged.
- Save reusable recipes and restore source references and settings from local delivery history.
- Included English/Khmer translations, responsive layouts and source/packaged delivery integration checks.

## 1.2.0
- Added English/Khmer language switching throughout the shared Windows/macOS interface, native menus, onboarding, dialogs, shortcut recorder and phone-transfer pages.
- Bundled Noto Sans Khmer for offline rendering; localized dates, numbers, metadata labels and upload errors.
- Preserved Khmer text, filenames and character clusters when naming shelves and creating files.
- Long shelf names now use a wrapping tab row instead of ellipses, with work-area-aware list sizing.
- Added Khmer integration and Unicode persistence tests for source and packaged Windows builds.

## 1.1.0
- Windows now uses the same Electron interface as macOS, replacing the older native UI in GitHub downloads.
- Added Windows installer and portable builds, platform shortcuts and link files, DPI-aware drag placement, native foreground-app checks and one-time import of old Windows shelves.
- Added real Windows screenshots and source/packaged Windows end-to-end tests.
- Panels fit smaller/high-DPI work areas with a scrolling shelf, compact guide and scrollable phone panel.
- Fixed a reentrant phone-server shutdown crash when closing windows or quitting.
- The Microsoft Store draft remains paused on the earlier native implementation.

## 1.0.0
- First macOS release (Apple Silicon, Intel, universal), ported from the Windows version.
- New design: warm dark/light cards, cream tiles, done ticks with strike-through and confetti, `done/total` counter.
- Shake / screen-edge trigger with drag-pasteboard verification, multiple shelves, phone photo transfer via QR, global shortcut, per-app exclusions, 8 accent colours.
