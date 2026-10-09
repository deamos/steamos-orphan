import os
import shutil
import tempfile
import sys

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "py_modules"))
from orphan_scanner import OrphanScanner, format_size

def test_cross_drive_detection():
    # Setup two mock drives: Internal SSD and MicroSD
    base_dir = tempfile.mkdtemp(prefix="test_multidrive_")
    try:
        drive_internal = os.path.join(base_dir, "internal")
        drive_sdcard = os.path.join(base_dir, "sdcard")

        sa_internal = os.path.join(drive_internal, "steamapps")
        common_internal = os.path.join(sa_internal, "common")
        os.makedirs(common_internal, exist_ok=True)

        sa_sdcard = os.path.join(drive_sdcard, "steamapps")
        common_sdcard = os.path.join(sa_sdcard, "common")
        os.makedirs(common_sdcard, exist_ok=True)

        # 1. Drive Internal: Game "Portal 2" is actively installed
        manifest_p2 = """
"AppState"
{
    "appid"     "620"
    "name"      "Portal 2"
    "installdir" "Portal 2"
    "SizeOnDisk" "12000000000"
}
"""
        with open(os.path.join(sa_internal, "appmanifest_620.acf"), "w") as f:
            f.write(manifest_p2)

        # Folder on Internal: Active game files (12 GB)
        p2_internal = os.path.join(common_internal, "Portal 2")
        os.makedirs(p2_internal, exist_ok=True)
        with open(os.path.join(p2_internal, "portal2.exe"), "w") as f:
            f.write("active game binary")

        # 2. Drive SDCard: Leftover "Portal 2" folder (e.g. from when user moved game to internal SSD!)
        # SD Card has NO manifest for Portal 2
        p2_sdcard = os.path.join(common_sdcard, "Portal 2")
        os.makedirs(p2_sdcard, exist_ok=True)
        with open(os.path.join(p2_sdcard, "leftover_logs.txt"), "w") as f:
            f.write("old residues")

        # SD Card also has a completely deleted/orphaned game
        orphan_old = os.path.join(common_sdcard, "Old Abandoned Game")
        os.makedirs(orphan_old, exist_ok=True)
        with open(os.path.join(orphan_old, "old.pak"), "w") as f:
            f.write("uninstalled content")

        # Run scanner across both drives
        scanner = OrphanScanner(custom_steam_paths=[drive_internal, drive_sdcard])
        result = scanner.scan()

        print("Multi-drive scan results:")
        print(f"Total orphans found: {result['total_orphan_count']}")
        for o in result["orphans"]:
            print(f"  - {o['name']} on {o['library_root']}")
            print(f"    installed_on_other_drive: {o['installed_on_other_drive']}")
            if o['installed_on_other_drive']:
                print(f"    Active install location: {o['other_drive_info']}")

        # Verification:
        # Portal 2 on Internal is NOT an orphan!
        # Portal 2 on SDCard IS an orphan!
        orphans_by_path = {o["path"]: o for o in result["orphans"]}
        assert p2_internal not in orphans_by_path, "Internal Portal 2 must NOT be flagged as orphan!"
        assert p2_sdcard in orphans_by_path, "SDCard Portal 2 MUST be detected as orphan!"

        sd_portal = orphans_by_path[p2_sdcard]
        assert sd_portal["installed_on_other_drive"] is True, "Must detect that Portal 2 is installed on a different drive!"
        assert sd_portal["other_drive_info"]["name"] == "Portal 2"

        sd_old = orphans_by_path[orphan_old]
        assert sd_old["installed_on_other_drive"] is False, "Old game is not installed on any drive"

        print("Cross-drive detection test passed 100%!")

    finally:
        shutil.rmtree(base_dir, ignore_errors=True)

if __name__ == "__main__":
    test_cross_drive_detection()
