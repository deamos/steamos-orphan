import os
import re
import glob
import shutil
import time
from typing import List, Dict, Any, Optional, Set

IGNORED_FOLDER_PATTERNS = {
    "steam controller configs",
    "steam controller configurations",
    "steamcontrollerconfigs",
}

def is_ignored_folder(name: str) -> bool:
    """
    Check if a folder should be ignored from orphan detection across all drives.
    Specifically ignores Steam Controller Configs folders created by Steam.
    """
    nl = name.strip().lower()
    if nl in IGNORED_FOLDER_PATTERNS:
        return True
    if nl.startswith("steam controller config"):
        return True
    return False

def parse_acf(filepath: str) -> Dict[str, str]:
    """
    Parse a Steam appmanifest_<appid>.acf file and extract key-value pairs.
    Handles Valve KeyValues format safely.
    """
    data: Dict[str, str] = {}
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Match "key" followed by whitespace and "value"
        pattern = r'"([^"\n\r]+)"\s+"([^"\n\r]*)"'
        matches = re.findall(pattern, content)
        for k, v in matches:
            kl = k.lower().strip()
            # Only record the first occurrence of each key
            if kl not in data:
                data[kl] = v.strip()
    except Exception as e:
        print(f"Error reading ACF file {filepath}: {e}")
    return data

