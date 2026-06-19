"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type Announcement = {
  id: number;
  title: string;
  message: string;
  isPinned: boolean;
  pinnedAt: string | null;
  createdByName: string;
  createdAt: string;
  readBy: { userId: number; userName: string }[];
};

export default function AnnouncementsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentUser();
    loadAnnouncements();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUserRole(data.role);
    } catch {}
  };

  const loadAnnouncements = async () => {
    try {
      const res = await fetch("/api/announcements");
      const data = await res.json();

      // Sort: pinned first, then newest
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
    } catch {
      toast.error("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  const createAnnouncement = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }

    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message);
        return;
      }

      toast.success("Announcement created");
      setTitle("");
      setMessage("");
      loadAnnouncements();
    } catch {
      toast.error("Failed to create announcement");
    }
  };

  const togglePin = async (id: number, isPinned: boolean) => {
    try {
      const res = await fetch("/api/announcements/pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          announcementId: id,
          isPinned: !isPinned,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message);
        return;
      }

      toast.success(isPinned ? "Unpinned" : "Pinned");
      loadAnnouncements();
    } catch {
      toast.error("Failed to update");
    }
  };

  const markRead = async (id: number) => {
    try {
      await fetch("/api/announcements/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId: id }),
      });

      loadAnnouncements();
    } catch {}
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Announcements</h1>

      {/* Create form — admin only */}
      {userRole === "admin" && (
        <div className="border rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Create Announcement</h2>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full border rounded-lg px-4 py-2 mb-3"
          />

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message"
            rows={4}
            className="w-full border rounded-lg px-4 py-2 mb-3"
          />

          <button
            onClick={createAnnouncement}
            className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Create
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-zinc-400">Loading...</p>
      ) : announcements.length === 0 ? (
        <p className="text-zinc-400">No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className={`
                border
                rounded-lg
                p-4
                ${
                  announcement.isPinned
                    ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10"
                    : ""
                }
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {announcement.isPinned && (
                      <span className="text-yellow-500">📌</span>
                    )}

                    <div className="font-semibold">
                      {announcement.title}
                    </div>
                  </div>

                  <div className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
                    {announcement.message}
                  </div>

                  <div className="text-xs text-zinc-400 mt-2">
                    By {announcement.createdByName} ·{" "}
                    {new Date(announcement.createdAt).toLocaleString()}
                    {announcement.readBy?.length > 0 && (
                      <span className="ml-2">
                        · {announcement.readBy.length} read
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  {/* Pin — admin only */}
                  {userRole === "admin" && (
                    <button
                      onClick={() =>
                        togglePin(
                          announcement.id,
                          announcement.isPinned
                        )
                      }
                      className="text-xs px-2 py-1 border rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {announcement.isPinned ? "Unpin" : "Pin"}
                    </button>
                  )}

                  <button
                    onClick={() => markRead(announcement.id)}
                    className="text-xs px-2 py-1 border rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    Mark Read
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
