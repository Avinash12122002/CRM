"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type StarredItem = {
  userId: number;
  messageId: number;
  starredAt: string;
  message: {
    id: number;
    conversationId: number;
    senderId: number;
    senderName: string;
    message: string;
    type?: string;
    fileName?: string;
    createdAt: string;
  };
};

export default function StarredMessages() {
  const [starred, setStarred] = useState<StarredItem[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    loadStarred();
  }, []);

  const loadStarred = async () => {
    try {
      const res = await fetch("/api/chat/starred");
      const data = await res.json();
      setStarred(data.starred || []);
    } catch {
      toast.error("Failed to load starred messages");
    } finally {
      setLoading(false);
    }
  };

  const unstar = async (messageId: number) => {
    try {
      await fetch("/api/chat/starred", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });

      toast.success("Removed from starred");

      loadStarred();
    } catch {
      toast.error("Failed to remove");
    }
  };

  const goToConversation = (conversationId: number) => {
    router.push(`/dashboard/chat/${conversationId}`);
  };

  if (loading) {
    return <p className="text-zinc-400">Loading...</p>;
  }

  if (starred.length === 0) {
    return (
      <p className="text-zinc-400 text-center py-8">
        No starred messages yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {starred.map((item) => (
        <div
          key={item.messageId}
          onClick={() =>
            goToConversation(item.message.conversationId)
          }
          className="
            flex
            items-start
            justify-between
            gap-2
            border
            rounded-lg
            p-3
            cursor-pointer
            hover:bg-zinc-50
            dark:hover:bg-zinc-800
          "
        >
          <div className="flex-1">
            <div className="text-xs font-medium text-zinc-500 mb-1">
              {item.message.senderName} ·{" "}
              {new Date(item.message.createdAt).toLocaleString()}
            </div>

            <div className="text-sm">
              {item.message.type === "file"
                ? `📎 ${item.message.fileName}`
                : item.message.message}
            </div>

            <div className="text-xs text-blue-500 mt-1">
              Conversation #{item.message.conversationId} — click to open
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              unstar(item.messageId);
            }}
            className="text-xs text-zinc-400 hover:text-red-500 shrink-0"
          >
            ✕ Unstar
          </button>
        </div>
      ))}
    </div>
  );
}
