# Changelog

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
