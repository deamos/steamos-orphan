import {
  ButtonItem,
  DialogButton,
  PanelSection,
  PanelSectionRow,
  Spinner,
  ConfirmModal,
  showModal,
  Focusable,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useState, useEffect, useRef, FC } from "react";
import {
  FaBroom,
  FaSyncAlt,
  FaTrash,
  FaFolder,
  FaHdd,
  FaSdCard,
  FaExclamationTriangle,
  FaCheckCircle,
  FaChevronDown,
  FaChevronUp,
  FaGamepad,
  FaInfoCircle,
  FaCheckSquare,
  FaRegSquare,
  FaCheckDouble,
  FaTimes,
} from "react-icons/fa";
import { ScanResult, DeleteResult, BatchDeleteResult, OrphanFolder } from "./types";

// Backend RPC functions defined in main.py
const scanOrphansApi = callable<[], ScanResult>("scan_orphans");
const deleteOrphanApi = callable<[path: string], DeleteResult>("delete_orphan");
const deleteOrphansApi = callable<[paths: string[]], BatchDeleteResult>("delete_orphans");

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return idx === 0 ? `${Math.round(size)} ${units[idx]}` : `${size.toFixed(2)} ${units[idx]}`;
}

interface FeedbackState {
  type: "success" | "error" | "deleting";
  title: string;
  message: string;
}

