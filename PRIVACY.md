# Drag Shelf privacy policy

Effective date: November 17, 2026

Drag Shelf is an open-source desktop utility maintained by im4tta.

## Files and local settings

Drag Shelf stores shelf contents, file paths, preferences, keyboard shortcuts, and app exclusions on your computer. Dropped files and folders are generally referenced in their original location. Text, links, pasted images, and photos received from a phone can be saved as local files. Opening or dragging an item into another app shares that item with the app you choose.

The Windows app stores its data under your Windows user profile. The packaged Microsoft Store edition may have its local files redirected to its package data folder by Windows. Clearing a shelf removes its entries; it does not necessarily delete files previously created in the local stash. You can remove retained local data through Windows app reset/uninstall options or by deleting the app's data after closing it. Back up any wanted files first.

## Mouse and keyboard interaction

The Windows app observes mouse movement and button state to detect a drag-and-shake gesture. It registers a global shortcut and reads shortcut keys while you configure that shortcut. It uses the active app's executable name for app exclusions. It does not record your typing history or send these interactions to the developer.

## Clipboard, screenshots and history

When *Auto-paste copied items* is on (it is off by default), Drag Shelf reads the system clipboard about once a second and adds each new copy to the active shelf: copied files are referenced in place, and images, links and text are saved as local files. *Paste clipboard to shelf* reads the clipboard once. Screen captures happen only when you press the capture button; macOS asks for Screen Recording permission. A history of items added to shelves is stored locally in `history.json`; remove entries or clear it from the History panel. Nothing is uploaded.

## Text recognition (OCR)

Text in images is recognised on your computer; images are never uploaded. The first time you use OCR, Drag Shelf downloads its models (≈50 MB) from Hugging Face (huggingface.co) and jsDelivr (cdn.jsdelivr.net) and checks each file's SHA-256. Recognised text is stored locally in `ocr.json` so history can be searched by it. You can remove the models from the tray/menu-bar menu.

## Quick paste

The quick-paste shortcut opens a list of your history. Choosing an item copies it and, on Windows and macOS (with Accessibility permission), sends a single paste keystroke to the app you were using. No other keystrokes are sent or recorded.

## Optional phone transfers

When you open "Photos from phone", Drag Shelf starts a temporary local-network HTTP server with a random secret URL. A phone using that URL can upload files directly to your computer. The app processes the network connection's IP address to restrict connections to private/local addresses; it does not send it to the developer or use it for analytics. Files are stored locally. Closing the transfer window stops accepting transfers. Transfers use HTTP, so use this feature only on a trusted private network and keep its URL private. While it is open, the same page also offers the active shelf’s files for download to devices that have the URL.

## No developer-operated data collection

Drag Shelf does not require an account, include advertising or analytics, or upload your shelf contents to a developer-operated service. Microsoft Store and Windows may process installation, diagnostic, or other data under Microsoft's own privacy settings and policies.

## External links and support

Starting with version 1.4, packaged desktop builds check the public GitHub releases API after startup and daily. GitHub receives your IP address and app version in the request header; shelf contents and file paths are not sent. Disable automatic checks in the tray/menu-bar menu. Manual checks still contact GitHub. From version 1.7, when a newer release exists, Drag Shelf downloads the matching installer from GitHub, verifies its SHA-256 checksum, and installs it when you restart or quit; turning off automatic updates stops background checks and downloads.

Privacy and support menu items open GitHub in your browser. GitHub and your browser process those visits under their own policies. If you contact us or file a public issue, the information you choose to include is handled by the relevant email or GitHub service. Do not include private file contents in public issues.

## Contact and changes

Contact: metathoeb@gmail.com. Support: https://github.com/im4tta/dragshelf/issues

Changes to this policy will be published here with an updated effective date.
