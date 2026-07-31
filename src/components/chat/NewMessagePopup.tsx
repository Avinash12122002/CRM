"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";

type Conversation = {
  id: number;
  otherUserId: number;
  otherUserName: string;
  otherUserUsername?: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

type IncomingPopup = {
  conversationId: number;
  name: string;
  message: string;
};

type PrevEntry = {
  lastMessageAt: string | null;
  unreadCount: number;
};

export default function NewMessagePopup() {
  const { isOpen, selectedConversation, setIsOpen, setSelectedConversation } =
    useChat();

  const [popup, setPopup] = useState<IncomingPopup | null>(null);

  const prevRef = useRef<Map<number, PrevEntry> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpenRef = useRef(isOpen);
  const selectedConversationRef = useRef(selectedConversation);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    checkForNewMessages();

    const interval = setInterval(checkForNewMessages, 5000);

    return () => {
      clearInterval(interval);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForNewMessages = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;

      const data = await res.json();
      const conversations: Conversation[] = data.conversations || [];

      const prev = prevRef.current;
      const next = new Map<number, PrevEntry>();

      let incoming: IncomingPopup | null = null;

      for (const conv of conversations) {
        next.set(conv.id, {
          lastMessageAt: conv.lastMessageAt,
          unreadCount: conv.unreadCount,
        });

        // Skip comparison on the very first load — just establish a baseline
        // so we don't pop up a toast for every already-unread message.
        if (!prev) continue;

        const prevEntry = prev.get(conv.id);
        const prevUnread = prevEntry?.unreadCount ?? 0;
        const prevAt = prevEntry?.lastMessageAt ?? null;

        const hasNewTimestamp =
          !!conv.lastMessageAt && conv.lastMessageAt !== prevAt;
        const unreadIncreased = conv.unreadCount > prevUnread;

        if (hasNewTimestamp && unreadIncreased) {
          const alreadyViewing =
            isOpenRef.current &&
            selectedConversationRef.current === conv.id;

          if (!alreadyViewing) {
            incoming = {
              conversationId: conv.id,
              name: conv.otherUserName || "Someone",
              message: conv.lastMessage || "Sent you a new message",
            };
          }
        }
      }

      prevRef.current = next;

      if (incoming) {
        showPopup(incoming);
      }
    } catch {
      // silently ignore — popup is a nice-to-have, not critical
    }
  };

  const showPopup = (data: IncomingPopup) => {
    setPopup(data);

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setPopup(null), 8000);
  };

  const handleClose = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setPopup(null);
  };

  const handleOpen = () => {
    if (!popup) return;
    setSelectedConversation(popup.conversationId);
    setIsOpen(true);
    handleClose();
  };

  if (!popup) return null;

  return (
    <div
      className="
        fixed
        inset-0
        z-[10000]
        flex
        items-start
        justify-center
        pt-24
        px-4
        pointer-events-none
      "
    >
      <div
        role="alert"
        onClick={handleOpen}
        className="
          pointer-events-auto
          w-full
          max-w-sm
          bg-white
          dark:bg-red-500
          border
          border-zinc-200
          dark:border-zinc-700
          rounded-2xl
          shadow-2xl
          p-4
          cursor-pointer
          transition-all
          duration-200
        "
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center">
            <MessageCircle size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-black-900 dark:text-black-100">
              New message from {popup.name}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-200 truncate mt-0.5">
              {popup.message}
            </p>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            aria-label="Dismiss"
            className="
              shrink-0
              w-7
              h-7
              flex
              items-center
              justify-center
              rounded-full
              text-black-400
              hover:text-zinc-700
              hover:bg-zinc-100
              dark:hover:bg-zinc-800
              dark:hover:text-zinc-200
              transition
              cursor-pointer
            "
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
