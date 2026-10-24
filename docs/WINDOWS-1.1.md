# Windows 1.1 — the shared Drag Shelf interface

The 1.0 Windows download compiled the old Win32 app in `windows/DragShelf-source.cpp`, while the repository screenshots came from the Electron app in `src/`. Windows 1.1 now packages that same Electron interface.

The shelf layout, dark/light themes, eight accent colors, rich file rows, completion ticks, confetti, tabs, reorder interactions, phone-transfer panel, shortcut recorder, and animated guide are shared with macOS.

Windows-specific behavior includes Ctrl+Shift+F by default, Ctrl to retain an item when dragging it out, `.url` link files, a colored system-tray icon, per-user installation and optional startup. A small read-only desktop-context helper checks the foreground executable, drag capture, and presentation state; the bundled native mouse hook detects shake gestures. Physical pointer coordinates are converted to Windows display-independent coordinates for mixed-DPI positioning.

Existing `shelves.txt` data in `%LOCALAPPDATA%\DragShelf` is imported only when the new app has no `shelves.json`. Import preserves original file paths, shelf names and exclusions and leaves the old data unchanged. The two apps use separate settings, so themes and custom hotkeys may need to be chosen again. Quit the old tray app before running the new version. If you enabled the old app at startup, disable its startup entry separately.

Use the `*-setup.exe` download for normal installation and stable shortcuts, or `*-portable.exe` to run without installing. These downloads remain unsigned and can still display SmartScreen warnings. The Microsoft Store submission remains paused and still references the old native app.

Verification covers the real Windows Electron UI, the packaged executable, native hook/context loading, local phone transfers, persistence and one-time shelf migration. Screenshots in `docs/screenshots-windows` come from the running Windows app; macOS references stay in `docs/screenshots`.

The shelf is 320 logical pixels wide and follows Windows display scaling. Its list scrolls to fit the monitor's usable work area. On shorter displays the guide uses a compact text layout, while the phone panel scrolls. Automated work-area tests cover 1366×768 at 100% and 150%, 1080p at 150%, and 4K at 200%; physical multi-monitor testing remains dependent on the user's hardware. The screenshot generator deliberately uses 2× scaling for crisp documentation captures; production launches do not.

Phone-server shutdown is idempotent, including nested window-close/app-quit calls, and has regression coverage for reentrant shutdown and repeated start/stop cycles.
