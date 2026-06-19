"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: number;
  title: string;
  message: string;
  isPinned: boolean;
  createdAt: string;
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] =
    useState<Announcement[]>([]);

  useEffect(() => {
    loadAnnouncements();

    const interval = setInterval(loadAnnouncements, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadAnnouncements = async () => {
    try {
      const res = await fetch("/api/announcements");

      const data = await res.json();

      // Sort: pinned first, then by date
      const sorted = (data.announcements || []).sort(
        (a: Announcement, b: Announcement) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
          );
        }
      );

      setAnnouncements(sorted);
    } catch (err) {
      console.error(err);
    }
  };

  if (announcements.length === 0) return null;

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700">
      <div className="px-4 py-2">
        {announcements.slice(0, 3).map((announcement) => (
          <div
            key={announcement.id}
            className="flex items-center gap-2 text-sm py-1"
          >
            <span>{announcement.isPinned ? "📌" : "📢"}</span>

            <span className="font-semibold">
              {announcement.title}
            </span>

            <span className="text-zinc-600 dark:text-zinc-400">
              {announcement.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
