import os
import sys
import asyncio
from typing import Dict, Any, List

# Ensure py_modules is in the python path
current_dir = os.path.dirname(os.path.abspath(__file__))
py_modules_dir = os.path.join(current_dir, "py_modules")
if py_modules_dir not in sys.path:
    sys.path.insert(0, py_modules_dir)

import decky
from orphan_scanner import OrphanScanner

class Plugin:
    async def _main(self):
        decky.logger.info("SteamOS Orphan Finder plugin starting up...")
        self.scanner = OrphanScanner()
        decky.logger.info("SteamOS Orphan Finder plugin ready.")

    async def _unload(self):
        decky.logger.info("SteamOS Orphan Finder plugin unloading...")

    async def scan_orphans(self) -> Dict[str, Any]:
        """
        Scan for orphaned folders in Steam library common directories.
        Runs in background thread pool to keep the event loop non-blocking.
        """
        try:
            decky.logger.info("Starting scan for orphaned folders...")
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self.scanner.scan)
            decky.logger.info(
                f"Scan complete: {result['total_orphan_count']} orphan(s) found, "
                f"{result['total_orphaned_formatted']} total size."
            )
            return result
        except Exception as e:
            decky.logger.error(f"Error during scan_orphans: {e}")
            return {
                "success": False,
                "error": str(e),
                "orphans": [],
                "total_orphan_count": 0,
                "total_orphaned_bytes": 0,
                "total_orphaned_formatted": "0 B",
                "installed_game_count": 0,
                "installed_games": [],
                "libraries": []
            }

    async def delete_orphan(self, path: str) -> Dict[str, Any]:
        """
        Safely delete an orphaned folder.
        Verifies that target is inside steamapps/common and not an installed game.
        """
        try:
            decky.logger.info(f"Received request to delete orphan: {path}")
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self.scanner.delete_orphan, path)
            decky.logger.info(f"Deletion result for {path}: {result}")
            return result
        except Exception as e:
            decky.logger.error(f"Error during delete_orphan: {e}")
            return {"success": False, "error": str(e)}

    async def delete_orphans(self, paths: List[str]) -> Dict[str, Any]:
        """
        Safely delete a batch of orphaned folders.
        """
        try:
            decky.logger.info(f"Received request to delete {len(paths)} orphan(s)")
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self.scanner.delete_orphans, paths)
            decky.logger.info(f"Batch deletion result: {result}")
            return result
        except Exception as e:
            decky.logger.error(f"Error during delete_orphans: {e}")
            return {"success": False, "error": str(e), "deleted_count": 0}