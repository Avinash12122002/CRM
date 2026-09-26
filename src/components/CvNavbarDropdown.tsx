"use client";

import { useEffect, useState, useRef } from "react";
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
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<CandidateFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cv/list");
      if (res.ok) {
        const data = await res.json();
        const list: CandidateFolder[] = data.folders || [];
        setFolders(list);
        // Expand all by default
        setExpandedFolders(new Set(list.map((f) => f.phone)));
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

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFolder = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  const filteredFolders = folders
    .map((folder) => {
      const q = search.trim().toLowerCase();
      if (!q) return folder;
      const matchPhone = folder.phone.toLowerCase().includes(q);
      const matchName = folder.candidateName.toLowerCase().includes(q);
      const matchFiles = folder.files.filter((f) => f.fileName.toLowerCase().includes(q));

      if (matchPhone || matchName) return folder;
      if (matchFiles.length > 0) return { ...folder, files: matchFiles };
      return null;
    })
    .filter(Boolean) as CandidateFolder[];

  const totalFiles = folders.reduce((sum, f) => sum + f.totalFiles, 0);

  const getFileIcon = (fileName: string, mime?: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".pdf") || mime?.includes("pdf")) {
      return <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    }
    if (lower.match(/\.(jpe?g|png|webp|gif)$/) || mime?.includes("image")) {
      return <ImageIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
    }
    return <FileGeneric className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Navbar Tab Trigger */}
      <button
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) fetchFolders();
        }}
        className={`inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors rounded-md ${
          isOpen || isActive
            ? "border-b-2 border-foreground text-zinc-900 dark:text-zinc-100 font-semibold"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
        }`}
        title="View Candidate CVs & Documents"
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

      {/* Dropdown Menu Panel (inside the navbar) */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-96 max-h-[82vh] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-between shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">cv/</span>
              <span className="text-[11px] font-sans text-zinc-400">
                ({folders.length} folders &bull; {totalFiles} files)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchFolders}
                disabled={loading}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                title="Refresh documents"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Search */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search candidate phone or file..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Tree View Body */}
          <div className="p-3 overflow-y-auto flex-1 font-mono text-xs space-y-2 select-none">
            {loading && folders.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
                <p>Loading candidate folders...</p>
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-400">
                {search ? "No matching folders found" : "No candidate CVs saved in database"}
              </div>
            ) : (
              filteredFolders.map((folder, fIdx) => {
                const isExpanded = expandedFolders.has(folder.phone);
                const isLastFolder = fIdx === filteredFolders.length - 1;

                return (
                  <div key={folder.phone} className="space-y-1">
                    {/* Folder Row: └── <candidate_phone_number>/ */}
                    <div
                      onClick={(e) => toggleFolder(folder.phone, e)}
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
                          {folder.phone}/
                        </span>
                        <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          ({folder.candidateName})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-zinc-400 font-sans">
                          {folder.files.length}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Files inside folder */}
                    {isExpanded && (
                      <div className="pl-6 space-y-1">
                        {folder.files.map((file, fileIdx) => {
                          const isLastFile = fileIdx === folder.files.length - 1;

                          return (
                            <div
                              key={fileIdx}
                              className="group/file flex items-center justify-between p-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition text-[11px]"
                            >
                              <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                                <span className="text-zinc-400 select-none">
                                  {isLastFile ? "└──" : "├──"}
                                </span>
                                {getFileIcon(file.fileName, file.mimeType)}
                                <span className="text-zinc-700 dark:text-zinc-300 truncate font-medium">
                                  {file.fileName}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 font-sans">
                                {file.sizeBytes && (
                                  <span className="text-[10px] text-zinc-400">
                                    {formatSize(file.sizeBytes)}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewFile(file);
                                  }}
                                  className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                  title="Preview"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <a
                                  href={file.downloadUrl}
                                  download={file.fileName}
                                  onClick={(e) => e.stopPropagation()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  title="Download"
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

          {/* Footer: Link to Full Page */}
          <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 shrink-0 flex items-center justify-between font-sans text-xs">
            <span className="text-[11px] text-zinc-400">Database Storage (MongoDB)</span>
            <Link
              href="/dashboard/cv"
              onClick={() => setIsOpen(false)}
              className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>Open Full Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Floating Preview Lightbox Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-3xl h-[80vh] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 bg-zinc-50 dark:bg-zinc-900/80 shrink-0">
              <div className="flex items-center gap-2 truncate max-w-md">
                {getFileIcon(previewFile.fileName, previewFile.mimeType)}
                <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                  {previewFile.fileName}
                </span>
                {previewFile.sizeBytes && (
                  <span className="text-[11px] text-zinc-400">
                    ({formatSize(previewFile.sizeBytes)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.downloadUrl}
                  download={previewFile.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Viewer */}
            <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center p-2 overflow-hidden">
              {previewFile.fileName.toLowerCase().endsWith(".pdf") ||
              previewFile.mimeType?.includes("pdf") ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white"
                  title="PDF Preview"
                />
              ) : previewFile.fileName.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ||
                previewFile.mimeType?.includes("image") ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewFile.url}
                    alt={previewFile.fileName}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                  />
                </div>
              ) : (
                <div className="text-center space-y-2 p-6">
                  <FileGeneric className="w-8 h-8 mx-auto text-zinc-400" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Direct preview not available for this file type.
                  </p>
                  <a
                    href={previewFile.downloadUrl}
                    download={previewFile.fileName}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
                  >
                    <Download className="w-3 h-3" /> Download to view
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
