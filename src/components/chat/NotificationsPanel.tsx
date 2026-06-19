"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Notification = {
  id: number;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export default function NotificationsPanel() {
  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const router = useRouter();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const res = await fetch("/api/notifications");

    const data = await res.json();

    setNotifications(data.notifications || []);
  };

  const markRead = async (id: number) => {
    await fetch("/api/notifications/read", {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({ notificationId: id }),
    });

    loadNotifications();
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) await markRead(n.id);

    if (n.link) router.push(n.link);
  };

  const unreadCount = notifications.filter(
    (n) => !n.read
  ).length;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Notifications</h2>

        {unreadCount > 0 && (
          <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">
            {unreadCount} unread
          </span>
        )}
      </div>

      {notifications.length === 0 && (
        <div className="text-sm text-zinc-400 text-center py-4">
          No notifications
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => handleClick(n)}
            className={`
              border
              rounded-lg
              p-3
              cursor-pointer
              transition
              ${
                n.read
                  ? "opacity-60"
                  : "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">
                {n.title}
              </div>

              {!n.read && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              )}
            </div>

            <div className="text-sm mt-1">
              {n.message}
            </div>

            <div className="text-xs opacity-50 mt-1">
              {new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
