"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";

type Props = {
  messageId: number;
  isMine: boolean;
  isPinned?: boolean;
  isGlobal?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onRefresh: () => void;
};

export default function MessageActions({
  messageId,
  isMine,
  isPinned = false,
  isGlobal = false,
  onEdit,
  onDelete,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);

  const [menuStyle, setMenuStyle] =
    useState<React.CSSProperties>({});

  const buttonRef =
    useRef<HTMLButtonElement>(null);

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect =
        buttonRef.current.getBoundingClientRect();

      const menuWidth = 150;

      let itemCount = 0;

      if (!isGlobal) itemCount += 2; // pin + star

      if (isMine) itemCount += 2; // edit + delete

      const menuHeight = itemCount * 36 + 8;

      // Prefer opening below the button; flip above if no room
      let top = rect.bottom + 4;

      if (top + menuHeight > window.innerHeight) {
        top = rect.top - menuHeight - 4;
      }

      // Align right edge of menu with button, clamp inside viewport
      let left = rect.right - menuWidth;

      if (left < 8) left = 8;

      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      setMenuStyle({
        position: "fixed",
        top,
        left,
        width: menuWidth,
      });
    }

    setOpen(!open);
  };

  const pin = async () => {
    setOpen(false);

    await fetch("/api/chat/pinned", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId,
        isPinned: !isPinned,
      }),
    });

    toast.success(isPinned ? "Unpinned" : "Message pinned");

    onRefresh();
  };

  const star = async () => {
    setOpen(false);

    await fetch("/api/chat/starred", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });

    toast.success("Message starred");
  };

  const handleDelete = async () => {
    setOpen(false);

    const res = await fetch("/api/chat/delete-message", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });

    if (res.ok) {
      toast.success("Message deleted");
      onDelete?.();
      onRefresh();
    } else {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="
          opacity-0
          group-hover:opacity-100
          transition
          text-xs
          px-1
          rounded
          hover:bg-zinc-200
          dark:hover:bg-zinc-700
        "
      >
        ···
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div
            style={menuStyle}
            className="
              z-50
              bg-white
              dark:bg-zinc-900
              border
              rounded-lg
              shadow-lg
              py-1
            "
          >
            {!isGlobal && (
              <button
                onClick={pin}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {isPinned ? "📌 Unpin" : "📌 Pin"}
              </button>
            )}

            {!isGlobal && (
              <button
                onClick={star}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ⭐ Star
              </button>
            )}

            {isMine && (
              <>
                <button
                  onClick={() => {
                    setOpen(false);
                    onEdit?.();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  ✏️ Edit
                </button>

                <button
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  🗑️ Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
