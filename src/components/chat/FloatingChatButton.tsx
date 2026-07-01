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
  bottom-3
  right-1
  w-10
  h-10
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
  z-9999
"
    >
      {isOpen ? <X size={20} /> : <MessageCircle size={20} />}

      {!isOpen && unreadCount > 0 && (
        <span
  className="
    absolute
    -top-1
    -right-1
    min-w-4
    h-4
    px-1
    rounded-full
    bg-red-500
    text-white
    text-[9px]
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