const OrphanCard: FC<{
  orphan: OrphanFolder;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: (orphan: OrphanFolder) => void;
  isDeleting: boolean;
}> = ({ orphan, isSelected, onToggleSelect, onDelete, isDeleting }) => {
  const [expanded, setExpanded] = useState(false);
  const lastToggleTimeRef = useRef<number>(0);

  const isSdCard = orphan.storage_type.toLowerCase().includes("sd");

  const safeToggle = () => {
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 200) return;
    lastToggleTimeRef.current = now;
    onToggleSelect();
  };

  return (
    <div
      style={{
        backgroundColor: isSelected ? "rgba(59, 130, 246, 0.15)" : "rgba(255, 255, 255, 0.04)",
        borderRadius: "6px",
        padding: "6px 8px",
        marginBottom: "8px",
        border: isSelected
          ? "1px solid rgba(59, 130, 246, 0.5)"
          : "1px solid rgba(255, 255, 255, 0.1)",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Top Header: Focusable with gamepad D-pad and A button */}
      <Focusable
        className="orphan-item-row"
        onActivate={safeToggle}
        onClick={safeToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          padding: "4px",
          borderRadius: "4px",
          boxSizing: "border-box",
          cursor: "pointer",
        }}
      >
        {/* Checkbox Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isSelected ? "#60a5fa" : "#94a3b8",
            fontSize: "16px",
            flexShrink: 0,
          }}
        >
          {isSelected ? <FaCheckSquare /> : <FaRegSquare />}
        </div>

        {/* Folder Name */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontWeight: "bold",
            fontSize: "12px",
            color: "#ffffff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={orphan.name}
        >
          <FaFolder
            style={{
              marginRight: "5px",
              color: "#f59e0b",
              verticalAlign: "middle",
              fontSize: "11px",
              flexShrink: 0,
            }}
          />
          {orphan.name}
        </div>

        {/* Size Badge */}
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            padding: "2px 6px",
            borderRadius: "4px",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {orphan.size_formatted}
        </div>
      </Focusable>

      {/* Sub-row: Storage tag + file count + date */}
      <div
        style={{
          fontSize: "10px",
          color: "#94a3b8",
          marginTop: "4px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          paddingLeft: "4px",
          flexWrap: "wrap",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {isSdCard ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              backgroundColor: "rgba(168, 85, 247, 0.2)",
              color: "#c084fc",
              padding: "1px 4px",
              borderRadius: "3px",
              fontSize: "9px",
            }}
          >
            <FaSdCard size={9} /> MicroSD
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              backgroundColor: "rgba(59, 130, 246, 0.2)",
              color: "#60a5fa",
              padding: "1px 4px",
              borderRadius: "3px",
              fontSize: "9px",
            }}
          >
            <FaHdd size={9} /> Internal
          </span>
        )}
        <span>{orphan.file_count} files</span>
        {orphan.modified_formatted && (
          <span>• {orphan.modified_formatted.split(" ")[0]}</span>
        )}
      </div>

      {/* Cross-Drive Indicator: If the game is actively installed on another drive */}
      {orphan.installed_on_other_drive && orphan.other_drive_info && (
        <div
          style={{
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            color: "#6ee7b7",
            borderRadius: "4px",
            padding: "3px 6px",
            marginTop: "4px",
            fontSize: "9px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            lineHeight: "1.3",
            boxSizing: "border-box",
          }}
        >
          <FaInfoCircle size={9} style={{ flexShrink: 0, color: "#34d399" }} />
          <span>
            Active game is installed on <strong>{orphan.other_drive_info.storage_type}</strong> ({orphan.other_drive_info.size_formatted}). These are leftover files on this drive.
          </span>
        </div>
      )}

      {/* Expanded Details Preview */}
      {expanded && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.35)",
            borderRadius: "4px",
            padding: "6px 8px",
            marginTop: "6px",
            marginBottom: "6px",
            fontSize: "10px",
            width: "100%",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div style={{ color: "#94a3b8", marginBottom: "2px" }}>
            <strong>Path:</strong>
          </div>
          <div
            style={{
              wordBreak: "break-all",
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: "9px",
              marginBottom: "4px",
              lineHeight: "1.3",
            }}
          >
            {orphan.path}
          </div>

          {orphan.sample_files && orphan.sample_files.length > 0 && (
            <div>
              <div style={{ color: "#94a3b8", marginBottom: "2px" }}>
                <strong>Files preview:</strong>
              </div>
              {orphan.sample_files.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    color: "#9ca3af",
                    fontFamily: "monospace",
                    fontSize: "9px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  📄 {file}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons: Compact styling with high-contrast gamepad focus glow */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginTop: "6px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <DialogButton
          className="orphan-card-btn"
          onClick={() => setExpanded(!expanded)}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            {expanded ? <FaChevronUp size={9} /> : <FaChevronDown size={9} />}
            {expanded ? "Less" : "Details"}
          </span>
        </DialogButton>

        <DialogButton
          className="orphan-card-btn orphan-danger-btn"
          onClick={() => onDelete(orphan)}
          disabled={isDeleting}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            <FaTrash size={9} /> Delete
          </span>
        </DialogButton>
      </div>
    </div>
  );
};
﻿
function Content() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [filterStorage, setFilterStorage] = useState<"all" | "internal" | "sd">("all");
  const [showInstalled, setShowInstalled] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const runScan = async (suppressToast: boolean = false) => {
    try {
      setLoading(true);
      const res = await scanOrphansApi();
      setScanResult(res);
      setSelectedPaths(new Set());
      if (!suppressToast && res && res.total_orphan_count !== undefined) {
        toaster.toast({
          title: "Scan Completed",
          body: `Found ${res.total_orphan_count} orphan(s) (${res.total_orphaned_formatted})`,
          duration: 4000,
        });
      }
    } catch (err) {
      console.error("Scan error:", err);
      toaster.toast({
        title: "Scan Failed",
        body: String(err),
        critical: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScan(true);
  }, []);

  // Auto-dismiss success feedback after 8 seconds
  useEffect(() => {
    if (!feedback || feedback.type !== "success") return undefined;
    const timer = setTimeout(() => {
      setFeedback((prev) => (prev?.type === "success" ? null : prev));
    }, 8000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const orphans = scanResult?.orphans || [];

  const filteredOrphans = orphans.filter((o) => {
    if (filterStorage === "internal") {
      return !o.storage_type.toLowerCase().includes("sd");
    }
    if (filterStorage === "sd") {
      return o.storage_type.toLowerCase().includes("sd");
    }
    return true;
  });

  const toggleSelect = (path: string) => {
    const updated = new Set(selectedPaths);
    if (updated.has(path)) {
      updated.delete(path);
    } else {
      updated.add(path);
    }
    setSelectedPaths(updated);
  };

  const selectAll = () => {
    const allFiltered = new Set(filteredOrphans.map((o) => o.path));
    setSelectedPaths(allFiltered);
  };

  const deselectAll = () => {
    setSelectedPaths(new Set());
  };

  // Single deletion
  const handleDeleteSingle = (orphan: OrphanFolder) => {
    showModal(
      <ConfirmModal
        strTitle="Delete Orphaned Folder?"
        strDescription={
          <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
            <p style={{ margin: "4px 0" }}>Are you sure you want to delete this folder?</p>
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                padding: "6px",
                borderRadius: "4px",
                margin: "6px 0",
                fontFamily: "monospace",
                wordBreak: "break-all",
                fontSize: "11px",
              }}
            >
              {orphan.path}
            </div>
            <p style={{ color: "#4ade80", fontWeight: "bold", margin: "4px 0" }}>
              Space to reclaim: {orphan.size_formatted}
            </p>
            {orphan.installed_on_other_drive && orphan.other_drive_info && (
              <p style={{ color: "#34d399", fontSize: "11px", margin: "4px 0" }}>
                ℹ️ Active game is installed on {orphan.other_drive_info.storage_type} ({orphan.other_drive_info.size_formatted}) and will NOT be affected.
              </p>
            )}
            <p style={{ color: "#f87171", fontSize: "10px", margin: "4px 0" }}>
              ⚠️ Action cannot be undone. Folder does not match any installed game on this drive.
            </p>
          </div>
        }
        bDestructiveWarning={true}
        strOKButtonText="Permanently Delete"
        strCancelButtonText="Cancel"
        onOK={async () => {
          try {
            setIsDeleting(true);
            setFeedback({
              type: "deleting",
              title: "Deleting...",
              message: `Removing "${orphan.name}" (${orphan.size_formatted})`,
            });

            const res = await deleteOrphanApi(orphan.path);
            if (res.success) {
              const freed = res.freed_formatted || orphan.size_formatted;
              // 1. Prominent SteamOS Notification Toast
              toaster.toast({
                title: "Orphan Deleted",
                body: `Successfully deleted "${orphan.name}" (${freed} reclaimed)`,
                critical: true,
                playSound: true,
                duration: 5000,
              });

              // 2. Persistent In-UI Banner Feedback
              setFeedback({
                type: "success",
                title: "Deletion Complete",
                message: `Deleted "${orphan.name}" • Reclaimed ${freed}`,
              });

              // 3. Refresh orphan list
              await runScan(true);
            } else {
              toaster.toast({
                title: "Delete Failed",
                body: res.error || "Unknown error",
                critical: true,
              });
              setFeedback({
                type: "error",
                title: "Delete Failed",
                message: res.error || "Could not delete folder",
              });
            }
          } catch (err) {
            toaster.toast({
              title: "Delete Error",
              body: String(err),
              critical: true,
            });
            setFeedback({
              type: "error",
              title: "Delete Error",
              message: String(err),
            });
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    );
  };

  // Bulk Delete Selected
  const handleDeleteSelected = () => {
    const selectedOrphans = filteredOrphans.filter((o) => selectedPaths.has(o.path));
    if (selectedOrphans.length === 0) return;

    const totalSelectedBytes = selectedOrphans.reduce((sum, o) => sum + o.size_bytes, 0);
    const totalSelectedFormatted = formatBytes(totalSelectedBytes);

    showModal(
      <ConfirmModal
        strTitle={`Delete ${selectedOrphans.length} Selected Folder(s)?`}
        strDescription={
          <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
            <p style={{ margin: "4px 0" }}>
              Are you sure you want to permanently delete <strong>{selectedOrphans.length}</strong> selected folder(s)?
            </p>
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                padding: "6px",
                borderRadius: "4px",
                margin: "6px 0",
                maxHeight: "90px",
                overflowY: "auto",
                fontSize: "11px",
              }}
            >
              {selectedOrphans.map((o) => (
                <div key={o.path} style={{ fontFamily: "monospace", color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  • {o.name} ({o.size_formatted})
                </div>
              ))}
            </div>
            <p style={{ color: "#4ade80", fontWeight: "bold", margin: "4px 0" }}>
              Total space to reclaim: {totalSelectedFormatted}
            </p>
            <p style={{ color: "#f87171", fontSize: "10px", margin: "4px 0" }}>
              ⚠️ These folders are not registered to any installed Steam game on their respective drives. Action cannot be undone.
            </p>
          </div>
        }
        bDestructiveWarning={true}
        strOKButtonText={`Delete Selected (${selectedOrphans.length})`}
        strCancelButtonText="Cancel"
        onOK={async () => {
          try {
            setIsDeleting(true);
            setFeedback({
              type: "deleting",
              title: "Deleting Selected...",
              message: `Removing ${selectedOrphans.length} folder(s) (${totalSelectedFormatted})`,
            });

            const paths = selectedOrphans.map((o) => o.path);
            const res = await deleteOrphansApi(paths);
            if (res.success || res.deleted_count > 0) {
              const freed = res.total_freed_formatted || totalSelectedFormatted;
              // 1. Prominent SteamOS Notification Toast
              toaster.toast({
                title: "Deletion Complete",
                body: `Deleted ${res.deleted_count} folder(s). Reclaimed ${freed}`,
                critical: true,
                playSound: true,
                duration: 5000,
              });

              // 2. Persistent In-UI Banner Feedback
              setFeedback({
                type: "success",
                title: "Deletion Complete",
                message: `Successfully deleted ${res.deleted_count} folder(s) • Reclaimed ${freed}`,
              });

              // 3. Refresh scan
              await runScan(true);
            } else {
              toaster.toast({
                title: "Delete Failed",
                body: res.error || "Failed to delete selected folders",
                critical: true,
              });
              setFeedback({
                type: "error",
                title: "Delete Failed",
                message: res.error || "Failed to delete selected folders",
              });
            }
          } catch (err) {
            toaster.toast({
              title: "Batch Delete Error",
              body: String(err),
              critical: true,
            });
            setFeedback({
              type: "error",
              title: "Batch Delete Error",
              message: String(err),
            });
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    );
  };

  // Bulk Delete All
  const handleDeleteAll = () => {
    if (filteredOrphans.length === 0) return;

    const totalBytes = filteredOrphans.reduce((sum, o) => sum + o.size_bytes, 0);
    const totalFormatted = formatBytes(totalBytes);

    showModal(
      <ConfirmModal
        strTitle={`Delete ALL ${filteredOrphans.length} Orphan(s)?`}
        strDescription={
          <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
            <p style={{ color: "#f87171", fontWeight: "bold", margin: "4px 0" }}>
              ⚠️ WARNING: This will permanently delete ALL {filteredOrphans.length} orphaned folder(s)!
            </p>
            <p style={{ color: "#4ade80", fontWeight: "bold", margin: "6px 0" }}>
              Total space to reclaim: {totalFormatted}
            </p>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "4px 0" }}>
              None of these folders belong to active installed Steam games on these drives. This operation cannot be reversed.
            </p>
          </div>
        }
        bDestructiveWarning={true}
        strOKButtonText={`Delete ALL (${filteredOrphans.length})`}
        strCancelButtonText="Cancel"
        onOK={async () => {
          try {
            setIsDeleting(true);
            setFeedback({
              type: "deleting",
              title: "Deleting All...",
              message: `Removing all ${filteredOrphans.length} orphaned folder(s)`,
            });

            const paths = filteredOrphans.map((o) => o.path);
            const res = await deleteOrphansApi(paths);
            const freed = res.total_freed_formatted || totalFormatted;

            // 1. Prominent SteamOS Notification Toast
            toaster.toast({
              title: "Cleanup Complete",
              body: `Deleted ${res.deleted_count} folder(s). Reclaimed ${freed}`,
              critical: true,
              playSound: true,
              duration: 5000,
            });

            // 2. Persistent In-UI Banner Feedback
            setFeedback({
              type: "success",
              title: "All Orphans Cleaned",
              message: `Deleted ${res.deleted_count} folder(s) • Reclaimed ${freed}`,
            });

            // 3. Refresh scan
            await runScan(true);
          } catch (err) {
            toaster.toast({
              title: "Delete All Error",
              body: String(err),
              critical: true,
            });
            setFeedback({
              type: "error",
              title: "Delete Error",
              message: String(err),
            });
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    );
  };

  const internalCount = orphans.filter((o) => !o.storage_type.toLowerCase().includes("sd")).length;
  const sdCount = orphans.filter((o) => o.storage_type.toLowerCase().includes("sd")).length;
  const selectedCount = filteredOrphans.filter((o) => selectedPaths.has(o.path)).length;

  return (
    <div style={{ width: "100%", boxSizing: "border-box" }}>
      {/* High-visibility Gamepad Focus & Button Highlight Styles */}
      <style>{`
        /* Focusable Card Row for Gamepad Selection */
        .orphan-item-row:focus,
        .orphan-item-row.gpfocus,
        .orphan-item-row[data-focus=true] {
          outline: 2px solid #60a5fa !important;
          box-shadow: 0 0 8px rgba(96, 165, 250, 0.8) !important;
          background-color: rgba(59, 130, 246, 0.3) !important;
        }

        /* Card Buttons Default */
        .orphan-card-btn {
          min-width: 0 !important;
          width: 100% !important;
          flex: 1 1 0 !important;
          padding: 3px 6px !important;
          height: 26px !important;
          min-height: 26px !important;
          max-height: 28px !important;
          font-size: 11px !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          transition: background-color 0.15s ease, box-shadow 0.15s ease !important;
        }

        /* Card Buttons Normal Focus */
        .orphan-card-btn:focus,
        .orphan-card-btn.gpfocus,
        .orphan-card-btn[data-focus=true] {
          outline: 2px solid #ffffff !important;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.9) !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
        }

        /* Delete Button Default */
        .orphan-danger-btn {
          background-color: rgba(239, 68, 68, 0.25) !important;
          color: #fca5a5 !important;
        }

        /* Delete Button High-Intensity Gamepad Focus Highlight */
        .orphan-danger-btn:focus,
        .orphan-danger-btn.gpfocus,
        .orphan-danger-btn[data-focus=true] {
          outline: 2px solid #ffffff !important;
          box-shadow: 0 0 10px rgba(239, 68, 68, 1) !important;
          background-color: #ef4444 !important;
          color: #ffffff !important;
        }

        /* Tab Buttons Default & Focus */
        .orphan-tab-btn {
          min-width: 0 !important;
          width: 100% !important;
          flex: 1 1 0 !important;
          padding: 3px 2px !important;
          height: 26px !important;
          min-height: 26px !important;
          max-height: 26px !important;
          font-size: 10px !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          text-align: center !important;
        }
        .orphan-tab-btn:focus,
        .orphan-tab-btn.gpfocus,
        .orphan-tab-btn[data-focus=true] {
          outline: 2px solid #ffffff !important;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.9) !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
        }

        /* Action Buttons Focus */
        .orphan-action-btn {
          min-width: 0 !important;
          width: 100% !important;
          flex: 1 1 0 !important;
          padding: 4px 6px !important;
          height: 28px !important;
          min-height: 28px !important;
          max-height: 30px !important;
          font-size: 11px !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .orphan-action-btn:focus,
        .orphan-action-btn.gpfocus,
        .orphan-action-btn[data-focus=true] {
          outline: 2px solid #ffffff !important;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.9) !important;
        }

        /* Bulk Delete All Button Focus */
        .orphan-delete-all-btn:focus,
        .orphan-delete-all-btn.gpfocus,
        .orphan-delete-all-btn[data-focus=true] {
          outline: 2px solid #ffffff !important;
          box-shadow: 0 0 10px rgba(239, 68, 68, 1) !important;
          background-color: #ef4444 !important;
          color: #ffffff !important;
        }
      `}</style>

      {/* Scan Section */}
      <PanelSection title="Orphan Scanner">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => runScan(false)}
            disabled={loading || isDeleting}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "12px",
              }}
            >
              {loading ? (
                <>
                  <Spinner style={{ width: "14px", height: "14px" }} />
                  Scanning Steam Libraries...
                </>
              ) : (
                <>
                  <FaSyncAlt size={12} />
                  Scan for Orphaned Folders
                </>
              )}
            </span>
          </ButtonItem>
        </PanelSectionRow>

        {/* Live Feedback Banner (Deletion In-Progress, Success, or Error) */}
        {feedback && (
          <PanelSectionRow>
            <div
              style={{
                backgroundColor:
                  feedback.type === "success"
                    ? "rgba(34, 197, 94, 0.2)"
                    : feedback.type === "deleting"
                    ? "rgba(59, 130, 246, 0.2)"
                    : "rgba(239, 68, 68, 0.2)",
                border:
                  feedback.type === "success"
                    ? "1px solid rgba(34, 197, 94, 0.5)"
                    : feedback.type === "deleting"
                    ? "1px solid rgba(59, 130, 246, 0.5)"
                    : "1px solid rgba(239, 68, 68, 0.5)",
                borderRadius: "6px",
                padding: "8px 10px",
                width: "100%",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                {feedback.type === "success" && (
                  <FaCheckCircle size={15} style={{ color: "#4ade80", flexShrink: 0 }} />
                )}
                {feedback.type === "deleting" && (
                  <Spinner style={{ width: "14px", height: "14px", flexShrink: 0 }} />
                )}
                {feedback.type === "error" && (
                  <FaExclamationTriangle size={15} style={{ color: "#f87171", flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "11px",
                      color:
                        feedback.type === "success"
                          ? "#4ade80"
                          : feedback.type === "deleting"
                          ? "#60a5fa"
                          : "#f87171",
                    }}
                  >
                    {feedback.title}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#e2e8f0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {feedback.message}
                  </div>
                </div>
              </div>
              {feedback.type !== "deleting" && (
                <div
                  onClick={() => setFeedback(null)}
                  style={{
                    cursor: "pointer",
                    color: "#94a3b8",
                    padding: "4px",
                    fontSize: "11px",
                    flexShrink: 0,
                  }}
                  title="Dismiss"
                >
                  <FaTimes />
                </div>
              )}
            </div>
          </PanelSectionRow>
        )}

        {/* Scan Summary Banner */}
        {scanResult && (
          <PanelSectionRow>
            <div
              style={{
                backgroundColor:
                  scanResult.total_orphan_count > 0
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(34, 197, 94, 0.15)",
                border:
                  scanResult.total_orphan_count > 0
                    ? "1px solid rgba(245, 158, 11, 0.3)"
                    : "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "6px",
                padding: "8px 10px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  color: scanResult.total_orphan_count > 0 ? "#fbbf24" : "#4ade80",
                }}
              >
                {scanResult.total_orphan_count > 0 ? (
                  <>
                    <FaExclamationTriangle size={12} />
                    <span>{scanResult.total_orphan_count} Orphaned Folder(s) Found</span>
                  </>
                ) : (
                  <>
                    <FaCheckCircle size={12} />
                    <span>All Clean! No Orphans Found</span>
                  </>
                )}
              </div>

              <div
                style={{
                  fontSize: "10px",
                  color: "#cbd5e1",
                  marginTop: "4px",
                  lineHeight: "1.4",
                }}
              >
                {scanResult.total_orphan_count > 0 ? (
                  <>
                    Reclaimable:{" "}
                    <strong style={{ color: "#ffffff" }}>
                      {scanResult.total_orphaned_formatted}
                    </strong>
                    {" "}(checked vs {scanResult.installed_game_count} games).
                  </>
                ) : (
                  <>
                    All folders match active games ({scanResult.installed_game_count} games verified).
                  </>
                )}
              </div>
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {/* Orphans Section */}
      {orphans.length > 0 && (
        <PanelSection title={`Orphaned Folders (${filteredOrphans.length})`}>
          {/* Storage Filter Tabs */}
          {(internalCount > 0 && sdCount > 0) && (
            <PanelSectionRow>
              <div style={{ display: "flex", gap: "4px", width: "100%", boxSizing: "border-box", marginBottom: "4px" }}>
                <DialogButton
                  className="orphan-tab-btn"
                  onClick={() => setFilterStorage("all")}
                  style={{ opacity: filterStorage === "all" ? 1 : 0.6 }}
                >
                  All ({orphans.length})
                </DialogButton>
                <DialogButton
                  className="orphan-tab-btn"
                  onClick={() => setFilterStorage("internal")}
                  style={{ opacity: filterStorage === "internal" ? 1 : 0.6 }}
                >
                  Internal ({internalCount})
                </DialogButton>
                <DialogButton
                  className="orphan-tab-btn"
                  onClick={() => setFilterStorage("sd")}
                  style={{ opacity: filterStorage === "sd" ? 1 : 0.6 }}
                >
                  SD Card ({sdCount})
                </DialogButton>
              </div>
            </PanelSectionRow>
          )}

          {/* Bulk Selection and Batch Action Bar */}
          <PanelSectionRow>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                width: "100%",
                boxSizing: "border-box",
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "6px",
                borderRadius: "6px",
                marginBottom: "6px",
              }}
            >
              {/* Select All / Deselect Row */}
              <div style={{ display: "flex", gap: "4px", width: "100%", boxSizing: "border-box" }}>
                <DialogButton
                  className="orphan-action-btn"
                  onClick={selectedCount === filteredOrphans.length ? deselectAll : selectAll}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                    {selectedCount === filteredOrphans.length ? <FaTimes size={10} /> : <FaCheckDouble size={10} />}
                    {selectedCount === filteredOrphans.length ? "Deselect All" : "Select All"}
                  </span>
                </DialogButton>

                {selectedCount > 0 && (
                  <DialogButton
                    className="orphan-action-btn orphan-danger-btn"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                  >
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <FaTrash size={9} /> Delete Selected ({selectedCount})
                    </span>
                  </DialogButton>
                )}
              </div>

              {/* Delete All Button */}
              <DialogButton
                className="orphan-action-btn orphan-delete-all-btn"
                onClick={handleDeleteAll}
                disabled={isDeleting}
                style={{
                  backgroundColor: "rgba(185, 28, 28, 0.3) !important",
                  color: "#fca5a5 !important",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  <FaTrash size={9} /> Delete All ({filteredOrphans.length})
                </span>
              </DialogButton>
            </div>
          </PanelSectionRow>

          {/* Cards List */}
          <PanelSectionRow>
            <div style={{ width: "100%", boxSizing: "border-box" }}>
              {filteredOrphans.map((orphan) => (
                <OrphanCard
                  key={orphan.path}
                  orphan={orphan}
                  isSelected={selectedPaths.has(orphan.path)}
                  onToggleSelect={() => toggleSelect(orphan.path)}
                  onDelete={handleDeleteSingle}
                  isDeleting={isDeleting}
                />
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}

      {/* Verified Games Section */}
      {scanResult && (
        <PanelSection title="Steam Libraries & Games">
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={() => setShowInstalled(!showInstalled)}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  fontSize: "11px",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaGamepad size={12} />
                  Verified Games ({scanResult.installed_game_count})
                </span>
                {showInstalled ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
              </span>
            </ButtonItem>
          </PanelSectionRow>

          {showInstalled && (
            <>
              <PanelSectionRow>
                <div
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    borderRadius: "4px",
                    padding: "6px",
                    fontSize: "10px",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ color: "#94a3b8", marginBottom: "4px" }}>
                    <FaInfoCircle style={{ marginRight: "3px" }} />
                    Active games (protected from deletion):
                  </div>

                  <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                    {scanResult.installed_games.map((game) => (
                      <div
                        key={game.appid}
                        style={{
                          padding: "3px 0",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "6px" }}>
                          <span style={{ color: "#f3f4f6", fontWeight: "500" }}>{game.name}</span>
                          <span style={{ color: "#64748b", fontSize: "9px", display: "block" }}>
                            📁 {game.installdir}
                          </span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "9px", whiteSpace: "nowrap" }}>
                          {game.size_formatted}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </PanelSectionRow>

              {scanResult.libraries.length > 0 && (
                <PanelSectionRow>
                  <div style={{ fontSize: "10px", color: "#64748b", width: "100%" }}>
                    <strong>Scanned Library Paths:</strong>
                    {scanResult.libraries.map((lib, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontFamily: "monospace",
                          fontSize: "9px",
                          marginTop: "2px",
                          color: lib.exists ? "#94a3b8" : "#64748b",
                        }}
                      >
                        • {lib.common_dir} {lib.exists ? "" : "(not found)"}
                      </div>
                    ))}
                  </div>
                </PanelSectionRow>
              )}
            </>
          )}
        </PanelSection>
      )}
    </div>
  );
}

export default definePlugin(() => {
  return {
    name: "Orphan Finder",
    titleView: <div className={staticClasses.Title}>Steam Orphan Finder</div>,
    content: <Content />,
    icon: <FaBroom />,
    onDismount() {},
  };
});
