"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Folder,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  File as FileGeneric,
  Search,
  Download,
  Eye,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  X,
  ExternalLink,
  CheckCheck,
  MessageSquare,
} from "lucide-react";

interface DocFile {
  id?: string;
  fileKey?: string;
  isViewed?: boolean;
  fileName: string;
  sizeBytes?: number;
  mimeType?: string;
  url: string;
  downloadUrl: string;
  source: "whatsapp_ireland" | "crm_upload" | "disk";
  receivedAt?: string;
}

interface CandidateFolder {
  phone: string;
  leadId?: number | null;
  candidateName: string;
  country?: string;
  totalFiles: number;
  files: DocFile[];
  lastUpdated?: string;
}

export default function CvIrelandNavbarDropdown({ isActive }: { isActive: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<CandidateFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchFolders = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/cv-ireland/list");
      if (res.ok) {
        const data = await res.json();
        const list: CandidateFolder[] = Array.isArray(data?.folders) ? data.folders : [];
        const localMarkAll = typeof window !== "undefined" ? localStorage.getItem("cv_ireland_last_mark_all_read") : null;
        const localMarkAllTime = localMarkAll ? new Date(localMarkAll).getTime() : 0;
        let localSavedKeys = new Set<string>();
        try {
          if (typeof window !== "undefined") {
            localSavedKeys = new Set(JSON.parse(localStorage.getItem("cv_ireland_viewed_keys") || "[]"));
          }
        } catch {}

        // Apply server + local markAll fallback
        const processedList = list.map((folder) => ({
          ...folder,
          files: (folder.files || []).map((file) => {
            const fKey = String(file.fileKey || file.id || `${folder.phone}_${file.fileName}`);
            const fileTime = file.receivedAt ? new Date(file.receivedAt).getTime() : 0;
            const isViewed = Boolean(
              file.isViewed ||
              localSavedKeys.has(fKey) ||
              (localMarkAllTime > 0 && fileTime > 0 && fileTime <= localMarkAllTime)
            );
            return { ...file, fileKey: fKey, isViewed };
          }),
        }));

        setFolders(processedList);
        setExpandedFolders((prev) => {
          if (prev.size === 0) {
            return new Set(processedList.map((f) => String(f?.phone || "")).filter(Boolean));
          }
          return prev;
        });

        const unread = processedList.reduce((acc, folder) => {
          const folderUnread = (folder.files || []).filter((f) => !f.isViewed).length;
          return acc + folderUnread;
        }, 0);
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error("Failed to load Ireland CV folders in navbar:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders(false);
    const interval = setInterval(() => {
      fetchFolders(false);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 420;
    const screenWidth = window.innerWidth;
    let left = rect.left;
    if (left + dropdownWidth > screenWidth - 16) {
      left = screenWidth - dropdownWidth - 16;
    }
    if (left < 16) left = 16;
    setCoords({
      top: rect.bottom + 8,
      left,
      width: dropdownWidth,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener("resize", updateCoords);
      window.addEventListener("scroll", updateCoords, true);
    }
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [isOpen, updateCoords]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleFolder = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  const markAsViewed = async (file: DocFile, folderPhone?: string) => {
    const key = file.fileKey || file.id || (folderPhone ? `${folderPhone}_${file.fileName}` : `${file.fileName}`);
    if (!key || file.isViewed) return;

    setFolders((prev) =>
      prev.map((f) => ({
        ...f,
        files: (f.files || []).map((item) => {
          const itemKey = item.fileKey || item.id || (f.phone ? `${f.phone}_${item.fileName}` : `${item.fileName}`);
          return itemKey === key ? { ...item, isViewed: true } : item;
        }),
      }))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const saved = JSON.parse(localStorage.getItem("cv_ireland_viewed_keys") || "[]");
      if (!saved.includes(key)) {
        saved.push(key);
        localStorage.setItem("cv_ireland_viewed_keys", JSON.stringify(saved));
      }
    } catch {}

    try {
      await fetch("/api/cv-ireland/viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: key }),
      });
    } catch (err) {
      console.error("Failed to mark Ireland document viewed:", err);
    }
  };

  const markAllAsViewed = async () => {
    const allKeys: string[] = [];
    for (const folder of folders || []) {
      for (const f of folder.files || []) {
        const fKey = String(f.fileKey || f.id || `${folder.phone}_${f.fileName}`);
        if (fKey) allKeys.push(fKey);
      }
    }

    setFolders((prev) =>
      prev.map((folder) => ({
        ...folder,
        files: (folder.files || []).map((f) => ({ ...f, isViewed: true })),
      }))
    );
    setUnreadCount(0);

    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem("cv_ireland_last_mark_all_read", nowIso);
      const saved = JSON.parse(localStorage.getItem("cv_ireland_viewed_keys") || "[]");
      const merged = Array.from(new Set([...saved, ...allKeys]));
      localStorage.setItem("cv_ireland_viewed_keys", JSON.stringify(merged));
    } catch {}

    try {
      await fetch("/api/cv-ireland/viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true, fileKeys: allKeys }),
      });
    } catch (err) {
      console.error("Failed to mark all Ireland documents viewed:", err);
    }
  };

  const filteredFolders = folders
    .map((folder) => {
      if (!search.trim()) return folder;
      const q = search.toLowerCase();
      const phoneMatch = folder.phone.toLowerCase().includes(q);
      const nameMatch = folder.candidateName.toLowerCase().includes(q);
      const matchedFiles = (folder.files || []).filter((f) => f.fileName.toLowerCase().includes(q));

      if (phoneMatch || nameMatch) {
        return folder;
      }
      if (matchedFiles.length > 0) {
        return {
          ...folder,
          files: matchedFiles,
        };
      }
      return null;
    })
    .filter(Boolean) as CandidateFolder[];

  const totalFiles = folders.reduce((acc, f) => acc + (f.files?.length || 0), 0);

  const getFileIcon = (fileName: string, mime?: string) => {
    const fn = (fileName || "").toLowerCase();
    const m = (mime || "").toLowerCase();
    if (fn.endsWith(".pdf") || m.includes("pdf")) {
      return <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    }
    if (fn.match(/\.(jpe?g|png|webp|gif)$/) || m.includes("image")) {
      return <ImageIcon className="w-3.5 h-3.5 text-teal-500 shrink-0" />;
    }
    return <FileGeneric className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Trigger Button inside Navbar */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              fetchFolders(true);
              setTimeout(updateCoords, 0);
            }
            return next;
          });
        }}
        className={`relative inline-flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors rounded-md ${
          isOpen || isActive
            ? "border-b-2 border-foreground text-zinc-900 dark:text-zinc-100 font-semibold"
            : "border-b-2 border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:border-zinc-300"
        }`}
        title="Ireland Candidate CVs & Documents (Admin Only)"
      >
        <span>CV 🇮🇪</span>

        {/* Dynamic Unread Badge */}
        {unreadCount > 0 && (
          <span className="bg-teal-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none shadow-xs animate-in zoom-in duration-150">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}

        <ChevronDown
          className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180 text-teal-500" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu Panel via Body Portal */}
      {isOpen && mounted && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 99999,
          }}
          className="max-h-[80vh] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex items-center justify-between shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-teal-500 fill-teal-500/20" />
              <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">cv-ireland/ 🇮🇪</span>
              <span className="text-[11px] font-sans text-zinc-400">
                ({folders.length} candidates &bull; {totalFiles} docs)
              </span>
              {unreadCount > 0 && (
                <span className="bg-teal-500/15 text-teal-600 dark:text-teal-400 text-[10px] font-semibold px-1.5 py-0.5 rounded font-sans border border-teal-500/20">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 font-sans">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsViewed}
                  className="px-2 py-0.5 text-[11px] rounded text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 flex items-center gap-1 transition"
                  title="Mark all Ireland documents as viewed"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => fetchFolders(true)}
                disabled={loading}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                title="Refresh candidate files"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter Ireland candidates or files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 border-none focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Folder Tree List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
            {loading && folders.length === 0 ? (
              <div className="py-8 text-center text-zinc-400 font-sans text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-500" />
                Loading Ireland candidate folders...
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="py-8 text-center text-zinc-400 font-sans text-xs space-y-1">
                <Folder className="w-6 h-6 mx-auto text-zinc-300 dark:text-zinc-700" />
                <p>No Ireland candidate CVs found</p>
                {search && <p className="text-[11px] text-zinc-500">Try adjusting your search</p>}
              </div>
            ) : (
              filteredFolders.map((folder, fIdx) => {
                const phoneKey = String(folder?.phone || `folder_${fIdx}`);
                const isExpanded = expandedFolders.has(phoneKey);
                const isLastFolder = fIdx === filteredFolders.length - 1;
                const fileList = Array.isArray(folder?.files) ? folder.files : [];
                const folderUnread = fileList.filter((f) => !f.isViewed).length;

                return (
                  <div key={phoneKey} className="space-y-1">
                    {/* Folder Row */}
                    <div
                      onClick={(e) => toggleFolder(phoneKey, e)}
                      className="group flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition text-zinc-800 dark:text-zinc-200"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-zinc-400 select-none text-[11px]">
                          {isLastFolder ? "└──" : "├──"}
                        </span>
                        {isExpanded ? (
                          <FolderOpen className="w-4 h-4 text-teal-500 fill-teal-500/20 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-teal-500 shrink-0" />
                        )}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                          {phoneKey}/
                        </span>
                        <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          ({String(folder?.candidateName || "Candidate")})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          href={`/dashboard/whatsapp-ireland?phone=${phoneKey}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                          }}
                          className="p-1 rounded text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition"
                          title={`Chat on Ireland WhatsApp with +${phoneKey}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Link>
                        {folderUnread > 0 && (
                          <span className="bg-teal-500 text-white text-[9px] font-bold px-1 py-0.2 rounded-full font-sans">
                            {folderUnread}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400 font-sans">
                          {fileList.length}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-teal-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Files inside folder */}
                    {isExpanded && (
                      <div className="pl-6 space-y-1">
                        {fileList.map((file, fileIdx) => {
                          const isLastFile = fileIdx === fileList.length - 1;
                          const fileName = String(file?.fileName || "document.pdf");
                          const isUnread = !file.isViewed;

                          return (
                            <div
                              key={fileIdx}
                              className={`group/file flex items-center justify-between p-1.5 rounded-md transition text-[11px] ${
                                isUnread
                                  ? "bg-teal-50/70 dark:bg-teal-950/30 font-medium text-teal-950 dark:text-teal-200"
                                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                              }`}
                            >
                              <div
                                onClick={() => {
                                  markAsViewed(file, folder.phone);
                                  setPreviewFile(file);
                                }}
                                className="flex items-center gap-1.5 truncate cursor-pointer flex-1"
                              >
                                <span className="text-zinc-400 select-none text-[10px]">
                                  {isLastFile ? "└──" : "├──"}
                                </span>
                                {getFileIcon(fileName, file.mimeType)}
                                <span className="truncate hover:underline" title={fileName}>
                                  {fileName}
                                </span>
                                {file.sizeBytes ? (
                                  <span className="text-[9px] text-zinc-400 shrink-0 font-sans">
                                    ({formatSize(file.sizeBytes)})
                                  </span>
                                ) : null}
                                {isUnread && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 ml-1" />
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover/file:opacity-100 transition">
                                <button
                                  type="button"
                                  onClick={() => {
                                    markAsViewed(file, folder.phone);
                                    setPreviewFile(file);
                                  }}
                                  className="p-1 rounded text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                  title="Quick Preview"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <a
                                  href={file.downloadUrl || file.url || "#"}
                                  download={fileName}
                                  onClick={() => markAsViewed(file, folder.phone)}
                                  className="p-1 rounded text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                  title="Download File"
                                >
                                  <Download className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex items-center justify-between shrink-0 font-sans text-xs">
            <span className="text-[11px] text-zinc-400">
              {totalFiles} Ireland candidate documents stored
            </span>
            <Link
              href="/dashboard/cv-ireland"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline font-medium text-xs"
            >
              <span>Full Ireland Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Preview Modal Portal */}
      {previewFile && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="w-full max-w-4xl h-[85vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                  {String(previewFile.fileName || "Candidate Document")} 🇮🇪
                </span>
                {previewFile.sizeBytes ? (
                  <span className="text-[11px] text-zinc-400 font-sans">
                    ({formatSize(previewFile.sizeBytes)})
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={previewFile.downloadUrl || previewFile.url || "#"}
                  download={String(previewFile.fileName || "document")}
                  className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium inline-flex items-center gap-1 transition"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Viewer */}
            <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center p-2 overflow-hidden">
              {String(previewFile.fileName || "").toLowerCase().endsWith(".pdf") ||
              String(previewFile.mimeType || "").includes("pdf") ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white"
                  title="PDF Preview"
                />
              ) : String(previewFile.fileName || "").toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ||
                String(previewFile.mimeType || "").includes("image") ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewFile.url}
                    alt={String(previewFile.fileName || "Image")}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                  />
                </div>
              ) : (
                <div className="text-center space-y-2 p-6 font-sans">
                  <FileGeneric className="w-8 h-8 mx-auto text-zinc-400" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Direct preview not available for this file type.
                  </p>
                  <a
                    href={previewFile.downloadUrl || previewFile.url || "#"}
                    download={String(previewFile.fileName || "document")}
                    onClick={() => markAsViewed(previewFile)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium"
                  >
                    <Download className="w-3 h-3" /> Download to view
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
