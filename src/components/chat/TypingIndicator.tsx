"use client";

import { useEffect, useState } from "react";

type Props = {
  conversationId: number;
  currentUserId: number;
};

export default function TypingIndicator({
  conversationId,
  currentUserId,
}: Props) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/chat/typing?conversationId=${conversationId}`
        );

        const data = await res.json();

        const others = (data.typingUsers || [])
          .filter((u: any) => u.userId !== currentUserId)
          .map((u: any) => u.userName);

        setTypingUsers(others);
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [conversationId, currentUserId]);

  if (typingUsers.length === 0) return null;

  const label =
    typingUsers.length === 1
      ? `${typingUsers[0]} is typing`
      : `${typingUsers.join(", ")} are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-zinc-500">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
      </span>

      <span>{label}...</span>
    </div>
  );
}
