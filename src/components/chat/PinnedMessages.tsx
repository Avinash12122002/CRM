"use client";

import { useEffect, useState } from "react";

type PinnedMessage = {
  id: number;
  senderId: number;
  senderName: string;
  message: string;
  type?: string;
  fileName?: string;
  pinnedAt: string;
};

type Props = {
  conversationId: number;
};

export default function PinnedMessages({
  conversationId,
}: Props) {
  const [messages, setMessages] = useState<PinnedMessage[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadPinned();

    const interval = setInterval(loadPinned, 5000);

    return () => clearInterval(interval);
  }, [conversationId]);

  const loadPinned = async () => {
    try {
      const res = await fetch(
        `/api/chat/pinned?conversationId=${conversationId}`
      );

      const data = await res.json();

      setMessages(data.messages || []);
    } catch {}
  };

  const unpin = async (messageId: number) => {
    await fetch("/api/chat/pinned", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, isPinned: false }),
    });

    loadPinned();
  };

  if (messages.length === 0) return null;

  return (
    <div className="border-b">
      <button
        onClick={() => setOpen(!open)}
        className="
          w-full
          flex
          items-center
          justify-between
          px-4
          py-2
          text-sm
          font-medium
          hover:bg-zinc-50
          dark:hover:bg-zinc-800
          transition
        "
      >
        <span>📌 {messages.length} pinned message{messages.length > 1 ? "s" : ""}</span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="
                flex
                items-start
                justify-between
                border
                rounded-lg
                p-2
                bg-yellow-50
                dark:bg-yellow-900/10
                border-yellow-200
                dark:border-yellow-800
              "
            >
              <div className="flex-1">
                <div className="text-xs font-medium text-zinc-500 mb-1">
                  {msg.senderName}
                </div>

                <div className="text-sm">
                  {msg.type === "file"
                    ? `📎 ${msg.fileName}`
                    : msg.message}
                </div>
              </div>

              <button
                onClick={() => unpin(msg.id)}
                className="
                  text-xs
                  text-zinc-400
                  hover:text-red-500
                  ml-2
                  shrink-0
                "
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
