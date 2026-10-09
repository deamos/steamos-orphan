#!/usr/bin/env python3
import os
import sys
import json
import zipfile
import shutil
import subprocess

def build_install_zip():
    repo_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(repo_root)

    # 1. Read package.json metadata
    package_json_path = os.path.join(repo_root, "package.json")
    if not os.path.exists(package_json_path):
        print("Error: package.json not found!")
        sys.exit(1)

    with open(package_json_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)

    plugin_name = pkg.get("name", "steamos-orphan")
    plugin_version = pkg.get("version", "1.0.0")

    print(f"📦 Packaging Decky plugin: {plugin_name} (v{plugin_version})")

    # 2. Check or build frontend dist
    dist_index = os.path.join(repo_root, "dist", "index.js")
    if not os.path.exists(dist_index):
        print("⚡ dist/index.js not found. Running 'pnpm run build'...")
        res = subprocess.run(["pnpm", "run", "build"], cwd=repo_root)
        if res.returncode != 0:
            print("❌ Build failed! Aborting packaging.")
            sys.exit(res.returncode)

    # 3. Define files to package
    files_to_package = [
        ("plugin.json", True),
        ("package.json", True),
        ("main.py", True),
        ("README.md", False),
        ("LICENSE", False),
    ]

    dirs_to_package = [
        ("dist", True),
        ("py_modules", True),
    ]

    zip_filename = f"{plugin_name}.zip"
    versioned_zip = f"{plugin_name}-v{plugin_version}.zip"

    # Ignored patterns
    ignored_names = {".keep", ".DS_Store"}
    ignored_extensions = {".pyc", ".pyo"}

    print(f"Creating archive: {zip_filename}...")
    with zipfile.ZipFile(zip_filename, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Include top-level files
        for rel_path, required in files_to_package:
            full_path = os.path.join(repo_root, rel_path)
            if os.path.exists(full_path):
                arcname = f"{plugin_name}/{rel_path}"
                zf.write(full_path, arcname)
                print(f"  + {arcname}")
            elif required:
                print(f"❌ Required file missing: {rel_path}")
                sys.exit(1)

        # Include directories
        for rel_dir, required in dirs_to_package:
            full_dir = os.path.join(repo_root, rel_dir)
            if os.path.exists(full_dir):
                for root, dirs, files in os.walk(full_dir):
                    # Exclude __pycache__ from traversal
                    dirs[:] = [d for d in dirs if d != "__pycache__"]
                    for file in files:
                        if file in ignored_names or any(file.endswith(ext) for ext in ignored_extensions):
                            continue
                        full_path = os.path.join(root, file)
                        rel_file = os.path.relpath(full_path, repo_root)
                        arcname = f"{plugin_name}/{rel_file}"
                        zf.write(full_path, arcname)
                        print(f"  + {arcname}")
            elif required:
                print(f"❌ Required directory missing: {rel_dir}")
                sys.exit(1)

    # Create a copy with the versioned name for releases
    shutil.copyfile(zip_filename, versioned_zip)

    zip_size_kb = os.path.getsize(zip_filename) / 1024.0
    print("\n✅ Successfully built install ZIP files:")
    print(f"  • {zip_filename} ({zip_size_kb:.1f} KB)")
    print(f"  • {versioned_zip} ({zip_size_kb:.1f} KB)")

    # 4. Verify zip contents
    print("\n🔍 Archive Verification:")
    with zipfile.ZipFile(zip_filename, "r") as zf:
        namelist = zf.namelist()
        has_index = any("dist/index.js" in n for n in namelist)
        has_main = any("main.py" in n for n in namelist)
        has_plugin = any("plugin.json" in n for n in namelist)
        has_scanner = any("py_modules/orphan_scanner.py" in n for n in namelist)

        if has_index and has_main and has_plugin and has_scanner:
            print("  ✓ All required plugin components verified inside the ZIP.")
        else:
            print("  ⚠️ Warning: Some required components are missing!")

    print("\n🚀 Installation options on Steam Deck:")
    print("  1. Decky UI: Settings -> General -> Enable Developer Mode -> Developer Tab -> Install from ZIP.")
    print("  2. Manual: Extract to /home/deck/homebrew/plugins/ and restart plugin_loader.service.")

if __name__ == "__main__":
    build_install_zip()