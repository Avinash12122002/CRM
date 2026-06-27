"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";

export default function FloatingChatButton() {
  const { isOpen, setIsOpen } = useChat();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadUnreadCount = async () => {
    try {
      const res = await fetch("/api/chat/unread");
      const data = await res.json();
      setUnreadCount(data.unreadCount || 0);
    } catch {}
  };

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      aria-label={isOpen ? "Close messaging" : "Open messaging"}
      className="
        fixed
        bottom-6
        right-6
        w-14
        h-14
        rounded-full
        bg-blue-600
        hover:bg-blue-700
        text-white
        shadow-2xl
        flex
        items-center
        justify-center
        transition-all
        duration-300
        hover:scale-105
        z-[9999]
      "
    >
      {isOpen ? <X size={22} /> : <MessageCircle size={24} />}

      {!isOpen && unreadCount > 0 && (
        <span
          className="
            absolute
            -top-1
            -right-1
            min-w-[20px]
            h-[20px]
            px-1
            rounded-full
            bg-red-500
            text-white
            text-[11px]
            font-semibold
            flex
            items-center
            justify-center
          "
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}