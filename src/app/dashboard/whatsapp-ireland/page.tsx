"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNavbar from "@/components/DashboardNavbar";
import {
  MessageSquare,
  Search,
  Send,
  RefreshCw,
  ExternalLink,
  User,
  Clock,
  Calendar,
  CheckCheck,
  FileText,
  Download,
  Plus,
  X,
  Phone,
  Mail,
  MapPin,
  Bot,
  UserCheck,
  Sparkles,
  Info,
  Trash2,
  Pencil,
  Check,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";

interface ConversationItem {
  phone: string;
  name: string;
  email: string | null;
  countryCode: string;
  countryName: string;
  timeZone: string;
  timeZoneLabel: string;
  currentStep: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSender: "candidate" | "admin" | "bot";
  unreadCount: number;
  bookedSlot?: {
    date: string;
    candidateTimeLabel?: string;
    istTimeLabel?: string;
    meetingUserName?: string;
  } | null;
  leadId?: number | null;
}

interface ChatMessage {
  id: string;
  sender: "candidate" | "admin" | "bot";
  senderName?: string;
  text: string;
  msgType?: string;
  mediaUrl?: string | null;
  mediaFileName?: string | null;
  buttons?: Array<{ id: string; title: string }> | null;
  createdAt: string;
}

interface CandidateSession {
  name: string;
  email: string | null;
  countryName: string;
  countryCode: string;
  timeZone: string;
  timeZoneLabel: string;
  currentStep: string;
  bookedSlot?: any;
  cvFileName?: string | null;
  cvFileUrl?: string | null;
  cvReceivedAt?: string | null;
  infoEmailSentAt?: string | null;
  leadId?: number | null;
}

interface UserAuth {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function WhatsAppIrelandChatPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserAuth | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<CandidateSession | null>(null);
  const [lead, setLead] = useState<any>(null);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "booked">("all");
  const [showInfoDrawer, setShowInfoDrawer] = useState(true);

  // New Chat Modal state
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [newChatMsg, setNewChatMsg] = useState("");

  // Candidate Name Editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auth Verification
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const data = await res.json();
        if (data.role !== "admin") {
          toast.error("Access restricted to Admins only");
          router.push("/dashboard");
          return;
        }
        setCurrentUser(data);
      } catch {
        router.push("/");
      }
    }
    checkAuth();
  }, [router]);

  // Load conversations list
  const loadConversations = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoadingList(true);
      try {
        const q = encodeURIComponent(searchQuery);
        const res = await fetch(
          `/api/whatsapp-ireland/conversations?q=${q}&filter=${filter}`
        );
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || []);

          if (!selectedPhone && data.conversations?.length > 0 && !isBackground) {
            setSelectedPhone(data.conversations[0].phone);
          }
        }
      } catch (err) {
        console.error("Failed to load Ireland conversations:", err);
      } finally {
        if (!isBackground) setLoadingList(false);
      }
    },
    [searchQuery, filter, selectedPhone]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load chat messages when selectedPhone changes
  const loadChatMessages = useCallback(
    async (phone: string, isBackground = false) => {
      if (!phone) return;
      if (!isBackground) setLoadingChat(true);
      try {
        const res = await fetch(
          `/api/whatsapp-ireland/conversations/${phone}/messages`
        );
        if (res.ok) {
          const data = await res.json();
          const cleanMsgs = (data.messages || []).map((m: any) => ({
            id: m.messageId || m._id,
            sender: m.sender || "candidate",
            senderName: m.senderName,
            text: m.text || "",
            msgType: m.msgType || "text",
            mediaUrl: m.mediaUrl,
            mediaFileName: m.mediaFileName,
            buttons: m.buttons,
            createdAt: m.createdAt,
          }));

          setMessages(cleanMsgs);
          setSession(data.session || null);
          setLead(data.lead || null);

          // Clear unread count in local conversation list
          setConversations((prev) =>
            prev.map((c) => (c.phone === phone ? { ...c, unreadCount: 0 } : c))
          );
        }
      } catch (err) {
        console.error("Failed to load Ireland messages:", err);
      } finally {
        if (!isBackground) setLoadingChat(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedPhone) {
      loadChatMessages(selectedPhone);
    } else {
      setMessages([]);
      setSession(null);
      setLead(null);
    }
  }, [selectedPhone, loadChatMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Periodic polling (every 4s)
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      loadConversations(true);
      if (selectedPhone) {
        loadChatMessages(selectedPhone, true);
      }
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedPhone, loadConversations, loadChatMessages]);

  // Send message handler
  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedPhone || sending) return;
    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    const optimisticId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      sender: "admin",
      senderName: currentUser?.name || "Admin",
      text: textToSend,
      msgType: "text",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(
        `/api/whatsapp-ireland/conversations/${selectedPhone}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSend }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to send WhatsApp message");
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } else {
        loadConversations(true);
      }
    } catch {
      toast.error("Network error sending WhatsApp message");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const insertQuickReply = (text: string) => {
    setInputText(text);
    textareaRef.current?.focus();
  };

  // Start New Chat Modal Submit
  const handleCreateNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    const clean = newChatPhone.replace(/[^\d]/g, "").replace(/^00/, "");
    if (clean.length < 8) {
      toast.error("Please enter a valid phone number with country code");
      return;
    }

    try {
      const res = await fetch("/api/whatsapp-ireland/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: clean,
          name: newChatName.trim() || undefined,
          initialMessage: newChatMsg.trim() || undefined,
        }),
      });

      if (res.ok) {
        toast.success(`Started Ireland WhatsApp chat with +${clean}! 🇮🇪`);
        setNewChatOpen(false);
        setNewChatPhone("");
        setNewChatName("");
        setNewChatMsg("");
        setSelectedPhone(clean);
        loadConversations();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to start chat");
      }
    } catch {
      toast.error("Error creating chat");
    }
  };

  const handleSaveName = async () => {
    if (!selectedPhone || !editedName.trim() || savingName) return;
    setSavingName(true);
    const newName = editedName.trim();
    try {
      const res = await fetch("/api/whatsapp-ireland/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: selectedPhone, name: newName }),
      });
      if (res.ok) {
        toast.success(`Candidate name updated to "${newName}"`);
        setSession((prev) => (prev ? { ...prev, name: newName } : null));
        setConversations((prev) =>
          prev.map((c) => (c.phone === selectedPhone ? { ...c, name: newName } : c))
        );
        setIsEditingName(false);
      } else {
        toast.error("Failed to update candidate name");
      }
    } catch {
      toast.error("Network error updating candidate name");
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteConversation = async (phone: string, convName?: string) => {
    const displayName = convName || `+${phone}`;
    if (
      !confirm(
        `Are you sure you want to permanently delete the Ireland conversation with ${displayName}?\n\nAll chat messages, session records, and history for this number will be deleted permanently.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/whatsapp-ireland/conversations?phone=${phone}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Conversation with ${displayName} deleted`);
        if (selectedPhone === phone) {
          setSelectedPhone(null);
          setMessages([]);
          setSession(null);
          setLead(null);
        }
        loadConversations();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete conversation");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete conversation");
    }
  };

  const selectedConv = conversations.find((c) => c.phone === selectedPhone);

  const getStepBadge = (step: string) => {
    switch (step) {
      case "WELCOME":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">Welcome</span>;
      case "AWAITING_EMAIL":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">Email Due</span>;
      case "AWAITING_CONSULTATION_DECISION":
      case "VIDEO_SENT_AWAITING_INTEREST":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">Video Sent</span>;
      case "SELECTING_DAY":
      case "SELECTING_SLOT":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">Selecting Slot</span>;
      case "BOOKED":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Consultation Booked</span>;
      case "MEETING_COMPLETED":
      case "AWAITING_CV":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">CV Due</span>;
      case "COLD":
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Cold</span>;
      default:
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{step}</span>;
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).format(d);
    } catch {
      return "";
    }
  };

  const formatMsgDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return "Today";
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  };

  const getMsgDateKey = (dateStr: string): string => {
    try { return new Date(dateStr).toDateString(); } catch { return ""; }
  };

  const formatListDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        }).format(d);
      }
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      {currentUser && <DashboardNavbar user={currentUser as any} />}

      {/* Main Container - WhatsApp Web Style Layout */}
      <div className="flex-1 flex overflow-hidden max-w-[1720px] w-full mx-auto p-2 sm:p-3 gap-2 h-[calc(100vh-68px)]">
        {/* ───────────────────────────────────────────────────────────── */}
        {/* LEFT PANE: Conversation List (Compact Style)                 */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="w-80 lg:w-96 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shrink-0 shadow-2xs">
          {/* Header Bar */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                🇮🇪
              </div>
              <div>
                <h1 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span>WhatsApp Ireland</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Live
                  </span>
                </h1>
                <p className="text-[10px] text-zinc-400">
                  {conversations.length} Active Candidates
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => loadConversations()}
                title="Refresh"
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingList ? "animate-spin" : ""}`}
                />
              </button>

              <button
                type="button"
                onClick={() => setNewChatOpen(true)}
                className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium flex items-center gap-1 transition shadow-2xs"
              >
                <Plus className="w-3 h-3" />
                <span>New Chat</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates or phone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 mt-2 text-[11px]">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-2 py-0.5 rounded-full font-medium transition ${
                  filter === "all"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={`px-2 py-0.5 rounded-full font-medium transition flex items-center gap-1 ${
                  filter === "unread"
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span>Unread</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter("booked")}
                className={`px-2 py-0.5 rounded-full font-medium transition ${
                  filter === "booked"
                    ? "bg-purple-600 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Booked
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                {searchQuery ? "No matches found" : "No Ireland WhatsApp messages yet"}
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = selectedPhone === conv.phone;
                return (
                  <button
                    key={conv.phone}
                    type="button"
                    onClick={() => setSelectedPhone(conv.phone)}
                    className={`w-full p-2.5 text-left flex items-start gap-2.5 transition relative ${
                      isSelected
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    {/* Candidate Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
                        {conv.name ? conv.name[0].toUpperCase() : "C"}
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {conv.name || `+${conv.phone}`}
                        </span>
                        <span className="text-[10px] text-zinc-400 shrink-0">
                          {formatListDate(conv.lastMessageAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1">
                        <span>+{conv.phone}</span>
                        <span>•</span>
                        <span>{conv.countryName}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex-1">
                          {conv.lastSender === "admin" && (
                            <span className="text-emerald-600 font-medium">You: </span>
                          )}
                          {conv.lastSender === "bot" && (
                            <span className="text-blue-500 font-medium">Bot: </span>
                          )}
                          {conv.lastMessage}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {getStepBadge(conv.currentStep)}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteConversation(conv.phone, conv.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 rounded transition"
                            title={`Delete conversation with ${conv.name || conv.phone}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* CENTER PANE: WhatsApp Chat View                              */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
          {selectedConv ? (
            <>
              {/* Chat Header Bar */}
              <div className="p-2.5 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs border border-emerald-500/20 shrink-0">
                    {selectedConv.name ? selectedConv.name[0].toUpperCase() : "C"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isEditingName ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveName();
                              } else if (e.key === "Escape") {
                                setIsEditingName(false);
                              }
                            }}
                            placeholder="Candidate name..."
                            autoFocus
                            className="h-6 px-1.5 text-xs rounded border border-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={handleSaveName}
                            disabled={savingName || !editedName.trim()}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            title="Save Name"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingName(false)}
                            className="p-1 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 text-zinc-600 dark:text-zinc-300"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {selectedConv.name || "Candidate"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditedName(selectedConv.name || "");
                              setIsEditingName(true);
                            }}
                            className="p-0.5 rounded text-zinc-400 hover:text-emerald-500 transition"
                            title="Edit candidate name"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {getStepBadge(selectedConv.currentStep)}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span>+{selectedConv.phone}</span>
                      <span>•</span>
                      <span>{selectedConv.countryName} ({selectedConv.timeZoneLabel})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedConv.leadId && (
                    <Link
                      href={`/dashboard/leads/${selectedConv.leadId}`}
                      target="_blank"
                      className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium flex items-center gap-1 transition"
                    >
                      <span>CRM Lead #{selectedConv.leadId}</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}

                  <a
                    href={`https://web.whatsapp.com/send?phone=${selectedConv.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-[11px] font-medium flex items-center gap-1 transition border border-emerald-500/20"
                  >
                    <span>WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(selectedConv.phone, selectedConv.name)}
                    title="Delete Conversation"
                    className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                    title="Toggle Candidate Info Drawer"
                    className={`p-1.5 rounded-md transition ${
                      showInfoDrawer
                        ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Chat Message Transcript Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]/20 dark:bg-[#0b141a]/40">
                {loadingChat ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-xs text-zinc-400 space-y-1">
                    <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                    <p>No messages in this Ireland conversation yet.</p>
                    <p className="text-[11px]">
                      Send a message below to reach out to this candidate on WhatsApp directly!
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isCandidate = msg.sender === "candidate";
                    const isBot = msg.sender === "bot";
                    const isAdmin = msg.sender === "admin";

                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showDateSeparator =
                      !prevMsg ||
                      getMsgDateKey(msg.createdAt) !== getMsgDateKey(prevMsg.createdAt);

                    return (
                      <React.Fragment key={msg.id || idx}>
                        {showDateSeparator && (
                          <div className="flex items-center justify-center my-2">
                            <span className="px-3 py-0.5 rounded-full bg-zinc-200/80 dark:bg-zinc-700/60 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 shadow-2xs">
                              {formatMsgDate(msg.createdAt)}
                            </span>
                          </div>
                        )}
                      <div
                        className={`flex flex-col ${
                          isCandidate ? "items-start" : "items-end"
                        }`}
                      >
                        {/* Bubble */}
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-xl p-2.5 text-xs shadow-2xs leading-relaxed relative ${
                            isCandidate
                              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none border border-zinc-200/70 dark:border-zinc-700/60"
                              : isAdmin
                              ? "bg-emerald-600 text-white rounded-tr-none"
                              : "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-950 dark:text-emerald-100 rounded-tr-none border border-emerald-500/20"
                          }`}
                        >
                          {/* Sender Label */}
                          <div className="flex items-center justify-between gap-3 text-[10px] font-semibold mb-1 opacity-80">
                            <span className="flex items-center gap-1">
                              {isCandidate && <User className="w-2.5 h-2.5" />}
                              {isBot && <Bot className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />}
                              {isAdmin && <UserCheck className="w-2.5 h-2.5" />}
                              <span>
                                {isCandidate
                                  ? msg.senderName || selectedConv.name || "Candidate"
                                  : isBot
                                  ? "TMS Automation (Ireland)"
                                  : msg.senderName || "Admin"}
                              </span>
                            </span>
                          </div>

                          {/* Message Content */}
                          <div className="whitespace-pre-wrap wrap-break-words">
                            {msg.text}
                          </div>

                          {/* Media Attachment if any */}
                          {msg.mediaUrl && (
                            <div className="mt-2 pt-2 border-t border-current/10">
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/10 hover:bg-black/20 text-[11px] font-medium transition"
                              >
                                <Download className="w-3 h-3" />
                                <span>{msg.mediaFileName || "Download File"}</span>
                              </a>
                            </div>
                          )}

                          {/* Buttons rendered */}
                          {msg.buttons && msg.buttons.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-current/10 flex flex-wrap gap-1">
                              {msg.buttons.map((btn) => (
                                <span
                                  key={btn.id}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10"
                                >
                                  🔘 {btn.title}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Timestamp */}
                          <div className="text-[9px] text-right mt-1 opacity-70 flex items-center justify-end gap-1">
                            <span title={msg.createdAt ? new Date(msg.createdAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}>
                              {formatMessageTime(msg.createdAt)}
                            </span>
                            {!isCandidate && <CheckCheck className="w-3 h-3 text-emerald-300" />}
                          </div>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Template Chips */}
              <div className="p-1.5 px-3 bg-zinc-100/70 dark:bg-zinc-800/40 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0">
                <span className="text-[10px] text-zinc-400 shrink-0 font-medium flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" /> Quick Replies:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    insertQuickReply(
                      "Hello! Would you like to schedule your free 1-on-1 consultation for the Ireland Employer Sponsored Work Visa (Critical Skills & General Employment) this weekend? 🇮🇪"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300 shrink-0 transition"
                >
                  📅 Book Consultation
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertQuickReply(
                      "Here is our official explainer video on the Ireland Employer Sponsored Work Visa:\n🔗 https://tmsvisa.com/wp-content/uploads/2026/09/Ireland-process-video.mp4"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300 shrink-0 transition"
                >
                  🎥 Send Video Link
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertQuickReply(
                      "Please send your updated CV / Resume in PDF or Word format here on WhatsApp for our Ireland qualification assessment. 📄"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300 shrink-0 transition"
                >
                  📄 Request CV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertQuickReply(
                      "Could you please share your active email address so we can email you the complete official Ireland Work Visa information guide?"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300 shrink-0 transition"
                >
                  ✉️ Request Email
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertQuickReply(
                      "Transparent Fees for Ireland: Initial milestone is €300 upon agreement signing, and the remaining €700 is payable ONLY AFTER your visa is approved and flight tickets are in hand! 🇮🇪"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300 shrink-0 transition"
                >
                  💶 Fee Breakdown (€300 / €700)
                </button>
              </div>

              {/* Message Input Box */}
              <div className="p-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="flex items-stretch gap-2">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Type an Ireland WhatsApp message to +${selectedConv.phone}... (Enter to send, Shift+Enter for newline)`}
                    rows={4}
                    className="flex-1 p-2.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 resize-y text-zinc-900 dark:text-zinc-100 min-h-[114px] max-h-56 leading-relaxed"
                  />

                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sending || !inputText.trim()}
                    className="w-20 sm:w-24 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs flex flex-col items-center justify-center gap-1.5 transition shrink-0 shadow-2xs"
                  >
                    {sending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 font-bold text-lg">
                🇮🇪
              </div>
              <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                WhatsApp Ireland Candidate Inbox
              </h2>
              <p className="text-xs text-zinc-400 max-w-xs">
                Select a candidate from the left panel to review full chat history and send manual Ireland WhatsApp messages directly.
              </p>
            </div>
          )}
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* RIGHT PANE: Collapsible Candidate Dossier Drawer             */}
        {/* ───────────────────────────────────────────────────────────── */}
        {selectedConv && showInfoDrawer && (
          <div className="w-64 lg:w-72 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 overflow-y-auto p-3 space-y-3 font-sans text-xs rounded-xl shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 text-xs">
                <span>Candidate Dossier</span>
                <span className="text-[10px] font-normal text-emerald-600">🇮🇪 Ireland</span>
              </span>
              <button
                type="button"
                onClick={() => setShowInfoDrawer(false)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profile Overview Card */}
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Name</span>
                {!isEditingName ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditedName(selectedConv.name || "");
                      setIsEditingName(true);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={savingName}
                      onClick={async () => {
                        setSavingName(true);
                        try {
                          await fetch(
                            `/api/whatsapp-ireland/conversations/${selectedConv.phone}/messages`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name: editedName.trim() }),
                            }
                          );
                          setIsEditingName(false);
                          loadConversations(true);
                        } catch {
                          toast.error("Failed to update candidate name");
                        } finally {
                          setSavingName(false);
                        }
                      }}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="p-1 rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {!isEditingName ? (
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedConv.name || "Candidate"}
                </div>
              ) : (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              )}

              <div className="space-y-1.5 pt-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <Phone className="w-3 h-3 text-zinc-400" />
                  <span>+{selectedConv.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <Mail className="w-3 h-3 text-zinc-400" />
                  <span className="truncate">{selectedConv.email || "No email captured"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <MapPin className="w-3 h-3 text-zinc-400" />
                  <span>{selectedConv.countryName} ({selectedConv.timeZoneLabel})</span>
                </div>
              </div>
            </div>

            {/* Booked Consultation Card */}
            {session?.bookedSlot && (
              <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Booked Consultation</span>
                </div>
                <div className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                  {session.bookedSlot.date}
                </div>
                <div className="text-[11px] text-purple-700 dark:text-purple-300">
                  Candidate Time: {session.bookedSlot.candidateTimeLabel || session.bookedSlot.candidateTime}
                </div>
                {session.bookedSlot.istTimeLabel && (
                  <div className="text-[10px] text-purple-500">
                    IST Internal: {session.bookedSlot.istTimeLabel}
                  </div>
                )}
              </div>
            )}

            {/* CV / Documents Section */}
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                <span>Received CV / Documents</span>
                <FileText className="w-3 h-3 text-zinc-400" />
              </div>
              {session?.cvFileUrl ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
                    {session.cvFileName || "Candidate_CV.pdf"}
                  </div>
                  {session.cvReceivedAt && (
                    <div className="text-[10px] text-zinc-400">
                      Uploaded: {new Date(session.cvReceivedAt).toLocaleDateString()}
                    </div>
                  )}
                  <a
                    href={session.cvFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium transition"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download CV</span>
                  </a>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400">
                  No CV uploaded yet. Use the &quot;Request CV&quot; quick chip to request their resume.
                </p>
              )}
            </div>

            {/* Matching CRM Lead Card */}
            {lead && (
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">
                    CRM Lead #{lead.id}
                  </span>
                  <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    {lead.status}
                  </span>
                </div>
                {lead.assignedToName && (
                  <div className="text-[10px] text-zinc-500">
                    Assigned: {lead.assignedToName}
                  </div>
                )}
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  target="_blank"
                  className="block text-center py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] transition"
                >
                  View Full Lead Profile
                </Link>
              </div>
            )}

            {/* Program Highlights */}
            <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 text-[11px] space-y-1 text-zinc-600 dark:text-zinc-400">
              <div className="font-bold text-emerald-700 dark:text-emerald-300 text-[10px] uppercase">
                Ireland Program Rules
              </div>
              <div>• Destination: Ireland 🇮🇪</div>
              <div>• Total Fee: €1,000 (€300 / €700)</div>
              <div>• Employer covers: €1,000 permit + flights</div>
              <div>• Direct Stamp 4 PR after 2 years</div>
            </div>
          </div>
        )}
      </div>

      {/* Start New Chat Modal */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 w-full max-w-sm space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <span>Start Ireland WhatsApp Chat</span>
                <span className="text-[10px] font-normal text-emerald-600">🇮🇪</span>
              </h2>
              <button
                type="button"
                onClick={() => setNewChatOpen(false)}
                className="p-1 rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewChat} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Candidate Phone Number (with Country Code) *
                </label>
                <input
                  type="text"
                  required
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  placeholder="e.g. 353871234567 or 919876543210"
                  className="w-full p-2 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Candidate Name (Optional)
                </label>
                <input
                  type="text"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full p-2 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Initial Message (Optional)
                </label>
                <textarea
                  placeholder="Leave empty for default welcome or type initial message..."
                  value={newChatMsg}
                  onChange={(e) => setNewChatMsg(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewChatOpen(false)}
                  className="px-3 py-1.5 rounded text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                >
                  Start Conversation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
