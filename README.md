# SteamOS Orphan Finder (Decky Loader Plugin)

**SteamOS Orphan Finder** is a Decky Loader plugin for the Steam Deck (SteamOS) that detects, lists, and safely cleans up orphaned game folders in Steam library directories on both internal NVMe storage and removable microSD cards.

---

## 🔍 How It Works

When games are uninstalled via Steam or third-party tools, leftover game files, mod files, shader dumps, or custom assets can remain inside Steam's `common` directories without any active installation entry in Steam. Over time, these orphaned directories consume tens or hundreds of gigabytes of storage.

This plugin:
1. **Discovers all Steam library paths**:
   - Internal storage: `/home/deck/.local/share/Steam/steamapps/common` (and symlinks `~/.steam/steam/steamapps/common`)
   - MicroSD cards and removable storage: `/run/media/deck/*/steamapps/common`
   - Additional custom libraries referenced in `/home/deck/.local/share/Steam/steamapps/libraryfolders.vdf`
2. **Catalogs all actively installed games**:
   - Parses every Valve KeyValues manifest (`appmanifest_<appid>.acf`) across all detected library paths.
   - Extracts `installdir` (the exact folder name expected by Steam), `name` (the human-readable title), `appid`, and `SizeOnDisk`.
3. **Identifies orphaned folders per-drive**:
   - Compares every subdirectory in `steamapps/common/` against the known active `installdir` list on that drive.
   - Automatically ignores system & configuration directories like **Steam Controller Configs** across all drives.
   - Any folder that has no corresponding active `appmanifest_*.acf` on that drive is flagged as an **Orphaned Folder**.
4. **Cross-Drive Awareness**:
   - Detects whether an orphaned folder on one drive (e.g., MicroSD) belongs to a game that is actively installed on another drive (e.g., Internal SSD).
   - Displays a clear indicator showing the active install location so you can confidently clean up leftover residue from moved games without touching the active install.
5. **Inspect & Clean**:
   - Displays each orphan folder in a compact, QAM-optimized card with disk size, file count, storage location badge (Internal vs. MicroSD), and last modified date.
   - **Multi-select checkboxes**: Select individual folders, **Select All**, and run **Delete Selected**.
   - **Delete All**: Clean all detected orphans with a single action.
   - Offers an expandable **Details** view with full path and file preview.
   - All deletions are guarded by SteamOS **Confirmation Modals** showing the folders and exact space to reclaim.
   - Provides instant feedback via SteamOS system notifications and in-app status banners upon deletion completion.

---

## 🛡️ Safety Protections

- **Steam Controller Configs Protected**: Automatically ignores `Steam Controller Configs` / `Steam Controller Configurations` on all storage devices.
- **Manifest Re-Verification**: Re-checks active `appmanifest_*.acf` files in real-time before executing any deletion.
- **Strict Boundary Check**: Deletion is only permitted for directories residing strictly inside recognized `steamapps/common/` locations. Critical paths (`/`, `/home`, `/home/deck`, `/run/media`, etc.) are blocked.
- **Double Confirmation**: All deletions require confirmation through Decky's `ConfirmModal` dialog.

---

## 🤖 AI Disclosure

This project was developed with the assistance of artificial intelligence tools (including LLM-assisted pair programming and code generation) for architecture design, TypeScript/React frontend implementation, Python backend logic, unit test creation, and documentation. All code, security constraints, and filesystem operations have been reviewed, verified, and validated against automated test suites.

---

## 📦 Building an Install ZIP

Build the ready-to-install ZIP package directly with:

```bash
pnpm run package
```
or
```bash
python3 build_zip.py
```

This compiles the frontend, packages all required backend and manifest files into `steamos-orphan.zip` (and `steamos-orphan-v1.0.0.zip`), and excludes unnecessary build artifacts like `node_modules/`, `src/`, and `.git/`.

### ZIP Contents:
```text
steamos-orphan.zip
└── steamos-orphan/
    ├── dist/
    │   ├── index.js
    │   └── index.js.map
    ├── py_modules/
    │   └── orphan_scanner.py
    ├── main.py
    ├── plugin.json
    ├── package.json
    ├── README.md
    └── LICENSE
```

---

## 🚀 Installation on Steam Deck

### Method 1: Decky Loader UI (via Install ZIP)
1. In Game Mode on your Steam Deck, open the **Decky** menu (`...` button).
2. Go to **Settings** (gear icon) -> **General** -> Toggle **Developer mode** ON.
3. Select the **Developer** tab in the sidebar.
4. Choose **Install plugin from ZIP**.
5. Select `steamos-orphan.zip` to install!

### Method 2: Manual / SSH
1. Transfer the plugin directory or extract the zip into `/home/deck/homebrew/plugins/`:
   ```bash
   rsync -avz --exclude 'node_modules' --exclude '.git' ./ deck@<steam-deck-ip>:/home/deck/homebrew/plugins/steamos-orphan/
   ```
2. Restart Decky Loader:
   ```bash
   sudo systemctl restart plugin_loader.service
   ```
3. Open Decky in the Quick Access Menu (`...` button) to access **Steam Orphan Finder**.

---

## 🧪 Running Unit Tests

To run the automated scanner test suites:
```bash
pnpm test
```
and
```bash
python3 tests/test_cross_drive.py
```
---

## 🚀 Automated GitHub Actions Release

This repository includes a GitHub Actions workflow in [\.github/workflows/release.yml\](.github/workflows/release.yml) that automatically:
- Runs all unit tests.
- Compiles the frontend and packages the plugin into \steamos-orphan.zip\ and \steamos-orphan-v<version>.zip\.
- Uploads the build artifact to the workflow run.
- Publishes or updates a GitHub Release with downloadable ZIP assets on every push to \master\ (and version tags \*\).
