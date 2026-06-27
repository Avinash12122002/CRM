"use client";

import { useChat } from "@/contexts/ChatContext";
import ChatPage from "@/components/chat/ChatPage";

export default function FloatingChatWindow() {
  const { isOpen } = useChat();

  if (!isOpen) return null;

  return (
    <div
      className="
        fixed
        bottom-24
        right-6
        w-[420px]
        bg-white
        dark:bg-zinc-950
        rounded-xl
        shadow-2xl
        border
        z-9998
        overflow-hidden
        flex
        flex-col
      "
      style={{
        /*
         * BUG FIX: Previously h-[680px] at bottom-24 = 776px total.
         * On any viewport shorter than 776px the window clips at the top,
         * hiding the tab bar and conversation header.
         *
         * Fix: height = min(680px, 100vh - 8rem)
         *   bottom-24 = 6rem (96px) from bottom
         *   We reserve 8rem (128px) total = 96px button gap + 32px breathing room at top
         *   So the window top is always ≥ 32px from the viewport top.
         */
        height: "min(680px, calc(100vh - 8rem))",
      }}
    >
      <ChatPage compact={true} />
    </div>
  );
}