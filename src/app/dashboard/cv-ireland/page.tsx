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
  Trash2,
  AlertTriangle,
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

interface UserAuth {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function IrelandCandidateCvExplorerPage() {
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

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "file" | "folder";
    phone: string;
    candidateName: string;
    fileId?: string;
    fileName?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // 2. Fetch CV Tree Data for Ireland
  const loadCvFolders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cv-ireland/list");
      if (res.ok) {
        const data = await res.json();
        const folderList: CandidateFolder[] = Array.isArray(data?.folders) ? data.folders : [];

        // Synchronize with local storage watermark
        const localMarkAll = typeof window !== "undefined" ? localStorage.getItem("cv_ireland_last_mark_all_read") : null;
        const localMarkAllTime = localMarkAll ? new Date(localMarkAll).getTime() : 0;
        let localSavedKeys = new Set<string>();
        try {
          if (typeof window !== "undefined") {
            localSavedKeys = new Set(JSON.parse(localStorage.getItem("cv_ireland_viewed_keys") || "[]"));
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

        // Auto-expand all folders by default
        const allKeys = new Set(processedList.map((f) => f.phone));
        setExpandedFolders(allKeys);
      }
    } catch (err) {
      console.error("Failed to load Ireland CV folders:", err);
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

    setFolders((prev) =>
      prev.map((f) => ({
        ...f,
        files: (f.files || []).map((item) => {
          const itemKey = item.fileKey || item.id || (f.phone ? `${f.phone}_${item.fileName}` : `${item.fileName}`);
          return itemKey === key ? { ...item, isViewed: true } : item;
        }),
      }))
    );

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
      toast.success("All Ireland CV documents marked as read");
    } catch (err) {
      console.error("Failed to mark all Ireland documents viewed:", err);
    }
  };

  // Open WhatsApp message modal for Ireland candidate
  const handleOpenSendMessage = (folder: CandidateFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessageTarget(folder);
    setMessageText("");
  };

