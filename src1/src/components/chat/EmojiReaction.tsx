"use client";

import { useRef, useState } from "react";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

type Reaction = {
  userId: number;
  userName: string;
  emoji: string;
};

type Props = {
  messageId: number;
  reactions?: Reaction[];
  currentUserId: number;
  isGlobal?: boolean;
  align?: "left" | "right";
  onReactionUpdate: () => void;
};

export default function EmojiReaction({
  messageId,
  reactions = [],
  currentUserId,
  isGlobal = false,
  align = "left",
  onReactionUpdate,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);

  const [pickerStyle, setPickerStyle] =
    useState<React.CSSProperties>({});

  const buttonRef =
    useRef<HTMLButtonElement>(null);

  const baseUrl = isGlobal
    ? "/api/chat/global-chat/reactions"
    : "/api/chat/reactions";

  const myReaction = reactions.find(
    (r) => r.userId === currentUserId
  );

  const grouped = EMOJIS.reduce(
    (acc, emoji) => {
      const count = reactions.filter(
        (r) => r.emoji === emoji
      ).length;

      if (count > 0) acc[emoji] = count;

      return acc;
    },
    {} as Record<string, number>
  );

  const togglePicker = () => {
    if (!showPicker && buttonRef.current) {
      const rect =
        buttonRef.current.getBoundingClientRect();

      const pickerWidth = EMOJIS.length * 34 + 24;
      const pickerHeight = 48;

      // Prefer opening below the button; flip above if no room
      let top = rect.bottom + 4;

      if (top + pickerHeight > window.innerHeight) {
        top = rect.top - pickerHeight - 4;
      }

      // Anchor to whichever side was requested, clamp inside viewport
      let left =
        align === "right"
          ? rect.right - pickerWidth
          : rect.left;

      if (left < 8) left = 8;

      if (left + pickerWidth > window.innerWidth - 8) {
        left = window.innerWidth - pickerWidth - 8;
      }

      setPickerStyle({
        position: "fixed",
        top,
        left,
        maxWidth: Math.min(
          pickerWidth,
          window.innerWidth - 16
        ),
      });
    }

    setShowPicker(!showPicker);
  };

  const addReaction = async (emoji: string) => {
    setShowPicker(false);

    if (myReaction?.emoji === emoji) {
      // Remove reaction
      await fetch(baseUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
    } else {
      await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
    }

    onReactionUpdate();
  };

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {Object.entries(grouped).map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => addReaction(emoji)}
          className={`
            text-xs
            px-1.5
            py-0.5
            rounded-full
            border
            transition
            ${
              myReaction?.emoji === emoji
                ? "bg-blue-100 border-blue-400 dark:bg-blue-900/40"
                : "bg-zinc-100 border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600"
            }
          `}
        >
          {emoji} {count}
        </button>
      ))}

      <button
        ref={buttonRef}
        onClick={togglePicker}
        className="
          text-xs
          px-1.5
          py-0.5
          rounded-full
          border
          border-zinc-300
          bg-zinc-100
          dark:bg-zinc-800
          dark:border-zinc-600
          hover:bg-zinc-200
        "
      >
        😊+
      </button>

      {showPicker && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPicker(false)}
          />

          <div
            style={pickerStyle}
            className="
              z-50
              bg-white
              dark:bg-zinc-900
              border
              rounded-lg
              p-2
              flex
              gap-1
              shadow-lg
              overflow-x-auto
            "
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => addReaction(emoji)}
                className="text-lg hover:scale-125 transition-transform shrink-0"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
