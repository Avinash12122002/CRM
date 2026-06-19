"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationsPanel from "./NotificationsPanel";

export default function NotificationBell() {
  const [notifCount, setNotifCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [globalCount, setGlobalCount] = useState(0);
  const [open, setOpen] = useState(false);

  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCounts();

    const interval = setInterval(loadCounts, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadCounts = async () => {
    try {
      const [notifRes, chatRes, globalRes] = await Promise.all([
        fetch("/api/notifications"),
        fetch("/api/chat/unread"),
        fetch("/api/chat/global-chat/unread"),
      ]);

      const notifData = await notifRes.json();
      const chatData = await chatRes.json();
      const globalData = await globalRes.json();

      const unreadNotifs = (notifData.notifications || []).filter(
        (n: any) => !n.read
      ).length;

      setNotifCount(unreadNotifs);
      setChatCount(chatData.unreadCount || 0);
      setGlobalCount(globalData.unreadCount || 0);
    } catch {}
  };

  const total = notifCount + chatCount + globalCount;

  const goToChat = () => {
    setOpen(false);
    router.push("/dashboard/chat");
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative"
      >
        <span className="text-xl">🔔</span>

        {total > 0 && (
          <span
            className="
              absolute
              -top-2
              -right-2
              bg-red-500
              text-white
              text-xs
              rounded-full
              min-w-[18px]
              h-[18px]
              px-1
              flex
              items-center
              justify-center
            "
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="
            absolute
            right-0
            mt-2
            w-80
            max-h-[70vh]
            overflow-y-auto
            bg-white
            dark:bg-zinc-900
            border
            rounded-lg
            shadow-lg
            z-50
          "
        >
          <div className="p-3">
            <NotificationsPanel />
          </div>

          {(chatCount > 0 || globalCount > 0) && (
            <button
              onClick={goToChat}
              className="
                w-full
                text-left
                px-4
                py-3
                text-sm
                border-t
                hover:bg-zinc-100
                dark:hover:bg-zinc-800
              "
            >
              💬 {chatCount + globalCount} unread message
              {chatCount + globalCount > 1 ? "s" : ""} — go to chat
            </button>
          )}
        </div>
      )}
    </div>
  );
}
