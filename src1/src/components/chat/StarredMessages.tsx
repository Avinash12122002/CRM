"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useChat } from "@/contexts/ChatContext";

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

  const {
    setIsOpen,
    setSelectedConversation,
  } = useChat();

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
      const res = await fetch("/api/chat/starred", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to remove");
        return;
      }

      toast.success("Removed from starred");

      setStarred((prev) =>
        prev.filter((item) => item.messageId !== messageId)
      );
    } catch {
      toast.error("Failed to remove");
    }
  };

  const goToConversation = (conversationId: number) => {
    setSelectedConversation(conversationId);
    setIsOpen(true);
  };

  if (loading) {
    return (
      <p className="text-center py-8 text-zinc-500">
        Loading...
      </p>
    );
  }

  if (starred.length === 0) {
    return (
      <p className="text-center py-8 text-zinc-500">
        No starred messages yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
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
            gap-3
            p-4
            border
            rounded-xl
            cursor-pointer
            transition
            hover:bg-zinc-100
            dark:hover:bg-zinc-800
          "
        >
          <div className="flex-1">
            <div className="text-xs text-zinc-500 font-medium mb-2">
              {item.message.senderName} •{" "}
              {new Date(item.message.createdAt).toLocaleString()}
            </div>

            <div className="text-sm break-words">
              {item.message.type === "file"
                ? `📎 ${item.message.fileName}`
                : item.message.message}
            </div>

            <div className="mt-2 text-xs font-medium text-blue-500 hover:underline">
              Chat with {item.message.senderName} →
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              unstar(item.messageId);
            }}
            className="
              shrink-0
              text-sm
              text-zinc-400
              hover:text-red-500
            "
          >
            ✕ Unstar
          </button>
        </div>
      ))}
    </div>
  );
}