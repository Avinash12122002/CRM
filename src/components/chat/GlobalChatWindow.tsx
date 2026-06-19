"use client";

import { useEffect, useRef, useState } from "react";
import GlobalMessage from "./GlobalMessage";
import FileUpload from "./FileUpload";
import toast from "react-hot-toast";

type Props = {
  currentUserId: number;
  currentUserName: string;
};

export default function GlobalChatWindow({
  currentUserId,
  currentUserName,
}: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    markRead();

    const interval = setInterval(loadMessages, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    try {
      const res = await fetch("/api/chat/global-chat/messages");
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  };

  const markRead = async () => {
    await fetch("/api/chat/global-chat/read", {
      method: "PUT",
    }).catch(() => {});
  };

  const sendMessage = async () => {
    if (!message.trim() || sending) return;

    try {
      setSending(true);

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
      loadMessages();
    } catch {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b font-semibold bg-white dark:bg-zinc-900 flex items-center gap-2">
        🌐
        <span>Global Chat</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-zinc-950">
        {messages.length === 0 && (
          <div className="text-center text-zinc-400 text-sm py-8">
            No messages yet. Say hi! 👋
          </div>
        )}

        {messages.map((msg) => (
          <GlobalMessage
            key={msg.id}
            message={msg}
            currentUserId={currentUserId}
            onRefresh={loadMessages}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 flex gap-2 bg-white dark:bg-zinc-900">
        <FileUpload
          isGlobal={true}
          onUploadSuccess={loadMessages}
        />

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) sendMessage();
          }}
          placeholder="Message everyone..."
          className="
            flex-1
            border
            rounded-lg
            px-4
            py-2
            text-sm
            bg-zinc-50
            dark:bg-zinc-800
          "
        />

        <button
          onClick={sendMessage}
          disabled={sending || !message.trim()}
          className="
            px-5
            py-2
            bg-blue-600
            text-white
            rounded-lg
            text-sm
            disabled:opacity-50
            hover:bg-blue-700
          "
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
