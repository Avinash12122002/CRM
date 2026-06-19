"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  leadId: number;
};

export default function LeadChat({ leadId }: Props) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fixed: leadId in dep array so re-fetch if it changes
  useEffect(() => {
    loadMessages();

    const interval = setInterval(loadMessages, 3000);

    return () => clearInterval(interval);
  }, [leadId]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    try {
      const res = await fetch(
        `/api/chat/lead-chat/${leadId}`
      );

      const data = await res.json();

      setMessages(data.messages || []);
    } catch {}
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    await fetch(`/api/chat/lead-chat/${leadId}`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({ message }),
    });

    setMessage("");

    loadMessages();
  };

  return (
    <div className="border rounded-lg p-4 flex flex-col">
      <h2 className="font-semibold mb-4">
        Lead Discussion
      </h2>

      <div className="space-y-2 mb-4 max-h-96 overflow-y-auto flex-1">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-400 text-center py-4">
            No messages yet
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className="border rounded-lg p-2"
          >
            <div className="font-medium text-sm">
              {msg.senderName}
            </div>

            <div className="text-sm mt-1">
              {msg.message}
            </div>

            <div className="text-xs opacity-50 mt-1">
              {new Date(msg.createdAt).toLocaleTimeString()}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
          placeholder="Type a message..."
          className="
            flex-1
            border
            rounded-lg
            px-3
            py-2
            text-sm
          "
        />

        <button
          onClick={sendMessage}
          className="
            bg-blue-600
            text-white
            px-4
            rounded-lg
            text-sm
          "
        >
          Send
        </button>
      </div>
    </div>
  );
}
