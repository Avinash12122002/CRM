"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import EmojiReaction from "./EmojiReaction";
import MessageActions from "./MessageActions";

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
    createdAt: string;
    type?: string;
    fileId?: string;
    fileName?: string;
    deleted?: boolean;
    edited?: boolean;
    isPinned?: boolean;
    reactions?: Reaction[];
  };
  currentUserId: number;
  onRefresh: () => void;
  onPreviewFile?: (fileUrl: string, fileName?: string) => void;
};

export default function MessageBubble({
  message,
  currentUserId,
  onRefresh,
  onPreviewFile,
}: Props) {
  const isMine =
    message.senderId === currentUserId;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.message);
  const [saving, setSaving] = useState(false);

  const fileUrl = message.fileId
    ? `/api/chat/files/${message.fileId}`
    : null;

  const saveEdit = async () => {
    if (!editValue.trim()) return;

    try {
      setSaving(true);

      const res = await fetch("/api/chat/edit-message", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: message.id,
          message: editValue,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to edit");
        return;
      }

      setIsEditing(false);
      onRefresh();
    } catch {
      toast.error("Failed to edit");
    } finally {
      setSaving(false);
    }
  };

  const handleFileClick = (e: React.MouseEvent) => {
    if (!fileUrl) return;

    if (onPreviewFile) {
      e.preventDefault();
      onPreviewFile(fileUrl, message.fileName);
    }
  };

  return (
    <div
      className={`flex group ${
        isMine ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`flex flex-col max-w-[70%] ${
          isMine ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`
            rounded-lg
            p-3
            relative
            ${
              isMine
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 dark:bg-zinc-800"
            }
          `}
        >
          {!isMine && (
            <div className="text-xs opacity-70 mb-1">
              {message.senderName}
            </div>
          )}

          {message.isPinned && (
            <div className="text-[10px] mb-1 opacity-70">
              📌 Pinned
            </div>
          )}

          {message.deleted ? (
            <div className="italic opacity-50 text-sm">
              This message was deleted
            </div>
          ) : isEditing ? (
            <div className="flex flex-col gap-2 min-w-[180px]">
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
                autoFocus
                className="
                  text-sm
                  rounded
                  px-2
                  py-1
                  text-black
                  border
                "
              />

              <div className="flex gap-2 text-xs">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="underline disabled:opacity-50"
                >
                  Save
                </button>

                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditValue(message.message);
                  }}
                  className="underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.message && (
                <div>{message.message}</div>
              )}

              {message.type === "file" && fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleFileClick}
                  className="block mt-2 underline text-sm"
                >
                  📎 {message.fileName}
                </a>
              )}

              {message.edited && (
                <div className="text-[10px] opacity-50 mt-1">
                  (edited)
                </div>
              )}
            </>
          )}

          <div className="text-[10px] opacity-70 mt-2">
            {new Date(message.createdAt).toLocaleTimeString()}
          </div>
        </div>

        {!message.deleted && (
          <div className="flex items-center gap-2 mt-1">
            <EmojiReaction
              messageId={message.id}
              reactions={message.reactions}
              currentUserId={currentUserId}
              isGlobal={false}
              align={isMine ? "right" : "left"}
              onReactionUpdate={onRefresh}
            />

            <MessageActions
              messageId={message.id}
              isMine={isMine}
              isPinned={message.isPinned}
              isGlobal={false}
              onEdit={() => setIsEditing(true)}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>
    </div>
  );
}
