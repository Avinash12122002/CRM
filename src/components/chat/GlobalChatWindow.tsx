"use client";

import { useEffect, useRef, useState } from "react";
import GlobalMessage from "./GlobalMessage";
import FileUpload from "./FileUpload";
import toast from "react-hot-toast";
import { SendHorizontal, ChevronDown } from "lucide-react";

type Props = {
  currentUserId: number;
  currentUserName: string;
};

export default function GlobalChatWindow({ currentUserId, currentUserName }: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const firstLoad = useRef(true);

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

  useEffect(() => {
    firstLoad.current = true;
    shouldAutoScroll.current = true;
    loadMessages();
    markRead();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!messagesRef.current || messages.length === 0) return;

    if (firstLoad.current) {
      requestAnimationFrame(() => {
        scrollToBottom("instant");
        firstLoad.current = false;
      });
      return;
    }

    const atBottom = shouldAutoScroll.current;
    if (atBottom) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [messages]);

  const loadMessages = async () => {
    try {
      const res = await fetch("/api/chat/global-chat/messages");
      const data = await res.json();
      setMessages((prev) => {
        const next = data.messages || [];
        if (
          prev.length === next.length &&
          prev.every(
            (m, i) =>
              m.id === next[i]?.id &&
              m.reactions?.length === next[i]?.reactions?.length
          )
        ) {
          return prev;
        }
        return next;
      });
    } catch {} finally {
      setLoading(false);
    }
  };

  const markRead = async () => {
    await fetch("/api/chat/global-chat/read", { method: "PUT" }).catch(() => {});
  };

  const sendMessage = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/global-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, type: "text" }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.message || "Failed to send");
        return;
      }
      setMessage("");
      shouldAutoScroll.current = true;
      setShowScrollBtn(false);
      loadMessages();
    } catch {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b font-semibold bg-white dark:bg-zinc-900 flex items-center gap-2 shrink-0">
        🌐 <span>Global Chat</span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={messagesRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto overflow-x-hidden p-4 space-y-4 bg-white dark:bg-zinc-950"
        >
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-zinc-400 text-sm py-8">
              No messages yet. Say hi! 👋
            </div>
          ) : (
            messages.map((msg) => (
              <GlobalMessage
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                onRefresh={loadMessages}
              />
            ))
          )}
          <div id="global-bottom" />
        </div>

        {showScrollBtn && (
          <button
            aria-label="Scroll to latest"
            onClick={() => {
              shouldAutoScroll.current = true;
              setShowScrollBtn(false);
              scrollToBottom("smooth");
            }}
            className="
              absolute bottom-4 right-4
              w-9 h-9 rounded-full
              bg-white dark:bg-zinc-800
              border border-zinc-200 dark:border-zinc-700
              shadow-md flex items-center justify-center
              text-zinc-600 dark:text-zinc-300
              hover:bg-zinc-50 dark:hover:bg-zinc-700
              transition z-10
            "
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 flex gap-2 bg-white dark:bg-zinc-900 shrink-0">
        <FileUpload isGlobal={true} onUploadSuccess={loadMessages} />

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) sendMessage();
          }}
          placeholder="Message everyone..."
          className="flex-1 min-w-0 border rounded-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-blue-500 transition"
        />

        <button
          onClick={sendMessage}
          disabled={sending || !message.trim()}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${
            message.trim() && !sending
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
          }`}
        >
          <SendHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}