def parse_library_folders_vdf(vdf_path: str) -> List[str]:
    """
    Parse libraryfolders.vdf to extract library directory paths.
    """
    paths = []
    if not os.path.exists(vdf_path):
        return paths
    try:
        with open(vdf_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Match "path" "/path/to/library"
        path_matches = re.findall(r'"path"\s+"([^"\n\r]+)"', content, re.IGNORECASE)
        for p in path_matches:
            p = p.strip()
            if p and p not in paths:
                paths.append(p)

        # Match older format: "1" "/path/to/library"
        old_matches = re.findall(r'"\d+"\s+"(/[^"\n\r]+)"', content)
        for p in old_matches:
            p = p.strip()
            if p and p not in paths:
                paths.append(p)
    except Exception as e:
        print(f"Error reading libraryfolders.vdf at {vdf_path}: {e}")
    return paths

def get_storage_type(path: str) -> str:
    """
    Determine if a path is on Internal Storage or Removable / SD Card.
    """
    norm = os.path.realpath(path)
    if norm.startswith('/run/media') or '/media/' in norm or '/mnt/' in norm:
        return 'SD Card / Removable'
    elif norm.startswith('/home/deck') or norm.startswith('/home/'):
        return 'Internal Storage'
    return 'External / Custom'

def format_size(bytes_size: int) -> str:
    """
    Format bytes to human readable string (e.g., 14.50 GB).
    """
    if bytes_size <= 0:
        return '0 B'
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    size = float(bytes_size)
    unit_idx = 0
    while size >= 1024.0 and unit_idx < len(units) - 1:
        size /= 1024.0
        unit_idx += 1
    if unit_idx == 0:
        return f'{int(size)} {units[unit_idx]}'
    return f'{size:.2f} {units[unit_idx]}'

def get_directory_stats(dir_path: str) -> Dict[str, Any]:
    """
    Calculate total size, file count, and latest modified time for a directory.
    Safe against broken symlinks and permission issues.
    """
    total_size = 0
    file_count = 0
    latest_mtime = 0.0
    sample_files: List[str] = []

    try:
        dir_stat = os.stat(dir_path)
        latest_mtime = dir_stat.st_mtime
    except Exception:
        pass

    try:
        for root, dirs, files in os.walk(dir_path, followlinks=False):
            for file in files:
                file_count += 1
                fp = os.path.join(root, file)
                try:
                    st = os.lstat(fp)
                    total_size += st.st_size
                    if st.st_mtime > latest_mtime:
                        latest_mtime = st.st_mtime
                except Exception:
                    pass
                if len(sample_files) < 4:
                    rel_path = os.path.relpath(fp, dir_path)
                    sample_files.append(rel_path)
    except Exception as e:
        print(f"Error scanning directory {dir_path}: {e}")

    mtime_str = ''
    if latest_mtime > 0:
        try:
            mtime_str = time.strftime('%Y-%m-%d %H:%M', time.localtime(latest_mtime))
        except Exception:
            mtime_str = ''

    return {
        'size_bytes': total_size,
        'size_formatted': format_size(total_size),
        'file_count': file_count,
        'latest_mtime': latest_mtime,
        'modified_formatted': mtime_str,
        'sample_files': sample_files,
    }

class OrphanScanner:
    def __init__(self, custom_steam_paths: Optional[List[str]] = None):
        self.custom_steam_paths = custom_steam_paths or []

    def discover_libraries(self) -> List[Dict[str, str]]:
        """
        Discover all Steam libraries on the system.
        Returns a list of library dicts:
          - library_root: e.g. /home/deck/.local/share/Steam
          - steamapps_dir: /path/to/steamapps
          - common_dir: /path/to/steamapps/common
          - storage_type: Internal Storage | SD Card / Removable
        """
        candidate_steamapps: List[str] = []

        # 1. Standard SteamOS internal paths
        standard_internal = [
            '/home/deck/.local/share/Steam/steamapps',
            '/home/deck/.steam/steam/steamapps',
            '/home/deck/.steam/root/steamapps',
            os.path.expanduser('~/.local/share/Steam/steamapps'),
            os.path.expanduser('~/.steam/steam/steamapps'),
        ]
        for p in standard_internal:
            if os.path.isdir(p):
                candidate_steamapps.append(p)

        # 2. SD Cards and removable storage mounts
        sd_patterns = [
            '/run/media/deck/*/steamapps',
            '/run/media/*/steamapps',
            '/run/media/deck/*/*/steamapps',
        ]
        for pattern in sd_patterns:
            for matched in glob.glob(pattern):
                if os.path.isdir(matched):
                    candidate_steamapps.append(matched)

        # 3. Custom paths if provided
        for p in self.custom_steam_paths:
            if os.path.isdir(p):
                if p.endswith('steamapps'):
                    candidate_steamapps.append(p)
                else:
                    sp = os.path.join(p, 'steamapps')
                    if os.path.isdir(sp):
                        candidate_steamapps.append(sp)

        # 4. Check libraryfolders.vdf in all found candidates
        vdf_checked: Set[str] = set()
        for sa in list(candidate_steamapps):
            vdf_file = os.path.join(sa, 'libraryfolders.vdf')
            real_vdf = os.path.realpath(vdf_file) if os.path.exists(vdf_file) else None
            if real_vdf and real_vdf not in vdf_checked:
                vdf_checked.add(real_vdf)
                discovered_roots = parse_library_folders_vdf(real_vdf)
                for root in discovered_roots:
                    discovered_sa = os.path.join(root, 'steamapps')
                    if os.path.isdir(discovered_sa):
                        candidate_steamapps.append(discovered_sa)

        # Deduplicate candidates using canonical paths
        unique_libraries: List[Dict[str, str]] = []
        seen_real_steamapps: Set[str] = set()

        for sa in candidate_steamapps:
            try:
                real_sa = os.path.realpath(sa)
                if real_sa in seen_real_steamapps:
                    continue
                seen_real_steamapps.add(real_sa)

                common_dir = os.path.join(real_sa, 'common')
                lib_root = os.path.dirname(real_sa)

                unique_libraries.append({
                    'library_root': lib_root,
                    'steamapps_dir': real_sa,
                    'common_dir': common_dir,
                    'storage_type': get_storage_type(real_sa),
                })
            except Exception as e:
                print(f"Error processing library path {sa}: {e}")

        return unique_libraries

    def get_installed_games_by_library(self, libraries: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Scan each library individually and map installed games per library.
        Also builds a global catalog to detect if an orphan is installed on a DIFFERENT drive.
        """
        apps: List[Dict[str, Any]] = []
        library_maps: Dict[str, Dict[str, Any]] = {}
        global_apps_by_name: Dict[str, Dict[str, Any]] = {}

        for lib in libraries:
            sa_dir = lib['steamapps_dir']
            lib_root = lib['library_root']
            manifest_pattern = os.path.join(sa_dir, 'appmanifest_*.acf')
            manifest_files = glob.glob(manifest_pattern)

            lib_installed_dirs: Set[str] = set()
            lib_installed_dirs_lower: Dict[str, Dict[str, Any]] = {}

            for mf in manifest_files:
                data = parse_acf(mf)
                appid = data.get('appid', '')
                name = data.get('name', '')
                installdir = data.get('installdir', '')
                size_str = data.get('sizeondisk', '0')
                size_on_disk = int(size_str) if size_str.isdigit() else 0
                state_flags = data.get('stateflags', '')

                if not appid or not installdir:
                    continue

                game_info = {
                    'appid': appid,
                    'name': name or installdir,
                    'installdir': installdir,
                    'size_bytes': size_on_disk,
                    'size_formatted': format_size(size_on_disk),
                    'state_flags': state_flags,
                    'library_root': lib_root,
                    'manifest_path': mf,
                    'storage_type': lib['storage_type'],
                }

                apps.append(game_info)
                lib_installed_dirs.add(installdir)
                lib_installed_dirs_lower[installdir.lower()] = game_info
                global_apps_by_name[installdir.lower()] = game_info

            library_maps[lib_root] = {
                'installed_dirs': lib_installed_dirs,
                'installed_dirs_lower': lib_installed_dirs_lower,
            }

        return {
            'apps': apps,
            'library_maps': library_maps,
            'global_apps_by_name': global_apps_by_name,
        }

    def scan(self) -> Dict[str, Any]:
        """
        Perform a full scan across all discovered Steam libraries.
        Accurately identifies orphaned folders per-library, AND detects whether
        the game is installed on a DIFFERENT drive (e.g. moved between Internal & SD).
        """
        libraries = self.discover_libraries()
        installed_data = self.get_installed_games_by_library(libraries)

        apps = installed_data['apps']
        library_maps = installed_data['library_maps']
        global_apps_by_name = installed_data['global_apps_by_name']

        orphaned_folders: List[Dict[str, Any]] = []
        total_orphaned_bytes = 0

        for lib in libraries:
            common_dir = lib['common_dir']
            lib_root = lib['library_root']
            if not os.path.isdir(common_dir):
                continue

            lib_data = library_maps.get(lib_root, {'installed_dirs': set(), 'installed_dirs_lower': {}})
            lib_installed_dirs = lib_data['installed_dirs']
            lib_installed_dirs_lower = lib_data['installed_dirs_lower']

            try:
                entries = sorted(os.listdir(common_dir))
            except Exception as e:
                print(f"Could not list directory {common_dir}: {e}")
                continue

            for entry in entries:
                # 1. Skip hidden files/directories (.DS_Store, .tmp, etc.)
                if entry.startswith('.'):
                    continue

                # 2. Skip Steam Controller Configs on all drives
                if is_ignored_folder(entry):
                    continue

                entry_path = os.path.join(common_dir, entry)

                if not os.path.isdir(entry_path):
                    continue

                # Check if it corresponds to an active installed game IN THIS LIBRARY
                is_installed_here = (entry in lib_installed_dirs) or (entry.lower() in lib_installed_dirs_lower)

                if not is_installed_here:
                    stats = get_directory_stats(entry_path)
                    total_orphaned_bytes += stats['size_bytes']

                    # Check if the game is installed on a DIFFERENT drive
                    other_game = global_apps_by_name.get(entry.lower())
                    installed_on_other_drive = False
                    other_drive_info = None

                    if other_game and other_game['library_root'] != lib_root:
                        installed_on_other_drive = True
                        other_drive_info = {
                            'name': other_game['name'],
                            'storage_type': other_game['storage_type'],
                            'size_formatted': other_game['size_formatted'],
                            'library_root': other_game['library_root'],
                        }

                    orphaned_folders.append({
                        'name': entry,
                        'path': entry_path,
                        'library_root': lib_root,
                        'common_dir': common_dir,
                        'storage_type': lib['storage_type'],
                        'size_bytes': stats['size_bytes'],
                        'size_formatted': stats['size_formatted'],
                        'file_count': stats['file_count'],
                        'latest_mtime': stats['latest_mtime'],
                        'modified_formatted': stats['modified_formatted'],
                        'sample_files': stats['sample_files'],
                        'installed_on_other_drive': installed_on_other_drive,
                        'other_drive_info': other_drive_info,
                    })

        # Sort orphans by size descending (largest first)
        orphaned_folders.sort(key=lambda x: x['size_bytes'], reverse=True)

        return {
            'success': True,
            'orphans': orphaned_folders,
            'total_orphan_count': len(orphaned_folders),
            'total_orphaned_bytes': total_orphaned_bytes,
            'total_orphaned_formatted': format_size(total_orphaned_bytes),
            'installed_game_count': len(apps),
            'installed_games': [
                {
                    'appid': a['appid'],
                    'name': a['name'],
                    'installdir': a['installdir'],
                    'storage_type': a['storage_type'],
                    'size_formatted': a['size_formatted'],
                }
                for a in sorted(apps, key=lambda x: x['name'].lower())
            ],
            'libraries': [
                {
                    'library_root': l['library_root'],
                    'common_dir': l['common_dir'],
                    'storage_type': l['storage_type'],
                    'exists': os.path.isdir(l['common_dir']),
                }
                for l in libraries
            ],
            'timestamp': time.time(),
            'timestamp_formatted': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime()),
        }

    def delete_orphan(self, target_path: str) -> Dict[str, Any]:
        """
        Safely delete an orphaned folder.
        Includes extensive security and validity checks before deletion.
        """
        try:
            norm_target = os.path.realpath(target_path)

            if not os.path.exists(norm_target):
                return {'success': False, 'error': f'Path does not exist: {target_path}'}

            if not os.path.isdir(norm_target):
                return {'success': False, 'error': f'Target is not a directory: {target_path}'}

            folder_name = os.path.basename(norm_target)

            # Never allow deleting ignored folders like Steam Controller Configs
            if is_ignored_folder(folder_name):
                return {'success': False, 'error': f'Cannot delete protected folder: {folder_name}'}

            # Discover current libraries to verify target is strictly inside a recognized steamapps/common folder
            libraries = self.discover_libraries()
            target_lib = None
            for lib in libraries:
                norm_common = os.path.realpath(lib['common_dir'])
                # Must be a direct child or subdirectory within common/
                if norm_target.startswith(norm_common + os.sep) and norm_target != norm_common:
                    target_lib = lib
                    break

            if not target_lib:
                return {
                    'success': False,
                    'error': 'Security rejection: Folder is not inside a recognized Steam common directory!'
                }

            # Guard against deleting system paths or root
            if norm_target in ['/', '/home', '/home/deck', '/run', '/run/media']:
                return {'success': False, 'error': 'Refusing to delete critical system directory.'}

            # Re-verify that this folder is NOT currently an installed game in THIS library!
            installed_data = self.get_installed_games_by_library(libraries)
            target_lib_data = installed_data['library_maps'].get(target_lib['library_root'], {})
            target_lib_dirs = target_lib_data.get('installed_dirs', set())
            target_lib_dirs_lower = target_lib_data.get('installed_dirs_lower', {})

            if folder_name in target_lib_dirs or folder_name.lower() in target_lib_dirs_lower:
                return {
                    'success': False,
                    'error': f'Aborted: \'{folder_name}\' is currently registered to an active installed game in this library!'
                }

            # Get size before deletion
            stats = get_directory_stats(norm_target)
            freed_bytes = stats['size_bytes']
            freed_formatted = stats['size_formatted']

            # Perform deletion
            shutil.rmtree(norm_target)

            return {
                'success': True,
                'message': f'Successfully deleted {folder_name}',
                'freed_bytes': freed_bytes,
                'freed_formatted': freed_formatted,
                'deleted_path': target_path,
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def delete_orphans(self, target_paths: List[str]) -> Dict[str, Any]:
        """
        Safely delete multiple orphaned folders in batch.
        """
        deleted_paths = []
        failed = []
        total_freed_bytes = 0

        for path in target_paths:
            res = self.delete_orphan(path)
            if res.get('success'):
                deleted_paths.append(path)
                total_freed_bytes += res.get('freed_bytes', 0)
            else:
                failed.append({'path': path, 'error': res.get('error', 'Unknown error')})

        return {
            'success': len(failed) == 0,
            'deleted_count': len(deleted_paths),
            'total_freed_bytes': total_freed_bytes,
            'total_freed_formatted': format_size(total_freed_bytes),
            'deleted_paths': deleted_paths,
            'failed': failed,
        }
