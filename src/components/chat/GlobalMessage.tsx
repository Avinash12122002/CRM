"use client";

import EmojiReaction from "./EmojiReaction";

type Reaction = {
  userId: number;
  userName: string;
  emoji: string;
};

type Props = {
  message: {
    id: number;
    senderId: number;
    senderName: string;
    message: string;
    type?: string;
    fileId?: string;
    fileName?: string;
    reactions: Reaction[];
    createdAt: string;
  };
  currentUserId: number;
  onRefresh: () => void;
};

export default function GlobalMessage({
  message,
  currentUserId,
  onRefresh,
}: Props) {
  const isMine = message.senderId === currentUserId;

  const fileUrl = message.fileId
    ? `/api/chat/files/${message.fileId}`
    : null;

  return (
    <div
      className={`flex gap-2 group ${
        isMine ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar */}
      <div
        className="
          w-8
          h-8
          rounded-full
          bg-blue-500
          text-white
          text-sm
          font-bold
          flex
          items-center
          justify-center
          shrink-0
        "
      >
        {message.senderName.charAt(0).toUpperCase()}
      </div>

      <div className={`max-w-[70%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        {!isMine && (
          <div className="text-xs font-medium text-zinc-500 mb-1">
            {message.senderName}
          </div>
        )}

        <div
          className={`
            rounded-lg
            p-3
            ${
              isMine
                ? "bg-blue-600 text-white rounded-tr-none"
                : "bg-zinc-200 dark:bg-zinc-700 rounded-tl-none"
            }
          `}
        >
          {message.message && (
            <div className="text-sm">{message.message}</div>
          )}

          {message.type === "file" && fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-sm underline mt-1"
            >
              📎 {message.fileName}
            </a>
          )}
        </div>

        <EmojiReaction
          messageId={message.id}
          reactions={message.reactions || []}
          currentUserId={currentUserId}
          isGlobal={true}
          align={isMine ? "right" : "left"}
          onReactionUpdate={onRefresh}
        />

        <div className="text-[10px] text-zinc-400 mt-1">
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
