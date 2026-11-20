# Updates

Packaged Drag Shelf builds check the latest stable GitHub release 20 seconds after startup and every 24 hours while running. The tray/menu-bar menu has **Check for updates…** and an **Automatically download and install updates** toggle.

## Since 1.7: download, verify, install — inside the app

When a newer release exists, Drag Shelf downloads the build for this computer in the background and checks it against the SHA-256 digest GitHub publishes for every release file. Only stable `vX.Y.Z` releases from `github.com/im4tta/dragshelf` are accepted; a file with a different URL, size or checksum is deleted and never run.

Then it asks once: **Restart now**, or **Install when I quit**. The tray/menu-bar menu also shows **Restart to update to vX.Y.Z** until it is installed. Shelves, history and settings are kept.

| Build | How it updates |
|---|---|
| Windows installer | The new installer runs silently (`/S`) in the same per-user location and starts Drag Shelf again. No admin prompt. |
| Windows portable | After Drag Shelf quits, the portable `.exe` is replaced by the new one and started again. |
| macOS | The release `.zip` for this Mac is unpacked, its version is checked, and the `.app` bundle is swapped after Drag Shelf quits, then reopened. Works with the current ad-hoc signed builds. |

Drag Shelf falls back to opening the matching download in the browser when it cannot update itself: when it runs from the mounted DMG or from macOS App Translocation (move it to Applications first), when its folder is not writable, or when a release has no checksum.

**macOS note:** builds without an Apple Developer ID are ad-hoc signed, so macOS may ask to allow Drag Shelf in *Accessibility* again after an update. With a Developer ID (the signed + notarized CI path) the permission is kept.

CI exercises the real installers on every build (`scripts/update-smoke.js`): a silent install followed by a silent in-place update on Windows, and a ditto unpack, bundle swap and `codesign --verify` on macOS.

## Older versions

Versions 1.4–1.6 only notify and open the download; their users install 1.7 once, and every later update installs itself. Versions through 1.3.1 contain no update client. No accounts, push tokens or developer-operated services are used: checks and downloads go to GitHub only, and send just the app version in the User-Agent header.
