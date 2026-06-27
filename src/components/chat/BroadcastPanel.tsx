"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Megaphone, SendHorizontal } from "lucide-react";

type BroadcastPanelProps = {
  userRole: "admin" | "employee" | "meeting";
};

type Broadcast = {
  id: number;
  senderName: string;
  message: string;
  createdAt: string;
};

export default function BroadcastPanel({ userRole }: BroadcastPanelProps) {
  const [message, setMessage] = useState("");
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadBroadcasts();
    const interval = setInterval(loadBroadcasts, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadBroadcasts = async () => {
    try {
      const res = await fetch("/api/chat/broadcast");
      const data = await res.json();
      setBroadcasts(data.broadcasts || []);
    } catch {
      toast.error("Failed to load broadcasts");
    }
  };

  const sendBroadcast = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message);
        return;
      }
      setMessage("");
      loadBroadcasts();
      toast.success("Broadcast sent");
    } catch {
      toast.error("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Megaphone size={18} className="text-blue-600" />
        <h2 className="font-semibold text-zinc-800 dark:text-white">Company Broadcasts</h2>
        {userRole !== "admin" && (
          <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            Read only
          </span>
        )}
      </div>

      {/* Admin compose box */}
      {userRole === "admin" && (
        <div className="flex gap-2">
          <input
            placeholder="Write a company announcement..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendBroadcast();
            }}
            className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-zinc-50 dark:bg-zinc-900"
          />
          <button
            onClick={sendBroadcast}
            disabled={!message.trim() || sending}
            className={`px-4 rounded-lg flex items-center gap-1.5 text-sm font-medium transition ${
              message.trim() && !sending
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
          >
            <SendHorizontal size={15} />
            Send
          </button>
        </div>
      )}

      {/* Broadcast list */}
      <div className="space-y-3">
        {broadcasts.length === 0 ? (
          <div className="py-10 text-center text-zinc-400 text-sm">
            No broadcasts yet.
          </div>
        ) : (
          broadcasts.map((item) => (
            <div
              key={item.id}
              className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Megaphone size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-semibold text-sm">{item.senderName}</span>
                </div>
                <span className="text-xs text-zinc-400 shrink-0">
                  {new Date(item.createdAt).toLocaleDateString()}{" "}
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{item.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}