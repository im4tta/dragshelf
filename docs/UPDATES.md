# Update notifications

Starting with 1.4.0, packaged Drag Shelf builds check the latest stable GitHub release 20 seconds after startup and every 24 hours while running. The tray/menu-bar menu provides a manual check and an automatic-check toggle. A newer release offers Download update, Remind me later, and Skip this version. Skipping suppresses automatic prompts for that version; manual checks still show it.

The matching installer, portable executable, or architecture-specific Mac DMG opens in the browser. Install it to finish updating. This is an update notification and download flow, not silent installation. Current Mac releases use ad-hoc signing; unattended Mac updating requires a valid Apple Developer signing setup.

Versions through 1.3.1 contain no update client and cannot be prompted remotely. Their users must manually install 1.4.0 or newer once. No accounts, push tokens or developer-operated notification service are used.

Checks contact only the public GitHub releases API and send the app version in the User-Agent header. Network failures stay silent during background checks; manual checks show an error. Only stable semantic versions and expected GitHub release asset URLs are accepted. Release binaries continue to be built and attached by the existing tag workflow.

The landing page lives in its own Sites source checkout at `landing/`, with its own Git repository and `.openai/hosting.json`. It resolves the latest published assets from GitHub, with a release-page fallback if the API is unavailable.
