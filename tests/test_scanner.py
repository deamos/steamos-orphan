import os
import shutil
import tempfile
import sys

# Add py_modules to path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "py_modules"))
from orphan_scanner import OrphanScanner, parse_acf, format_size, is_ignored_folder

def test_orphan_detection():
    test_dir = tempfile.mkdtemp(prefix="test_steam_")
    try:
        steamapps = os.path.join(test_dir, "steamapps")
        common = os.path.join(steamapps, "common")
        os.makedirs(common, exist_ok=True)

        # 1. Create mock manifests
        manifest_cs = """
"AppState"
{
    "appid"     "730"
    "name"      "Counter-Strike 2"
    "installdir" "Counter-Strike Global Offensive"
    "SizeOnDisk" "35000000000"
}
"""
        with open(os.path.join(steamapps, "appmanifest_730.acf"), "w") as f:
            f.write(manifest_cs)

        # 2. Create folders in common
        # Installed games:
        cs_dir = os.path.join(common, "Counter-Strike Global Offensive")
        os.makedirs(cs_dir, exist_ok=True)
        with open(os.path.join(cs_dir, "cs2.exe"), "w") as f:
            f.write("mock content")

        # Steam Controller Configs (MUST BE IGNORED):
        controller_dir = os.path.join(common, "Steam Controller Configs")
        os.makedirs(controller_dir, exist_ok=True)
        with open(os.path.join(controller_dir, "config.vdf"), "w") as f:
            f.write("controller data")

        # Real Orphaned folders:
        orphan1_dir = os.path.join(common, "Leftover Uninstalled Game")
        os.makedirs(orphan1_dir, exist_ok=True)
        with open(os.path.join(orphan1_dir, "data.pak"), "w") as f:
            f.write("1234567890" * 1000)

        orphan2_dir = os.path.join(common, "Another Orphan")
        os.makedirs(orphan2_dir, exist_ok=True)
        with open(os.path.join(orphan2_dir, "file.bin"), "w") as f:
            f.write("abc")

        # Hidden folder
        hidden_dir = os.path.join(common, ".hidden_cache")
        os.makedirs(hidden_dir, exist_ok=True)

        # 3. Run scanner
        scanner = OrphanScanner(custom_steam_paths=[test_dir])
        result = scanner.scan()

        print("Scan result summary:")
        print(f"Total orphan count: {result['total_orphan_count']}")
        print(f"Installed games count: {result['installed_game_count']}")
        print(f"Total orphaned size: {result['total_orphaned_formatted']}")

        orphan_names = [o["name"] for o in result["orphans"]]
        print(f"Orphan names: {orphan_names}")

        # Steam Controller Configs MUST NOT be in orphans
        assert "Steam Controller Configs" not in orphan_names, "Steam Controller Configs should be ignored!"
        assert result["total_orphan_count"] == 2, f"Expected 2 orphans, got {result['total_orphan_count']}"
        assert "Leftover Uninstalled Game" in orphan_names
        assert "Another Orphan" in orphan_names
        assert "Counter-Strike Global Offensive" not in orphan_names
        assert ".hidden_cache" not in orphan_names

        # 4. Test batch deletion
        batch_res = scanner.delete_orphans([orphan1_dir, orphan2_dir])
        print(f"Batch deletion result: {batch_res}")
        assert batch_res["success"] is True
        assert batch_res["deleted_count"] == 2
        assert not os.path.exists(orphan1_dir)
        assert not os.path.exists(orphan2_dir)

        # Rescan after deletion
        result_after = scanner.scan()
        assert result_after["total_orphan_count"] == 0

        # Protected folder cannot be deleted
        del_prot = scanner.delete_orphan(controller_dir)
        assert del_prot["success"] is False
        assert os.path.exists(controller_dir)

        print("All tests passed successfully!")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)

if __name__ == "__main__":
    test_orphan_detection()