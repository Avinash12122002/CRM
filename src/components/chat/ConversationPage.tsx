"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import FileUpload from "@/components/chat/FileUpload";
import MessageBubble from "@/components/chat/MessageBubble";
import PinnedMessages from "@/components/chat/PinnedMessages";
import TypingIndicator from "@/components/chat/TypingIndicator";
import SearchMessages from "@/components/chat/SearchMessages";
import FilePreviewModal from "@/components/chat/FilePreviewModal";
import { ArrowLeft, Search, X, SendHorizontal, ChevronDown } from "lucide-react";

type ConversationPageProps = {
  conversationId: number;
  onClose: () => void;
  compact?: boolean;
};

type Reaction = {
  userId: number;
  userName: string;
  emoji: string;
};

type Message = {
  id: number;
  senderId: number;
  senderName: string;
  message: string;
  type?: "text" | "file";
  fileId?: string;
  fileName?: string;
  isRead?: boolean;
  edited?: boolean;
  deleted?: boolean;
  isPinned?: boolean;
  reactions?: Reaction[];
  createdAt: string;
};

export default function ConversationPage({
  conversationId,
  onClose,
  compact = false,
}: ConversationPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [otherUser, setOtherUser] = useState<{
    name: string;
    role: string;
    isOnline: boolean;
    userId: number | null;
  } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // true  → auto-scroll new messages to bottom
  // false → user scrolled up, don't hijack position
  const shouldAutoScroll = useRef(true);
  // true on first open → instant jump
  const firstLoad = useRef(true);
  // tracks whether we've done the first scroll yet
  const scrolledOnce = useRef(false);

  // ── Scroll helpers ─────────────────────────────────────────────────────
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist < 150;
    shouldAutoScroll.current = atBottom;
    setShowScrollBtn(!atBottom);
  };

  // ── Reset when conversation changes ────────────────────────────────────
  useEffect(() => {
    firstLoad.current = true;
    scrolledOnce.current = false;
    shouldAutoScroll.current = true;
    setMessages([]);
    setLoading(true);
    setShowScrollBtn(false);
    setOtherUser(null);

    loadCurrentUser().then(() => {
      // Load messages only after we know currentUserId
      // so MessageBubble can correctly identify "mine" vs "theirs"
      loadMessages();
    });
    loadConversationInfo();

    const interval = setInterval(loadMessages, 2000);
    const onlineInterval = setInterval(refreshOnlineStatus, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(onlineInterval);
      setTypingStatus(false);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ── Scroll: fires whenever messages or loading changes ─────────────────
  // We need BOTH conditions: messages loaded AND DOM rendered (not loading)
  useEffect(() => {
    if (loading || messages.length === 0 || !messagesRef.current) return;

    if (!scrolledOnce.current) {
      // First time we have messages for this conversation → instant jump
      requestAnimationFrame(() => {
        scrollToBottom("instant");
        scrolledOnce.current = true;
        firstLoad.current = false;
      });
      return;
    }

    // Subsequent message arrivals → only scroll if already at bottom
    const atBottom = shouldAutoScroll.current;
    if (atBottom) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  // ── Data fetching ──────────────────────────────────────────────────────
  const loadCurrentUser = async (): Promise<number | null> => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setCurrentUserId(data.id);
      return data.id;
    } catch {
      return null;
    }
  };

  const loadConversationInfo = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();
      const match = (data.conversations || []).find(
        (c: any) => c.id === Number(conversationId)
      );
      if (match) {
        // otherUserId may or may not exist in the API response.
        // We try it here and also derive it from messages (see loadMessages).
        setOtherUser((prev) => ({
          name: match.otherUserName,
          role: match.otherUserRole,
          isOnline: prev?.isOnline ?? false,
          userId: match.otherUserId ?? prev?.userId ?? null,
        }));
      }
    } catch {}
  };

  const refreshOnlineStatus = async () => {
    try {
      const res = await fetch("/api/chat/online-users");
      const data = await res.json();
      const onlineIds: number[] = (data.onlineUsers || []).map((u: any) => u.userId);
      setOtherUser((prev) => {
        if (!prev) return prev;
        return { ...prev, isOnline: prev.userId !== null && onlineIds.includes(prev.userId) };
      });
    } catch {}
  };

  const loadMessages = async () => {
    try {
      const res = await fetch(`/api/chat/messages/${conversationId}`);
      const data = await res.json();

      setMessages((prev) => {
        const next: Message[] = data.messages || [];

        // Derive the other user's ID from message senderIds
        // This is the reliable fallback when the API doesn't return otherUserId
        setCurrentUserId((cuid) => {
          if (cuid !== null) {
            const otherMsg = next.find((m) => m.senderId !== cuid);
            if (otherMsg) {
              setOtherUser((ou) => {
                if (!ou || ou.userId !== null) return ou;
                // We found the other user's ID from a message — update and refresh online status
                const updated = { ...ou, userId: otherMsg.senderId };
                // Fire online check with this newly discovered ID
                fetch("/api/chat/online-users")
                  .then((r) => r.json())
                  .then((d) => {
                    const ids: number[] = (d.onlineUsers || []).map((u: any) => u.userId);
                    setOtherUser((o) =>
                      o ? { ...o, userId: otherMsg.senderId, isOnline: ids.includes(otherMsg.senderId) } : o
                    );
                  })
                  .catch(() => {});
                return updated;
              });
            }
          }
          return cuid;
        });

        // Only re-render if something changed
        if (
          prev.length === next.length &&
          prev.every(
            (m, i) =>
              m.id === next[i]?.id &&
              m.edited === next[i]?.edited &&
              m.deleted === next[i]?.deleted &&
              m.isPinned === next[i]?.isPinned &&
              m.reactions?.length === next[i]?.reactions?.length
          )
        ) {
          return prev;
        }
        return next;
      });

      // Mark as read
      await fetch("/api/chat/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: Number(conversationId) }),
      });
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  const setTypingStatus = async (typing: boolean) => {
    try {
      await fetch("/api/chat/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: Number(conversationId), typing }),
      });
    } catch {}
  };

  const handleInputChange = (value: string) => {
    setMessage(value);
    setTypingStatus(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTypingStatus(false), 2000);
  };

  const sendMessage = async () => {
    if (!message.trim() || sending) return;
    setSending(true);

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: Number(conversationId), message }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message);
        return;
      }
      setMessage("");
      inputRef.current?.focus();
      setTypingStatus(false);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      // Always jump to bottom after sending own message
      shouldAutoScroll.current = true;
      setShowScrollBtn(false);
      loadMessages();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  // NOTE: We no longer early-return null when currentUserId is null.
  // That was the root cause of the scroll bug — the messages div never mounted
  // so firstLoad scroll fired against nothing, then was marked done.
  // Instead we show a skeleton header and pass currentUserId ?? 0 to children,
  // which is safe since MessageBubble only uses it for isMine comparison.

  return (
    <>
      <div className="h-full flex flex-col min-h-0 bg-white dark:bg-zinc-950">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="border-b px-4 py-3 flex items-center justify-between bg-white dark:bg-zinc-950 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {compact && (
              <button
                aria-label="Back"
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            <div className="relative shrink-0">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold select-none">
                {otherUser?.name?.trim()?.charAt(0).toUpperCase() || "?"}
              </div>
              {/* Online dot — green only when confirmed online */}
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-950 transition-colors ${
                  otherUser?.isOnline
                    ? "bg-green-500"
                    : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              />
            </div>

            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate leading-tight">
                {otherUser?.name ?? "Loading..."}
              </h2>
              <div className="flex items-center gap-1 text-xs">
                {otherUser?.isOnline ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <span className="text-green-500 font-medium">Online</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                    <span className="text-zinc-500">Offline</span>
                  </>
                )}
                {otherUser?.role && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className="capitalize text-zinc-500 truncate">{otherUser.role}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              aria-label="Search messages"
              onClick={() => setShowSearch(!showSearch)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                showSearch
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-600"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Search size={17} />
            </button>

            {!compact && (
              <button
                aria-label="Close chat"
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-red-100 dark:hover:bg-red-900 flex items-center justify-center text-zinc-500 hover:text-red-600 transition"
              >
                <X size={17} />
              </button>
            )}
          </div>
        </div>

        {/* ── Search panel ────────────────────────────────────────── */}
        {showSearch && (
          <div className="border-b bg-zinc-50 dark:bg-zinc-900 px-4 py-3 shrink-0">
            <SearchMessages conversationId={Number(conversationId)} />
          </div>
        )}

        {/* ── Pinned messages ─────────────────────────────────────── */}
        <div className="shrink-0">
          <PinnedMessages conversationId={Number(conversationId)} />
        </div>

        {/* ── Messages + scroll-to-bottom button ──────────────────── */}
        <div className="flex-1 min-h-0 relative">
          {/* NO scroll-smooth on the container — controlled in JS only */}
          <div
            ref={messagesRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 bg-zinc-50 dark:bg-zinc-900"
          >
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-zinc-400 text-center py-8 text-sm">
                No messages yet. Say hi! 👋
              </p>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={currentUserId ?? 0}
                  onRefresh={loadMessages}
                  onPreviewFile={(url, name) => setPreviewFile({ url, name })}
                />
              ))
            )}
          </div>

          {/* Scroll-to-bottom floating button */}
          {showScrollBtn && (
            <button
              aria-label="Jump to latest message"
              onClick={() => {
                shouldAutoScroll.current = true;
                setShowScrollBtn(false);
                scrollToBottom("smooth");
              }}
              className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition z-10"
            >
              <ChevronDown size={18} />
            </button>
          )}
        </div>

        {/* ── Typing indicator ────────────────────────────────────── */}
        <div className="px-4 shrink-0 min-h-7 flex items-center">
          <TypingIndicator
            conversationId={Number(conversationId)}
            currentUserId={currentUserId ?? 0}
          />
        </div>

        {/* ── Input bar ───────────────────────────────────────────── */}
        <div className="border-t px-4 py-3 flex items-center gap-2 bg-white dark:bg-zinc-950 shrink-0">
          <input
            ref={inputRef}
            value={message}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) sendMessage();
            }}
            placeholder="Write a message..."
            className="flex-1 min-w-0 rounded-full border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 dark:bg-zinc-900 transition"
          />
          <FileUpload
            conversationId={Number(conversationId)}
            onUploadSuccess={loadMessages}
          />
          <button
            aria-label="Send message"
            onClick={sendMessage}
            disabled={!message.trim() || sending}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition shrink-0 ${
              message.trim() && !sending
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
          >
            <SendHorizontal size={17} />
          </button>
        </div>
      </div>

      {previewFile && (
        <FilePreviewModal
          fileUrl={previewFile.url}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}
