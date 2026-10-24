# Microsoft Store submission — Drag Shelf

## Current status

The repository includes a native x64 MSIX build, Windows-managed optional startup, embedded app icons and version metadata, a privacy policy, and Store listing text. The MSIX workflow validates the package with MakeAppx. This is not a substitute for Windows App Certification Kit checks or testing an installed package.

A submission package must use your actual Partner Center product identity. Automatic CI builds deliberately use a validation identity and **must not be submitted**.

## Register and reserve a name

1. Open https://storedeveloper.microsoft.com/ and register an Individual developer account using your personal Microsoft account. Complete Microsoft's identity verification yourself. Do not send passwords, one-time codes, government ID images, or verification selfies in chat.
2. In Partner Center, open Apps and games, create a new **MSIX/PWA app**, and reserve **Drag Shelf**, if available. Do not choose the MSI/EXE installer submission route: that route does not provide the Store-managed MSIX signing we want.
3. Open the app's **Product identity** page. Copy these non-secret values exactly:
   - Package/Identity/Name
   - Package/Identity/Publisher (usually `CN=...`)
   - Package/Properties/PublisherDisplayName
   - The reserved display name, if different from Drag Shelf.

## Build the actual submission package

Open https://github.com/im4tta/dragshelf/actions/workflows/store.yml, choose **Run workflow**, and enter the Product identity values. Download the `DragShelf-MSIX-<run>` artifact from the successful run and extract it. The `*-store.msix` file is the submission package. `StoreListingLogo.png` is included for the listing.

You can also build from an x64 Visual Studio Developer PowerShell with the Windows SDK installed:

```powershell
./scripts/package-store.ps1 -IdentityName '<Package/Identity/Name>' -Publisher '<Package/Identity/Publisher>' -PublisherDisplayName '<Publisher display name>'
```

No signing key is included in this repository. Microsoft signs the certified Store package. An unsigned submission package is not a directly installable public download. For local installation tests, use a locally trusted test certificate or register an unpacked build on a development machine; never distribute that test certificate as a trust workaround.

## Verify before submission

- Install/register a development package on a Windows 10 build 19041+ or Windows 11 test machine and verify the installed app, not only the portable executable.
- Run the Windows App Certification Kit against the final submission package and review its report.
- Check first launch and guide, tray menu, Ctrl+Shift+F, drag-and-shake, adding files/text/links, dragging files out, multiple shelves, themes, missing-file handling, exclusions, and exit/relaunch persistence.
- Check **Startup settings...** opens Windows Settings; enabling Drag Shelf is optional and controlled by the user. Verify a subsequent sign-in starts the app when enabled and does not when disabled.
- Check the privacy and support links open correctly.
- On a trusted private network, verify optional phone uploads and that closing the transfer window stops new uploads. Check Windows firewall behavior on a clean machine. Do not claim phone transfer works on every network without testing.
- Check uninstall and update behavior. Original files referenced by shelves must remain intact.
- Capture actual **Windows** screenshots from the tested build. Do not upload the macOS screenshots in `docs/screenshots` as Windows screenshots.

## Listing text (English, United States)

**Name:** Use the exact reserved name.

**Short description:** A temporary shelf for the files, links, text and images you move between apps.

**Description:**

Drag Shelf gives you a temporary place to put things while you move them between apps and folders.

Start dragging a file and shake the mouse to bring up the shelf. Drop items there, then drag them out when you are ready. You can also open the shelf from the system tray or with Ctrl+Shift+F, and choose your own shortcut.

Keep different tasks in separate shelves, switch between light and dark themes, choose an accent color, and exclude apps where you do not want the shelf to appear.

An optional Photos from phone window lets you transfer files from your phone over a trusted private network using a temporary secret URL.

No account, advertising, or analytics. Shelf data and settings stay on your computer. Drag Shelf is free and open source.

**Features:**

- Drag-and-shake shelf for files, folders, links, text and images
- Multiple shelves for separate tasks
- Drag items into other desktop apps
- Configurable global keyboard shortcut
- Light/dark themes and accent colors
- Per-app exclusions
- Optional phone-to-PC file transfers on a trusted private network
- Local storage with no developer-operated analytics

**What's new:** Initial Microsoft Store release of Drag Shelf for Windows.

**Suggested category:** Productivity. Confirm the category options offered by Partner Center.

**Suggested search terms:** drag and drop; file shelf; desktop utility; file organizer; productivity

**Website:** https://github.com/im4tta/dragshelf

**Support:** https://github.com/im4tta/dragshelf/issues

**Privacy policy:** https://github.com/im4tta/dragshelf/blob/main/PRIVACY.md

**Support email:** metathoeb@gmail.com

**Pricing:** Free; no in-app purchases or advertising.

**Hardware:** Windows PC, x64, mouse/pointing device and keyboard. Windows 10 version 2004 (build 19041) or newer.

## Certification notes

Drag Shelf is a classic Win32 desktop productivity utility running at normal user privilege. `runFullTrust` is required for its system tray interface, native OLE drag-and-drop, filesystem integration, global hotkey, and mouse hook that detects drag-and-shake. It does not request elevation or record typing history. The optional startup task is disabled by default and can be enabled in Windows Startup Apps settings.

First launch shows a guide. Afterwards the app lives in the system tray rather than a normal main window. Open it with Ctrl+Shift+F or its tray icon. Exit from the tray menu. No test account or login is needed. To test file handling, drag a harmless test file onto the shelf and then into a folder. Optional phone transfer needs a phone on the same trusted private network; its secret URL is shown only while the transfer window is open.

## Finish in Partner Center

1. Create a submission and upload the final `*-store.msix` with matching identity.
2. Complete availability/pricing, properties, product declarations, and the age-rating questionnaire with truthful answers based on the app. The developer must verify these declarations and any applicable export/compliance questions; do not guess.
3. Add the listing text, current Windows screenshots, Store logo, support URL and privacy-policy URL. Review any platform-specific asset validation shown by Partner Center.
4. Add the certification notes above and explain `runFullTrust` when prompted.
5. Review every field, then submit for certification. Microsoft makes the final acceptance decision.

References:

- https://learn.microsoft.com/en-us/windows/apps/publish/get-started
- https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion
- https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission
