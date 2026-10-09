export interface OtherDriveInfo {
  name: string;
  storage_type: string;
  size_formatted: string;
  library_root: string;
}

export interface OrphanFolder {
  name: string;
  path: string;
  library_root: string;
  common_dir: string;
  storage_type: string;
  size_bytes: number;
  size_formatted: string;
  file_count: number;
  latest_mtime: number;
  modified_formatted: string;
  sample_files: string[];
  installed_on_other_drive?: boolean;
  other_drive_info?: OtherDriveInfo | null;
}

export interface InstalledGame {
  appid: string;
  name: string;
  installdir: string;
  storage_type: string;
  size_formatted: string;
}

export interface LibraryInfo {
  library_root: string;
  common_dir: string;
  storage_type: string;
  exists: boolean;
}

export interface ScanResult {
  success: boolean;
  error?: string;
  orphans: OrphanFolder[];
  total_orphan_count: number;
  total_orphaned_bytes: number;
  total_orphaned_formatted: string;
  installed_game_count: number;
  installed_games: InstalledGame[];
  libraries: LibraryInfo[];
  timestamp?: number;
  timestamp_formatted?: string;
}

export interface DeleteResult {
  success: boolean;
  message?: string;
  error?: string;
  freed_bytes?: number;
  freed_formatted?: string;
  deleted_path?: string;
}

export interface BatchDeleteResult {
  success: boolean;
  deleted_count: number;
  total_freed_bytes: number;
  total_freed_formatted: string;
  deleted_paths?: string[];
  failed?: Array<{ path: string; error: string }>;
  error?: string;
}