  // Dispatch WhatsApp Ireland message
  const handleSendMessage = async () => {
    if (!messageTarget || !messageText.trim()) {
      toast.error("Please enter a message to send.");
      return;
    }

    setSendingMessage(true);
    const toastId = toast.loading(`Sending Ireland WhatsApp message to ${messageTarget.candidateName}...`);

    try {
      const res = await fetch("/api/whatsapp-ireland/send", {
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
        toast.error(data.error || "Failed to send Ireland WhatsApp message", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error while sending message", { id: toastId });
    } finally {
      setSendingMessage(false);
    }
  };

  // Delete single file
  const handleDeleteFile = async () => {
    if (!deleteTarget || deleteTarget.type !== "file") return;
    setDeleting(true);
    const toastId = toast.loading(`Deleting ${deleteTarget.fileName}...`);
    try {
      const res = await fetch("/api/cv-ireland/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: deleteTarget.phone,
          fileId: deleteTarget.fileId,
          fileName: deleteTarget.fileName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`"${deleteTarget.fileName}" deleted`, { id: toastId });
        setFolders((prev) =>
          prev
            .map((f) => ({
              ...f,
              files: f.phone === deleteTarget.phone
                ? f.files.filter((file) => file.fileName !== deleteTarget.fileName)
                : f.files,
            }))
            .filter((f) => f.files.length > 0 || f.phone !== deleteTarget.phone)
        );
        setDeleteTarget(null);
      } else {
        toast.error(data.error || "Failed to delete file", { id: toastId });
      }
    } catch {
      toast.error("Network error while deleting", { id: toastId });
    } finally {
      setDeleting(false);
    }
  };

  // Delete entire Ireland candidate folder
  const handleDeleteFolder = async () => {
    if (!deleteTarget || deleteTarget.type !== "folder") return;
    setDeleting(true);
    const toastId = toast.loading(`Deleting all files for ${deleteTarget.candidateName}...`);
    try {
      const res = await fetch("/api/cv-ireland/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: deleteTarget.phone, deleteAll: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`All files for ${deleteTarget.candidateName} deleted`, { id: toastId });
        setFolders((prev) => prev.filter((f) => f.phone !== deleteTarget.phone));
        setDeleteTarget(null);
      } else {
        toast.error(data.error || "Failed to delete folder", { id: toastId });
      }
    } catch {
      toast.error("Network error while deleting", { id: toastId });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered folders based on search
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
    return (folders || []).reduce((acc, f) => acc + (f?.files?.length || 0), 0);
  }, [folders]);

  const unreadCount = useMemo(() => {
    let unread = 0;
    for (const folder of folders || []) {
      for (const file of folder?.files || []) {
        if (!file.isViewed) unread++;
      }
    }
    return unread;
  }, [folders]);

  const getFileIcon = (fileName: string, mime?: string) => {
    const fn = (fileName || "").toLowerCase();
    const m = (mime || "").toLowerCase();
    if (fn.endsWith(".pdf") || m.includes("pdf")) {
      return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
    }
    if (fn.match(/\.(jpe?g|png|webp|gif)$/) || m.includes("image")) {
      return <ImageIcon className="w-4 h-4 text-teal-500 shrink-0" />;
    }
    return <FileGeneric className="w-4 h-4 text-zinc-400 shrink-0" />;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      <DashboardNavbar user={(currentUser || { id: 0, name: "", email: "", role: "admin" }) as any} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>Ireland Candidate CV Explorer</span>
                  <span className="text-lg">🇮🇪</span>
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                  Manage incoming resumes and identity documents for Ireland work permit candidates
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <div className="bg-zinc-100 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <User className="w-3.5 h-3.5 text-teal-500" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{folders.length}</span>
              <span className="text-[11px] text-zinc-500">Candidates</span>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <FileText className="w-3.5 h-3.5 text-teal-500" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totalDocsCount}</span>
              <span className="text-[11px] text-zinc-500">Total Files</span>
            </div>

            {unreadCount > 0 && (
              <div className="bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-3 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800/60 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                <span className="font-semibold">{unreadCount}</span>
                <span className="text-[11px]">Unviewed</span>
              </div>
            )}

            <button
              onClick={() => loadCvFolders()}
              disabled={loading}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition"
              title="Refresh Ireland CV list"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-500" : ""}`} />
            </button>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsViewed}
                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium flex items-center gap-1.5 transition text-xs"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: Search & Tree Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by Ireland candidate name, phone, or file name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 transition shadow-2xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <button
              onClick={expandAll}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition"
            >
              Collapse All
            </button>
            <Link
              href="/dashboard/whatsapp-ireland"
              className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 flex items-center gap-1.5 transition font-medium"
            >
              <MessageSquare className="w-3.5 h-3.5 text-teal-500" />
              <span>WhatsApp Live Chat 🇮🇪</span>
            </Link>
          </div>
        </div>

        {/* CV Explorer Tree Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
          {/* Card Path Header */}
          <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between font-mono text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-teal-500 fill-teal-500/20" />
              <span className="font-bold text-zinc-900 dark:text-zinc-100">crm/cv/ireland/</span>
              <span className="text-[11px] font-sans">
                ({filteredFolders.length} candidate {filteredFolders.length === 1 ? "folder" : "folders"})
              </span>
            </div>
            <div className="text-[11px] font-sans text-zinc-400">
              Auto-isolated Ireland candidate storage
            </div>
          </div>

          {/* Tree Explorer Body */}
          <div className="p-4 space-y-2 font-mono text-xs">
            {loading && folders.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 font-sans space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-500" />
                <p className="text-sm">Loading Ireland candidate documents...</p>
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 font-sans space-y-2">
                <Folder className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm font-medium">No Ireland candidate CVs found</p>
                {search ? (
                  <p className="text-xs text-zinc-500">
                    No results matching &ldquo;{search}&rdquo;. Try another term.
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500">
                    When Ireland candidates submit CVs via WhatsApp, their folders will appear here automatically.
                  </p>
                )}
              </div>
            ) : (
              filteredFolders.map((folder, fIdx) => {
                const phoneKey = String(folder?.phone || `folder_${fIdx}`);
                const isExpanded = expandedFolders.has(phoneKey);
                const isLastFolder = fIdx === filteredFolders.length - 1;
                const fileList = Array.isArray(folder?.files) ? folder.files : [];
                const folderUnread = fileList.filter((f) => !f.isViewed).length;

                return (
                  <div
                    key={phoneKey}
                    className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/40"
                  >
                    {/* Folder Header Row */}
                    <div
                      onClick={() => toggleFolder(phoneKey)}
                      className="group flex flex-wrap items-center justify-between p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-2.5 truncate max-w-full sm:max-w-xl">
                        <span className="text-zinc-400 text-[11px] select-none">
                          {isLastFolder ? "└──" : "├──"}
                        </span>
                        {isExpanded ? (
                          <FolderOpen className="w-5 h-5 text-teal-500 fill-teal-500/20 shrink-0" />
                        ) : (
                          <Folder className="w-5 h-5 text-teal-500 shrink-0" />
                        )}
                        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          {phoneKey}/
                        </span>
                        <span className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          ({folder?.candidateName || "Candidate"})
                        </span>
                        <span className="font-sans text-[10px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/60">
                          Ireland 🇮🇪
                        </span>
                        {folder.leadId && (
                          <Link
                            href={`/dashboard/leads/${folder.leadId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-sans text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-teal-600 px-1.5 py-0.5 rounded transition flex items-center gap-1"
                            title={`View CRM Lead #${folder.leadId}`}
                          >
                            <span>Lead #{folder.leadId}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>

                      {/* Folder Actions Right */}
                      <div className="flex items-center gap-2 mt-2 sm:mt-0 font-sans">
                        <button
                          type="button"
                          onClick={(e) => handleOpenSendMessage(folder, e)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition flex items-center gap-1.5"
                          title={`Send Ireland WhatsApp message to +${phoneKey}`}
                        >
                          <Send className="w-3 h-3" />
                          <span>Message</span>
                        </button>

                        <Link
                          href={`/dashboard/whatsapp-ireland?phone=${phoneKey}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition"
                          title="Open live Ireland WhatsApp chat"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Link>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              type: "folder",
                              phone: folder.phone,
                              candidateName: folder.candidateName,
                            });
                          }}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                          title={`Delete all files for ${folder.candidateName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {folderUnread > 0 && (
                          <span className="bg-teal-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                            {folderUnread} new
                          </span>
                        )}

                        <span className="text-xs text-zinc-500 font-mono">
                          {fileList.length} {fileList.length === 1 ? "file" : "files"}
                        </span>

                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-teal-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Files Tree Sublist */}
                    {isExpanded && (
                      <div className="border-t border-zinc-200/80 dark:border-zinc-800/80 p-2 sm:pl-10 space-y-1 bg-white dark:bg-zinc-950">
                        {fileList.length === 0 ? (
                          <div className="py-2 text-zinc-400 text-xs italic pl-4 font-sans">
                            No files stored in this folder
                          </div>
                        ) : (
                          fileList.map((file, fileIdx) => {
                            const isLastFile = fileIdx === fileList.length - 1;
                            const fileName = String(file?.fileName || "document.pdf");
                            const isUnread = !file.isViewed;

                            return (
                              <div
                                key={fileIdx}
                                className={`group/file flex flex-wrap sm:flex-nowrap items-center justify-between p-2 rounded-lg transition text-xs ${
                                  isUnread
                                    ? "bg-teal-50/70 dark:bg-teal-950/40 font-medium text-teal-950 dark:text-teal-200 border border-teal-200/60 dark:border-teal-800/40"
                                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                                }`}
                              >
                                {/* File details left */}
                                <div
                                  onClick={() => {
                                    markAsViewed(file, folder.phone);
                                    setPreviewFile(file);
                                  }}
                                  className="flex items-center gap-2 truncate cursor-pointer flex-1 min-w-[200px]"
                                >
                                  <span className="text-zinc-400 text-[10px] select-none">
                                    {isLastFile ? "└──" : "├──"}
                                  </span>
                                  {getFileIcon(fileName, file.mimeType)}
                                  <span className="truncate hover:underline font-semibold" title={fileName}>
                                    {fileName}
                                  </span>
                                  {file.sizeBytes ? (
                                    <span className="text-[10px] text-zinc-400 shrink-0 font-sans">
                                      ({formatSize(file.sizeBytes)})
                                    </span>
                                  ) : null}
                                  {file.receivedAt && (
                                    <span className="text-[10px] text-zinc-400 shrink-0 font-sans hidden md:inline">
                                      &bull; {formatDate(file.receivedAt)}
                                    </span>
                                  )}
                                  {isUnread && (
                                    <span className="text-[9px] bg-teal-500 text-white px-1.5 py-0.2 rounded font-sans font-bold">
                                      NEW
                                    </span>
                                  )}
                                </div>

                                {/* File actions right */}
                                <div className="flex items-center gap-1.5 mt-1 sm:mt-0 font-sans">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      markAsViewed(file, folder.phone);
                                      setPreviewFile(file);
                                    }}
                                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition flex items-center gap-1 text-[11px]"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Preview</span>
                                  </button>

                                  <a
                                    href={file.downloadUrl || file.url || "#"}
                                    download={fileName}
                                    onClick={() => markAsViewed(file, folder.phone)}
                                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition flex items-center gap-1 text-[11px]"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </a>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteTarget({
                                        type: "file",
                                        phone: folder.phone,
                                        candidateName: folder.candidateName,
                                        fileId: file.id,
                                        fileName,
                                      });
                                    }}
                                    className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                    title={`Delete ${fileName}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="w-full max-w-5xl h-[88vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-5 h-5 text-teal-500 shrink-0" />
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {String(previewFile.fileName || "Candidate Document")} 🇮🇪
                  </h3>
                  {previewFile.sizeBytes ? (
                    <p className="text-xs text-zinc-500 font-mono">
                      {formatSize(previewFile.sizeBytes)} &bull; Ireland Work Permit Review
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewFile.downloadUrl || previewFile.url || "#"}
                  download={String(previewFile.fileName || "document")}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Document</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Preview Frame */}
            <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center p-3 overflow-hidden">
              {String(previewFile.fileName || "").toLowerCase().endsWith(".pdf") ||
              String(previewFile.mimeType || "").includes("pdf") ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white"
                  title="PDF Preview"
                />
              ) : String(previewFile.fileName || "").toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ||
                String(previewFile.mimeType || "").includes("image") ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewFile.url}
                    alt={String(previewFile.fileName || "Image")}
                    className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                  />
                </div>
              ) : (
                <div className="text-center space-y-3 p-8 font-sans">
                  <FileGeneric className="w-12 h-12 mx-auto text-zinc-400" />
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Direct browser preview unavailable
                  </h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    This file format cannot be rendered inside the browser frame. Please download it to inspect.
                  </p>
                  <a
                    href={previewFile.downloadUrl || previewFile.url || "#"}
                    download={String(previewFile.fileName || "document")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download file</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message Modal */}
      {messageTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setMessageTarget(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/90">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <span>Message {messageTarget.candidateName}</span>
                    <span>🇮🇪</span>
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">+{messageTarget.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setMessageTarget(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Message Content
              </label>
              <textarea
                rows={4}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your WhatsApp message for the Ireland candidate here..."
                className="w-full p-3 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-[11px] text-zinc-400">
                This will be sent directly to the candidate&apos;s WhatsApp via the Ireland WhatsApp service.
              </p>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setMessageTarget(null)}
                disabled={sendingMessage}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || !messageText.trim()}
                className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {sendingMessage ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send WhatsApp 🇮🇪</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-red-50/50 dark:bg-red-950/20">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                  {deleteTarget.type === "folder" ? "Delete All Candidate Files?" : "Delete Document?"}
                </h3>
                <p className="text-xs text-zinc-500">Ireland candidate document cleanup</p>
              </div>
            </div>

            <div className="p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
              {deleteTarget.type === "folder" ? (
                <p>
                  Are you sure you want to permanently delete all uploaded files for candidate{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">{deleteTarget.candidateName}</strong> (+
                  {deleteTarget.phone})? This action cannot be undone.
                </p>
              ) : (
                <p>
                  Are you sure you want to permanently delete document &ldquo;
                  <strong className="text-zinc-900 dark:text-zinc-100">{deleteTarget.fileName}</strong>&rdquo; for{" "}
                  {deleteTarget.candidateName}?
                </p>
              )}
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={deleteTarget.type === "folder" ? handleDeleteFolder : handleDeleteFile}
                disabled={deleting}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
