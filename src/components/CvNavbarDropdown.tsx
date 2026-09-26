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
} from "lucide-react";

interface DocFile {
  id?: string;
  fileName: string;
  sizeBytes?: number;
  mimeType?: string;
  url: string;
  downloadUrl: string;
  source: "whatsapp" | "crm_upload" | "disk";
  receivedAt?: string;
}

interface CandidateFolder {
  phone: string;
  leadId?: number | null;
  candidateName: string;
  totalFiles: number;
  files: DocFile[];
  lastUpdated?: string;
}

export default function CvNavbarDropdown({ isActive }: { isActive: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<CandidateFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cv/list");
      if (res.ok) {
        const data = await res.json();
        const list: CandidateFolder[] = Array.isArray(data?.folders) ? data.folders : [];
        setFolders(list);
        setExpandedFolders(new Set(list.map((f) => String(f?.phone || "")).filter(Boolean)));
      }
    } catch (err) {
      console.error("Failed to load CVs in navbar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // Calculate dropdown coordinates relative to trigger button
  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.min(430, window.innerWidth - 32);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - menuWidth - 16);
    }
    setCoords({
      top: rect.bottom + 6,
      left,
      width: menuWidth,
    });
  }, []);

  // Update position on open, resize, scroll
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    const handleScrollOrResize = () => updateCoords();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, updateCoords]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current && buttonRef.current.contains(target)) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setPreviewFile(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleFolder = (phone?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!phone) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  // 100% null-safe filtering: will never throw on null/undefined candidateName, phone, or files
  const filteredFolders = (folders || [])
    .map((folder) => {
      if (!folder) return null;
      const q = String(search || "").trim().toLowerCase();
      if (!q) return folder;

      const phoneStr = String(folder.phone || "").toLowerCase();
      const nameStr = String(folder.candidateName || "").toLowerCase();
      const filesArr = Array.isArray(folder.files) ? folder.files : [];

      const matchPhone = phoneStr.includes(q);
      const matchName = nameStr.includes(q);
      const matchFiles = filesArr.filter((f) =>
        String(f?.fileName || "").toLowerCase().includes(q)
      );

      if (matchPhone || matchName) return folder;
      if (matchFiles.length > 0) return { ...folder, files: matchFiles };
      return null;
    })
    .filter(Boolean) as CandidateFolder[];

  const totalFiles = (folders || []).reduce(
    (sum, f) => sum + (f?.totalFiles || (Array.isArray(f?.files) ? f.files.length : 0)),
    0
  );

  const getFileIcon = (fileName?: string, mime?: string) => {
    const lower = String(fileName || "").toLowerCase();
    const mimeLower = String(mime || "").toLowerCase();
    if (lower.endsWith(".pdf") || mimeLower.includes("pdf")) {
      return <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    }
    if (lower.match(/\.(jpe?g|png|webp|gif)$/) || mimeLower.includes("image")) {
      return <ImageIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
    }
    return <FileGeneric className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Navbar CV Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              fetchFolders();
              setTimeout(updateCoords, 0);
            }
            return next;
          });
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors rounded-md ${
          isOpen || isActive
            ? "border-b-2 border-foreground text-zinc-900 dark:text-zinc-100 font-semibold"
            : "border-b-2 border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:border-zinc-300"
        }`}
        title="View Candidate CVs & Documents (Admin Only)"
      >
        <span>CV</span>
        {totalFiles > 0 && (
          <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-500/20">
            {totalFiles}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180 text-emerald-500" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu Panel — Rendered directly in Body Portal to eliminate any navbar scrollbars */}
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
              <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">cv/</span>
              <span className="text-[11px] font-sans text-zinc-400">
                ({folders.length} candidates &bull; {totalFiles} docs)
              </span>
            </div>
            <div className="flex items-center gap-1 font-sans">
              <button
                type="button"
                onClick={fetchFolders}
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

          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search phone number or document name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-200"
              />
            </div>
          </div>

          {/* Directory Tree Body */}
          <div className="p-3 overflow-y-auto flex-1 font-mono text-xs space-y-2 select-none">
            {loading && folders.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
                <p>Loading candidate folders from database...</p>
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-400 font-sans">
                {search ? "No matching folders found" : "No candidate CVs saved in database yet"}
              </div>
            ) : (
              filteredFolders.map((folder, fIdx) => {
                const phoneKey = String(folder?.phone || `folder_${fIdx}`);
                const isExpanded = expandedFolders.has(phoneKey);
                const isLastFolder = fIdx === filteredFolders.length - 1;
                const fileList = Array.isArray(folder?.files) ? folder.files : [];

                return (
                  <div key={phoneKey} className="space-y-1">
                    {/* Folder Row: └── <candidate_phone_number>/ */}
                    <div
                      onClick={(e) => toggleFolder(phoneKey, e)}
                      className="group flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition text-zinc-800 dark:text-zinc-200"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-zinc-400 select-none text-[11px]">
                          {isLastFolder ? "└──" : "├──"}
                        </span>
                        {isExpanded ? (
                          <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                          {phoneKey}/
                        </span>
                        <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          ({String(folder?.candidateName || "Candidate")})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-zinc-400 font-sans">
                          {fileList.length}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Files inside folder: ├── Resume_John_Doe.pdf */}
                    {isExpanded && (
                      <div className="pl-6 space-y-1">
                        {fileList.map((file, fileIdx) => {
                          const isLastFile = fileIdx === fileList.length - 1;
                          const fileName = String(file?.fileName || "document.pdf");

                          return (
                            <div
                              key={fileIdx}
                              className="group/file flex items-center justify-between p-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition text-[11px]"
                            >
                              <div className="flex items-center gap-1.5 truncate max-w-[240px]">
                                <span className="text-zinc-400 select-none">
                                  {isLastFile ? "└──" : "├──"}
                                </span>
                                {getFileIcon(fileName, file?.mimeType)}
                                <span className="text-zinc-700 dark:text-zinc-300 truncate font-medium">
                                  {fileName}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 font-sans">
                                {file?.sizeBytes && (
                                  <span className="text-[10px] text-zinc-400">
                                    {formatSize(file.sizeBytes)}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewFile(file);
                                  }}
                                  className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                                  title="Instant Preview"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <a
                                  href={file?.downloadUrl || file?.url || "#"}
                                  download={fileName}
                                  onClick={(e) => e.stopPropagation()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
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

          {/* Footer Link to Dedicated Page */}
          <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 shrink-0 flex items-center justify-between font-sans text-xs">
            <span className="text-[11px] text-zinc-400">MongoDB GridFS Storage</span>
            <Link
              href="/dashboard/cv"
              onClick={() => setIsOpen(false)}
              className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>Open Full Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Preview Lightbox Modal — Also mounted to body portal */}
      {previewFile && mounted && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-3xl h-[82vh] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 bg-zinc-50 dark:bg-zinc-900/90 shrink-0 font-sans">
              <div className="flex items-center gap-2 truncate max-w-md">
                {getFileIcon(previewFile.fileName, previewFile.mimeType)}
                <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                  {String(previewFile.fileName || "Document")}
                </span>
                {previewFile.sizeBytes && (
                  <span className="text-[11px] text-zinc-400">
                    ({formatSize(previewFile.sizeBytes)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.downloadUrl || previewFile.url || "#"}
                  download={String(previewFile.fileName || "document")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition"
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
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
