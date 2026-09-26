"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNavbar from "@/components/DashboardNavbar";
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
  ExternalLink,
  X,
  Phone,
  User,
  ShieldCheck,
  CheckCheck,
  MessageSquare,
  Send,
  MessageCircle,
} from "lucide-react";
import toast from "react-hot-toast";

interface DocFile {
  id?: string;
  fileKey?: string;
  isViewed?: boolean;
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

interface UserAuth {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function CandidateCvExplorerPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserAuth | null>(null);
  const [folders, setFolders] = useState<CandidateFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Modal Preview state
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);

  // WhatsApp Message Modal state
  const [messageTarget, setMessageTarget] = useState<CandidateFolder | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  // 1. Authenticate user
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.role !== "admin") {
            router.push("/dashboard");
            return;
          }
          setCurrentUser({
            id: data.id,
            name: data.name,
            email: data.email || "",
            role: data.role,
          });
        } else {
          router.push("/");
        }
      } catch {
        router.push("/");
      }
    })();
  }, [router]);

  // 2. Fetch CV Tree Data
  const loadCvFolders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cv/list");
      if (res.ok) {
        const data = await res.json();
        const folderList: CandidateFolder[] = Array.isArray(data?.folders) ? data.folders : [];

        // Synchronize with local storage watermark
        const localMarkAll = typeof window !== "undefined" ? localStorage.getItem("cv_last_mark_all_read") : null;
        const localMarkAllTime = localMarkAll ? new Date(localMarkAll).getTime() : 0;
        let localSavedKeys = new Set<string>();
        try {
          if (typeof window !== "undefined") {
            localSavedKeys = new Set(JSON.parse(localStorage.getItem("cv_viewed_keys") || "[]"));
          }
        } catch {}

        const processedList = folderList.map((folder) => ({
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

        // Auto-expand all folders by default so everything is immediately visible
        const allKeys = new Set(processedList.map((f) => f.phone));
        setExpandedFolders(allKeys);
      }
    } catch (err) {
      console.error("Failed to load CV folders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      loadCvFolders();
    }
  }, [currentUser]);

  // Toggle single folder
  const toggleFolder = (phone: string) => {
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

  // Expand / Collapse all
  const expandAll = () => {
    setExpandedFolders(new Set(folders.map((f) => f.phone)));
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  // Mark document as viewed
  const markAsViewed = async (file: DocFile, folderPhone?: string) => {
    const key = file.fileKey || file.id || (folderPhone ? `${folderPhone}_${file.fileName}` : `${file.fileName}`);
    if (!key || file.isViewed) return;

    // Optimistically mark viewed in state
    setFolders((prev) =>
      prev.map((f) => ({
        ...f,
        files: (f.files || []).map((item) => {
          const itemKey = item.fileKey || item.id || (f.phone ? `${f.phone}_${item.fileName}` : `${item.fileName}`);
          return itemKey === key ? { ...item, isViewed: true } : item;
        }),
      }))
    );

    // Save to localStorage for instant synchronization across tabs & navbar
    try {
      const saved = JSON.parse(localStorage.getItem("cv_viewed_keys") || "[]");
      if (!saved.includes(key)) {
        saved.push(key);
        localStorage.setItem("cv_viewed_keys", JSON.stringify(saved));
      }
    } catch {}

    try {
      await fetch("/api/cv/viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: key }),
      });
    } catch (err) {
      console.error("Failed to mark document viewed:", err);
    }
  };

  // Mark all documents as viewed
  const markAllAsViewed = async () => {
    const allKeys: string[] = [];
    for (const folder of folders || []) {
      for (const f of folder.files || []) {
        const fKey = String(f.fileKey || f.id || `${folder.phone}_${f.fileName}`);
        if (fKey) allKeys.push(fKey);
      }
    }

    setFolders((prevFolders) =>
      prevFolders.map((folder) => ({
        ...folder,
        files: (folder.files || []).map((f) => ({ ...f, isViewed: true })),
      }))
    );

    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem("cv_last_mark_all_read", nowIso);
      const saved = JSON.parse(localStorage.getItem("cv_viewed_keys") || "[]");
      const merged = Array.from(new Set([...saved, ...allKeys]));
      localStorage.setItem("cv_viewed_keys", JSON.stringify(merged));
    } catch {}

    try {
      await fetch("/api/cv/viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true, fileKeys: allKeys }),
      });
    } catch (err) {
      console.error("Failed to mark all documents viewed:", err);
    }
  };

  // Open WhatsApp message modal for candidate
  const handleOpenSendMessage = (folder: CandidateFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessageTarget(folder);
    setMessageText("");
  };

  // Dispatch WhatsApp message via API
  const handleSendMessage = async () => {
    if (!messageTarget || !messageText.trim()) {
      toast.error("Please enter a message to send.");
      return;
    }

    setSendingMessage(true);
    const toastId = toast.loading(`Sending WhatsApp message to ${messageTarget.candidateName}...`);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: messageTarget.phone,
          candidateName: messageTarget.candidateName,
          message: messageText.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Message sent to +${messageTarget.phone} successfully!`, { id: toastId });
        setMessageTarget(null);
        setMessageText("");
      } else {
        toast.error(data.error || "Failed to send WhatsApp message", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error while sending message", { id: toastId });
    } finally {
      setSendingMessage(false);
    }
  };

  // Filtered folders based on search (100% null-safe)
  const filteredFolders = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return folders || [];

    return (folders || [])
      .map((folder) => {
        if (!folder) return null;
        const phoneMatch = String(folder.phone || "").toLowerCase().includes(q);
        const nameMatch = String(folder.candidateName || "").toLowerCase().includes(q);
        const filesArr = Array.isArray(folder.files) ? folder.files : [];
        const matchingFiles = filesArr.filter((file) =>
          String(file?.fileName || "").toLowerCase().includes(q)
        );

        if (phoneMatch || nameMatch) {
          return folder;
        }

        if (matchingFiles.length > 0) {
          return {
            ...folder,
            files: matchingFiles,
          };
        }

        return null;
      })
      .filter(Boolean) as CandidateFolder[];
  }, [folders, search]);

  const totalDocsCount = useMemo(() => {
    return (filteredFolders || []).reduce(
      (acc, f) => acc + (Array.isArray(f?.files) ? f.files.length : 0),
      0
    );
  }, [filteredFolders]);

  const unreadDocsCount = useMemo(() => {
    return (folders || []).reduce(
      (acc, f) => acc + (Array.isArray(f?.files) ? f.files.filter((file) => !file.isViewed).length : 0),
      0
    );
  }, [folders]);

  const formatSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileName?: string, mime?: string) => {
    const lower = String(fileName || "").toLowerCase();
    const mimeLower = String(mime || "").toLowerCase();
    if (lower.endsWith(".pdf") || mimeLower.includes("pdf")) {
      return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
    }
    if (
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp") ||
      mimeLower.includes("image")
    ) {
      return <ImageIcon className="w-4 h-4 text-purple-500 shrink-0" />;
    }
    return <FileGeneric className="w-4 h-4 text-blue-500 shrink-0" />;
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      <DashboardNavbar user={currentUser as any} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400 mb-1">
              <Link href="/dashboard" className="hover:underline">Dashboard</Link>
              <span>/</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">cv/</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
              <span>Candidate CV & Documents Vault</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-500/20">
                cv/ &lt;candidate_phone&gt;/
              </span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              All candidate CVs, PDFs, and images organized per candidate phone number.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center shadow-xs">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium">Candidates</div>
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{filteredFolders.length}</div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center shadow-xs">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium">Total Files</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{totalDocsCount}</div>
            </div>
            {unreadDocsCount > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-center shadow-xs">
                <div className="text-[11px] text-red-600 dark:text-red-400 uppercase tracking-wider font-semibold">New / Unread</div>
                <div className="text-lg font-bold text-red-600 dark:text-red-400">{unreadDocsCount}</div>
              </div>
            )}
          </div>
        </div>

        {/* Toolbar: Search & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search phone number, candidate name, or file name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            {unreadDocsCount > 0 && (
              <button
                onClick={markAllAsViewed}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition shadow-xs"
                title="Mark all candidate documents as viewed"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark All Read</span>
              </button>
            )}
            <button
              onClick={expandAll}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition"
            >
              Collapse All
            </button>
            <button
              onClick={loadCvFolders}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Folder Tree UI */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          {/* Root Directory Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 font-mono text-sm">
            <div className="flex items-center gap-2.5">
              <Folder className="w-5 h-5 text-amber-500 fill-amber-500/20" />
              <span className="font-bold text-zinc-900 dark:text-zinc-100">cv/</span>
              <span className="text-xs text-zinc-500 font-sans">
                (Root repository &bull; {filteredFolders.length} Candidate Folders)
              </span>
            </div>
            <div className="text-xs font-sans text-zinc-400">
              Format: <code className="bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">cv/&lt;candidate_phone_number&gt;/</code>
            </div>
          </div>

          {/* Folder Content / Candidates List */}
          <div className="p-4 space-y-3 font-mono">
            {loading ? (
              <div className="py-12 text-center text-sm text-zinc-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500" />
                <p>Loading candidate folders...</p>
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-400 space-y-2">
                <Folder className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" />
                <p className="font-sans font-medium text-zinc-600 dark:text-zinc-400">
                  {search ? `No candidate folders match "${search}"` : "No candidate CVs found in cv/ directory"}
                </p>
                <p className="text-xs font-sans text-zinc-500">
                  Candidate PDFs and images sent via WhatsApp or CRM will appear here automatically.
                </p>
              </div>
            ) : (
              filteredFolders.map((folder, folderIdx) => {
                const isExpanded = expandedFolders.has(folder.phone);
                const isLastFolder = folderIdx === filteredFolders.length - 1;

                return (
                  <div key={folder.phone} className="space-y-1">
                    {/* Subfolder Node: └── <candidate_phone_number>/ */}
                    <div
                      onClick={() => toggleFolder(folder.phone)}
                      className="group flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                    >
                      <div className="flex items-center gap-2">
                        {/* Tree connector glyph */}
                        <span className="text-zinc-400 select-none text-xs">
                          {isLastFolder ? "└──" : "├──"}
                        </span>

                        {/* Chevron expander */}
                        <div className="p-0.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>

                        {/* Folder Icon */}
                        {isExpanded ? (
                          <FolderOpen className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                        ) : (
                          <Folder className="w-5 h-5 text-amber-500" />
                        )}

                        {/* Phone Number Folder Name */}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                          {folder.phone}/
                        </span>

                        {/* Candidate Name Badge */}
                        <span className="font-sans text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-400" />
                          {folder.candidateName}
                        </span>

                        {/* Total files count badge */}
                        <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
                          ({folder.files.length} {folder.files.length === 1 ? "file" : "files"})
                        </span>
                      </div>

                      {/* Right Action: Send Message Button + View Lead */}
                      <div className="flex items-center gap-2 font-sans shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleOpenSendMessage(folder, e)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                          title={`Send WhatsApp message to +${folder.phone}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Send Message</span>
                        </button>

                        {folder.leadId && (
                          <Link
                            href={`/dashboard/leads/${folder.leadId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:underline flex items-center gap-1 transition px-2 py-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                          >
                            <span>Lead #{folder.leadId}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Files inside this folder */}
                    {isExpanded && (
                      <div className="pl-9 space-y-1">
                        {folder.files.map((file, fileIdx) => {
                          const isLastFile = fileIdx === folder.files.length - 1;

                          return (
                            <div
                              key={fileIdx}
                              className="group/file flex items-center justify-between p-2 pl-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition text-xs border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800/80"
                            >
                              <div className="flex items-center gap-2.5 truncate max-w-xl">
                                {/* Tree branch connector */}
                                <span className="text-zinc-400 select-none">
                                  {isLastFile ? "└──" : "├──"}
                                </span>

                                {/* File Type Icon */}
                                {getFileIcon(file.fileName, file.mimeType)}

                                {/* File Name */}
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate">
                                  {file.fileName}
                                </span>

                                {/* File size */}
                                {file.sizeBytes && (
                                  <span className="font-sans text-[11px] text-zinc-400 shrink-0">
                                    ({formatSize(file.sizeBytes)})
                                  </span>
                                )}

                                {/* Source Badge */}
                                <span
                                  className={`font-sans text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                    file.source === "whatsapp"
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                                  }`}
                                >
                                  {file.source === "whatsapp" ? "WhatsApp" : "CRM Doc"}
                                </span>

                                {!file.isViewed && (
                                  <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 font-sans">
                                    NEW
                                  </span>
                                )}
                              </div>

                              {/* Action Buttons: Preview & Download */}
                              <div className="flex items-center gap-1.5 font-sans shrink-0">
                                <button
                                  onClick={() => {
                                    markAsViewed(file, folder.phone);
                                    setPreviewFile(file);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium transition"
                                  title="Preview Document"
                                >
                                  <Eye className="w-3.5 h-3.5 text-zinc-500" />
                                  <span>Preview</span>
                                </button>

                                <a
                                  href={file.downloadUrl}
                                  download={file.fileName}
                                  onClick={() => markAsViewed(file, folder.phone)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition shadow-xs"
                                  title="Download File"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download</span>
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
        </div>
      </main>

      {/* Floating Document Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-4xl h-[85vh] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-3.5 bg-zinc-50 dark:bg-zinc-900/60 shrink-0">
              <div className="flex items-center gap-2.5 truncate max-w-xl">
                {getFileIcon(previewFile.fileName, previewFile.mimeType)}
                <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                  {previewFile.fileName}
                </span>
                {previewFile.sizeBytes && (
                  <span className="text-xs text-zinc-400">
                    ({formatSize(previewFile.sizeBytes)})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewFile.downloadUrl}
                  download={previewFile.fileName}
                  onClick={() => markAsViewed(previewFile)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Viewer */}
            <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 overflow-hidden flex items-center justify-center p-2">
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
                <div className="text-center space-y-3 p-8">
                  <FileGeneric className="w-12 h-12 mx-auto text-zinc-400" />
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Preview not available for this file type.
                  </p>
                  <a
                    href={previewFile.downloadUrl}
                    download={previewFile.fileName}
                    onClick={() => markAsViewed(previewFile)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition shadow-xs"
                  >
                    <Download className="w-4 h-4" /> Download to View
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send WhatsApp Message Modal */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-sans">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-zinc-50 dark:bg-zinc-900/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>Send WhatsApp Message</span>
                  </h3>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                    <span>To:</span>
                    <strong className="text-zinc-800 dark:text-zinc-200">
                      {messageTarget.candidateName}
                    </strong>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                      (+{messageTarget.phone})
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMessageTarget(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Quick Template Pills */}
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Quick Templates
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Hello! We have received your CV & documents for Australia 482 visa assessment. Our senior expert is currently reviewing them.",
                    "Hello! Could you please share your updated resume and educational/experience certificates on this WhatsApp chat?",
                    "Hello! We would like to schedule a free 1-on-1 consultation for your Australia work visa. Please let us know what time works best for you.",
                  ].map((tpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMessageText(tpl)}
                      className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-500/30 text-zinc-700 dark:text-zinc-300 transition"
                    >
                      {idx === 0 && "📄 Received Documents"}
                      {idx === 1 && "📑 Request Updated CV"}
                      {idx === 2 && "📅 Schedule Consultation"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Textarea */}
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Message Content *
                </label>
                <textarea
                  rows={5}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Type your WhatsApp message for ${messageTarget.candidateName}...`}
                  className="w-full p-3 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100 shadow-xs resize-none"
                />
                <div className="flex justify-between items-center text-[11px] text-zinc-400 mt-1">
                  <span>Delivers directly to the candidate's WhatsApp (+{messageTarget.phone})</span>
                  <span>{messageText.length} characters</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-6 py-3.5 bg-zinc-50 dark:bg-zinc-900/60">
              <a
                href={`https://wa.me/${messageTarget.phone.replace(/[^\d]/g, "")}${
                  messageText.trim() ? `?text=${encodeURIComponent(messageText.trim())}` : ""
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:underline flex items-center gap-1 transition"
                title="Open WhatsApp Web chat directly in a new browser tab"
              >
                <span>Open in WhatsApp Web</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMessageTarget(null)}
                  disabled={sendingMessage}
                  className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !messageText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingMessage ? "animate-spin" : ""}`} />
                  <span>{sendingMessage ? "Sending..." : "Send Message"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
