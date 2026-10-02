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

export default function WhatsAppChatPage() {
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

  const startEditName = () => {
    const currentName =
      session?.name && session.name !== "Candidate"
        ? session.name
        : selectedConv?.name && selectedConv.name !== "Candidate"
        ? selectedConv.name
        : "";
    setEditedName(currentName);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!selectedPhone || !editedName.trim() || savingName) return;
    setSavingName(true);
    const newName = editedName.trim();
    try {
      const res = await fetch("/api/whatsapp/conversations", {
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

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

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

  // Monitor user scroll position to avoid snapping to bottom when user scrolls up
  const handleChatScroll = useCallback(() => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    // Consider at bottom if within 100px from the bottom
    const atBottom = scrollHeight - scrollTop - clientHeight < 100;
    isAtBottomRef.current = atBottom;
    setShowScrollBottomBtn(!atBottom);
  }, []);

  // Scroll chat to bottom (only force if explicitly requested or already at bottom)
  const scrollToBottom = useCallback((force = false, smooth = false) => {
    if (chatScrollRef.current) {
      if (force || isAtBottomRef.current) {
        chatScrollRef.current.scrollTo({
          top: chatScrollRef.current.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        });
        isAtBottomRef.current = true;
        setShowScrollBottomBtn(false);
      }
    }
  }, []);

  // 2. Fetch Conversations List
  const fetchConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingList(true);
    try {
      const q = encodeURIComponent(searchQuery);
      const res = await fetch(`/api/whatsapp/conversations?q=${q}&filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        const list: ConversationItem[] = data.conversations || [];
        setConversations(list);

        // Auto select first conversation if none selected
        if (!selectedPhone && list.length > 0) {
          setSelectedPhone(list[0].phone);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      if (!quiet) setLoadingList(false);
    }
  }, [searchQuery, filter, selectedPhone]);

  // Initial load and on search/filter changes
  useEffect(() => {
    fetchConversations(false);
  }, [searchQuery, filter]);

  // Poll conversations every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // 3. Fetch Messages for Selected Phone
  const fetchMessages = useCallback(async (phone: string, quiet = false) => {
    if (!quiet) setLoadingChat(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${phone}/messages`);
      if (res.ok) {
        const data = await res.json();
        const incoming: ChatMessage[] = data.messages || [];
        setMessages((prev) => {
          // Retain any in-flight optimistic message that hasn't appeared in incoming yet
          const pendingOptimistic = prev.filter(
            (m) =>
              m.id.startsWith("temp_") &&
              !incoming.some(
                (inc) =>
                  inc.text.trim() === m.text.trim() &&
                  Math.abs(new Date(inc.createdAt).getTime() - new Date(m.createdAt).getTime()) < 30000
              )
          );
          const next = [...incoming, ...pendingOptimistic];

          // If the message list has not changed (same length, ids, and content), return prev
          // to prevent unnecessary re-renders and auto-scroll snapping
          if (
            prev.length === next.length &&
            prev.every((m, idx) => m.id === next[idx].id && m.text === next[idx].text)
          ) {
            return prev;
          }
          return next;
        });
        setSession(data.session || null);
        setLead(data.lead || null);

        // Clear unread count locally for this phone and sync name if returned
        const actualName = data.session?.name || data.lead?.name;
        setConversations((prev) =>
          prev.map((c) =>
            c.phone === phone
              ? {
                  ...c,
                  name: actualName && actualName !== "Candidate" ? actualName : c.name,
                  unreadCount: 0,
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      if (!quiet) setLoadingChat(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPhone) {
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
      fetchMessages(selectedPhone, false);
      setTimeout(() => scrollToBottom(true), 120);
    }
  }, [selectedPhone, fetchMessages, scrollToBottom]);

  // Poll messages every 4 seconds for live chat stream
  useEffect(() => {
    if (!selectedPhone) return;
    const interval = setInterval(() => {
      fetchMessages(selectedPhone, true);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedPhone, fetchMessages]);

  // Auto-scroll on messages change ONLY if user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages, scrollToBottom]);

  // 4. Send Message
  const handleSendMessage = async () => {
    if (!selectedPhone || !inputText.trim() || sending) return;
    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    // Optimistic message append
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      sender: "admin",
      senderName: currentUser?.name || "Admin",
      text: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setTimeout(() => scrollToBottom(true, true), 50);

    try {
      const res = await fetch(`/api/whatsapp/conversations/${selectedPhone}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend }),
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || "Failed to send WhatsApp message");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else {
        const data = await res.json();
        if (data?.message) {
          setMessages((prev) => {
            const alreadyHasServerMsg = prev.some((m) => m.id === data.message.id);
            if (alreadyHasServerMsg) {
              return prev.filter((m) => m.id !== tempId);
            }
            return prev.map((m) => (m.id === tempId ? { ...data.message, id: data.message.id || tempId } : m));
          });
        }
        fetchConversations(true);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Network error sending message");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  // Keyboard shortcut: Enter sends (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle Quick Canned Reply insertion
  const insertQuickReply = (text: string) => {
    setInputText(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Handle Starting a New Chat
  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) {
      toast.error("Please enter a phone number");
      return;
    }

    try {
      const res = await fetch("/api/whatsapp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: newChatPhone,
          name: newChatName.trim() || undefined,
          initialMessage: newChatMsg.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Chat opened with +${data.phone}`);
        setNewChatOpen(false);
        setNewChatPhone("");
        setNewChatName("");
        setNewChatMsg("");
        setSelectedPhone(data.phone);
        fetchConversations();
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Failed to create conversation");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to start chat");
    }
  };

  // Handle Deleting a Conversation
  const handleDeleteConversation = async (phone: string, convName?: string) => {
    const displayName = convName || `+${phone}`;
    if (
      !confirm(
        `Are you sure you want to permanently delete the conversation with ${displayName}?\n\nAll chat messages, session records, and history for this number will be deleted permanently.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/whatsapp/conversations?phone=${phone}`, {
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
        fetchConversations();
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

  const formatMsgTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatMsgDate = (isoString?: string): string => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
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

  const getMsgDateKey = (isoString?: string): string => {
    if (!isoString) return "";
    try { return new Date(isoString).toDateString(); } catch { return ""; }
  };

  const formatListDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const getStepBadgeColor = (step?: string) => {
    switch (step) {
      case "BOOKED":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "MEETING_COMPLETED":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
      case "AWAITING_CV":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "RESCHEDULING_DATE":
      case "RESCHEDULING_SLOT":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
      default:
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-100 dark:bg-zinc-950 overflow-hidden font-sans text-zinc-900 dark:text-zinc-100">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* TOP NAVIGATION BAR                                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentUser && <DashboardNavbar user={currentUser as any} />}

      {/* Main Full-Height Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* ───────────────────────────────────────────────────────────── */}
        {/* LEFT PANE: Conversation List (Compact WhatsApp Web Style)    */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="w-72 md:w-80 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          {/* Top Header */}
          <div className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h1 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                  WhatsApp Live
                  <span className="text-[9px] font-semibold px-1 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Cloud API
                  </span>
                </h1>
                <p className="text-[10px] text-zinc-400">
                  {conversations.length} candidate threads
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setNewChatOpen(true)}
                className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition text-[11px] font-medium flex items-center gap-1 shadow-2xs"
                title="Start New Chat"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
              <button
                onClick={() => fetchConversations(false)}
                className={`p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition ${
                  loadingList ? "animate-spin" : ""
                }`}
                title="Refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <input
                type="text"
                placeholder="Search name, phone, message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2.5 py-1 text-[11px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 text-[10px] font-medium">
              <button
                onClick={() => setFilter("all")}
                className={`px-2 py-0.5 rounded-full transition ${
                  filter === "all"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`px-2 py-0.5 rounded-full flex items-center gap-1 transition ${
                  filter === "unread"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                }`}
              >
                Unread
                {conversations.filter((c) => c.unreadCount > 0).length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>
              <button
                onClick={() => setFilter("booked")}
                className={`px-2 py-0.5 rounded-full transition ${
                  filter === "booked"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                }`}
              >
                Booked
              </button>
            </div>
          </div>

          {/* Conversations Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingList && conversations.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400 space-y-1.5">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
                <p>Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 px-4 space-y-1.5">
                <MessageSquare className="w-6 h-6 mx-auto opacity-30" />
                <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {searchQuery ? "No matches found" : "No WhatsApp messages yet"}
                </p>
                <p className="text-[10px] text-zinc-400">
                  Click &quot;New&quot; to send a message to any candidate.
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.phone === selectedPhone;
                const hasUnread = conv.unreadCount > 0;

                return (
                  <div
                    key={conv.phone}
                    onClick={() => setSelectedPhone(conv.phone)}
                    className={`p-2.5 cursor-pointer transition flex items-start gap-2.5 relative group ${
                      isSelected
                        ? "bg-emerald-50/90 dark:bg-emerald-950/30 border-l-4 border-emerald-600"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    {/* Compact Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] flex items-center justify-center border border-emerald-500/20">
                        {conv.name && conv.name !== "Candidate"
                          ? conv.name.slice(0, 2).toUpperCase()
                          : conv.phone.slice(-4)}
                      </div>
                      {conv.countryCode && (
                        <span className="absolute -bottom-1 -right-1 text-[9px]">
                          {conv.countryCode === "IN" ? "🇮🇳" : "🌐"}
                        </span>
                      )}
                    </div>

                    {/* Conversation Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3
                          className={`text-xs truncate ${
                            hasUnread
                              ? "font-bold text-zinc-900 dark:text-zinc-100"
                              : "font-semibold text-zinc-800 dark:text-zinc-200"
                          }`}
                        >
                          {conv.name || `+${conv.phone}`}
                        </h3>
                        <span className="text-[9.5px] text-zinc-400 shrink-0 font-sans">
                          {formatListDate(conv.lastMessageAt)}
                        </span>
                      </div>

                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        +{conv.phone}
                      </div>

                      {/* Last message snippet */}
                      <p
                        className={`text-[10.5px] truncate mt-0.5 leading-snug ${
                          hasUnread
                            ? "font-semibold text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {conv.lastSender === "admin" && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            You:{" "}
                          </span>
                        )}
                        {conv.lastSender === "bot" && (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            Bot:{" "}
                          </span>
                        )}
                        {conv.lastMessage}
                      </p>

                      {/* Funnel Step Badge & Unread Pill */}
                      <div className="flex items-center justify-between gap-1 mt-1">
                        <span
                          className={`text-[8.5px] font-semibold px-1 py-0.2 rounded border uppercase tracking-wider leading-none ${getStepBadgeColor(
                            conv.currentStep
                          )}`}
                        >
                          {conv.currentStep.replace(/_/g, " ")}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteConversation(conv.phone, conv.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-red-500 rounded transition"
                            title="Delete Conversation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          {hasUnread && (
                            <span className="bg-emerald-600 text-white text-[9px] font-bold min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center leading-none">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* CENTER PANE: Active Chat Thread                              */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative">
          {selectedConv ? (
            <>
              {/* Chat Top Header - Compact */}
              <div className="h-11 px-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shrink-0 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] flex items-center justify-center border border-emerald-500/20 shrink-0">
                    {session?.name && session.name !== "Candidate"
                      ? session.name.slice(0, 2).toUpperCase()
                      : selectedConv.phone.slice(-4)}
                  </div>

                  <div className="min-w-0">
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
                          placeholder="Candidate's actual name..."
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
                        <h2 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {session?.name || selectedConv.name || `+${selectedConv.phone}`}
                        </h2>
                        <button
                          type="button"
                          onClick={startEditName}
                          className="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-emerald-600 transition"
                          title="Edit Candidate Name"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full border leading-none ${getStepBadgeColor(
                            session?.currentStep || selectedConv.currentStep
                          )}`}
                        >
                          {(session?.currentStep || selectedConv.currentStep).replace(/_/g, " ")}
                        </span>
                      </div>
                    )}

                    <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 truncate leading-tight">
                      <span className="font-mono text-zinc-600 dark:text-zinc-300">
                        +{selectedConv.phone}
                      </span>
                      <span>&bull;</span>
                      <span>{session?.countryName || selectedConv.countryName}</span>
                      <span>({session?.timeZoneLabel || selectedConv.timeZoneLabel})</span>
                    </p>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 font-sans">
                  {lead && (
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      target="_blank"
                      className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-[10.5px] rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 text-zinc-700 dark:text-zinc-300 transition"
                    >
                      <span>Lead #{lead.id}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  )}

                  <a
                    href={`https://wa.me/${selectedConv.phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 text-[10.5px] rounded bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 flex items-center gap-1 font-medium transition"
                    title="Open in WhatsApp Web"
                  >
                    <Phone className="w-2.5 h-2.5" />
                    <span className="hidden md:inline">WhatsApp Web</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                    className={`p-1 rounded border transition ${
                      showInfoDrawer
                        ? "bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    title="Toggle Candidate Dossier"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(selectedConv.phone, selectedConv.name)}
                    className="p-1 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-red-600 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    title="Delete Conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Chat Body & Messages Area - Compact Bubbles */}
              <div className="flex-1 relative min-h-0">
                <div
                  ref={chatScrollRef}
                  onScroll={handleChatScroll}
                  className="absolute inset-0 overflow-y-auto p-3 space-y-2 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] bg-[size:14px_14px]"
                >
                  {loadingChat && messages.length === 0 ? (
                    <div className="py-16 text-center text-xs text-zinc-400 space-y-1.5">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
                      <p>Loading messages...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-400 max-w-sm mx-auto space-y-1.5">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center mx-auto">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <p className="font-semibold text-zinc-700 dark:text-zinc-300 text-xs">
                        No messages in this chat yet
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Send a message below to reach out to this candidate on WhatsApp directly!
                      </p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isCandidate = msg.sender === "candidate";
                      const isAdmin = msg.sender === "admin";
                      const isBot = msg.sender === "bot";

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
                          className={`w-full flex flex-col ${
                            isCandidate ? "items-start" : "items-end"
                          }`}
                        >
                          {/* WhatsApp Message Bubble */}
                          <div
                            className={`max-w-[85%] md:max-w-[70%] lg:max-w-[62%] rounded-2xl px-3 py-1.5 shadow-2xs relative text-[11.5px] leading-relaxed transition ${
                              isCandidate
                                ? "bg-white dark:bg-[#202c33] text-zinc-900 dark:text-zinc-100 rounded-tl-xs border border-zinc-200/80 dark:border-zinc-700/60 self-start"
                                : isAdmin
                                ? "bg-emerald-600 dark:bg-[#005c4b] text-white rounded-tr-xs border border-emerald-500/30 self-end"
                                : "bg-emerald-700/90 dark:bg-[#005c4b]/90 text-white rounded-tr-xs border border-emerald-500/30 self-end"
                            }`}
                          >
                            {/* Sender Label */}
                            <div className="flex items-center gap-1 text-[9px] mb-0.5">
                              {isCandidate ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                  <User className="w-2.5 h-2.5" />
                                  {msg.senderName || "Candidate"}
                                </span>
                              ) : isAdmin ? (
                                <span className="font-semibold text-emerald-100 flex items-center gap-0.5">
                                  <UserCheck className="w-2.5 h-2.5" />
                                  You ({msg.senderName || "Admin"})
                                </span>
                              ) : (
                                <span className="font-semibold text-emerald-200/90 flex items-center gap-0.5">
                                  <Bot className="w-2.5 h-2.5" />
                                  TMS Automation
                                </span>
                              )}
                            </div>

                            {/* Text Body */}
                            <div className="whitespace-pre-wrap break-words">
                              {msg.text}
                            </div>

                            {/* Interactive Buttons / Selections */}
                            {msg.buttons && msg.buttons.length > 0 && (
                              <div className="mt-1.5 pt-1.5 border-t border-white/20 dark:border-emerald-600/40 flex flex-wrap gap-1">
                                {msg.buttons.map((b) => (
                                  <span
                                    key={b.id}
                                    className="px-2 py-0.5 text-[9.5px] rounded bg-white/20 text-white font-medium"
                                  >
                                    🔘 {b.title}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Media Attachment if file received */}
                            {msg.mediaUrl && (
                              <div className="mt-1.5 pt-1.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-1.5 p-1.5 rounded bg-zinc-100 dark:bg-zinc-900">
                                <div className="flex items-center gap-1 truncate">
                                  <FileText className="w-3 h-3 text-red-500 shrink-0" />
                                  <span className="truncate font-mono text-[10px]">
                                    {msg.mediaFileName || "Document"}
                                  </span>
                                </div>
                                <a
                                  href={msg.mediaUrl}
                                  download
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-0.5 rounded text-emerald-600 hover:text-emerald-700"
                                >
                                  <Download className="w-3 h-3" />
                                </a>
                              </div>
                            )}

                            {/* Timestamp & Delivery status */}
                            <div
                              className={`text-[8.5px] mt-0.5 text-right flex items-center justify-end gap-0.5 ${
                                isCandidate ? "text-zinc-400" : "text-emerald-100/75"
                              }`}
                            >
                              <span title={msg.createdAt ? new Date(msg.createdAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}>
                                {formatMsgTime(msg.createdAt)}
                              </span>
                              {!isCandidate && <CheckCheck className="w-2.5 h-2.5 text-emerald-200" />}
                            </div>
                          </div>
                        </div>
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

                {/* Floating Scroll to Bottom Button */}
                {showScrollBottomBtn && (
                  <button
                    type="button"
                    onClick={() => scrollToBottom(true, true)}
                    className="absolute bottom-3 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 dark:bg-zinc-100/90 text-white dark:text-zinc-900 text-[11px] font-medium shadow-md hover:bg-zinc-800 dark:hover:bg-white transition-all cursor-pointer backdrop-blur-xs animate-in fade-in slide-in-from-bottom-2 duration-150"
                    title="Scroll to latest messages"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Scroll to bottom</span>
                  </button>
                )}
              </div>

              {/* Quick Canned Responses Bar - Compact */}
              <div className="px-3 py-1 bg-zinc-100/90 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto text-[10px] shrink-0 font-medium scrollbar-none">
                <span className="text-zinc-400 shrink-0 flex items-center gap-0.5 text-[9px] uppercase font-bold tracking-wider">
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" /> Quick Replies:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    insertQuickReply(
                      "Hello! Would you like to schedule your free 1-on-1 consultation for Australia Employer Sponsored Work Visa this weekend?"
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
                      "Here is our official explainer video on Australia Employer Sponsored Work Visa:\n🔗 https://tmsvisa.com/australia-work-visa-process/"
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
                      "Please send your updated CV / Resume in PDF or Word format here on WhatsApp for our qualification assessment. 📄"
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
                      "Could you please share your active email address so we can email you the complete official information guide?"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300 shrink-0 transition"
                >
                  ✉️ Request Email
                </button>
              </div>

              {/* Bottom Message Input Box - 3x Height */}
              <div className="p-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="flex items-stretch gap-2">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Type a WhatsApp message to +${selectedConv.phone}... (Enter to send, Shift+Enter for newline)`}
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
            /* Empty State when no conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                WhatsApp Candidate Inbox
              </h2>
              <p className="text-xs text-zinc-400 max-w-xs">
                Select a candidate from the left panel to review full chat history and send manual WhatsApp messages directly.
              </p>
            </div>
          )}
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* RIGHT PANE: Collapsible Candidate Dossier Drawer (Compact)   */}
        {/* ───────────────────────────────────────────────────────────── */}
        {selectedConv && showInfoDrawer && (
          <div className="w-64 lg:w-72 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 overflow-y-auto p-3 space-y-3 font-sans text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                Candidate Dossier
              </h3>
              <button
                onClick={() => setShowInfoDrawer(false)}
                className="p-0.5 rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profile Card */}
            <div className="space-y-1.5">
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <div className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                    {session?.name || selectedConv.name || "Candidate"}
                  </div>
                  <button
                    type="button"
                    onClick={startEditName}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition shrink-0"
                    title="Edit Candidate Name"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                </div>

                <div className="space-y-1 text-zinc-600 dark:text-zinc-400 text-[10.5px]">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="font-mono">+{selectedConv.phone}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="truncate">
                      {session?.email || "No email registered"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                    <span className="truncate">
                      {session?.countryName || selectedConv.countryName} (
                      {session?.timeZoneLabel || selectedConv.timeZoneLabel})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Funnel Progress */}
            <div className="space-y-1">
              <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Funnel Progress
              </h4>
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Step:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(session?.currentStep || selectedConv.currentStep).replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Info Email:</span>
                  <span>{session?.infoEmailSentAt ? "Sent ✅" : "Not Sent ❌"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">CV Received:</span>
                  <span>{session?.cvFileName ? "Yes 📄" : "Pending ⏳"}</span>
                </div>
              </div>
            </div>

            {/* Consultation Details */}
            {selectedConv.bookedSlot && (
              <div className="space-y-1">
                <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Confirmed Consultation
                </h4>
                <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-500/30 space-y-1 text-[11px]">
                  <div className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300">
                    <Calendar className="w-3 h-3" />
                    <span>{selectedConv.bookedSlot.date}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {selectedConv.bookedSlot.candidateTimeLabel ||
                        selectedConv.bookedSlot.istTimeLabel}
                    </span>
                  </div>
                  {selectedConv.bookedSlot.meetingUserName && (
                    <div className="text-[10px] text-zinc-500">
                      Host: {selectedConv.bookedSlot.meetingUserName}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CRM Lead Link */}
            {lead && (
              <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/30 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-blue-700 dark:text-blue-300">
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
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: Start New Chat                                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/50">
              <h3 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                Start New WhatsApp Chat
              </h3>
              <button
                onClick={() => setNewChatOpen(false)}
                className="p-1 rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleStartNewChat} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1 text-[11px]">
                  Phone Number (with Country Code) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 919354497615"
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  className="w-full p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1 text-[11px]">
                  Candidate Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="w-full p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1 text-[11px]">
                  Initial Message (Optional)
                </label>
                <textarea
                  placeholder="Leave empty or enter initial message to send..."
                  value={newChatMsg}
                  onChange={(e) => setNewChatMsg(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-1 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setNewChatOpen(false)}
                  className="px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs"
                >
                  Open Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
