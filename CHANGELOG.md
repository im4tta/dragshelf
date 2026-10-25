# Changelog

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
