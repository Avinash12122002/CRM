"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import FileUpload from "@/components/chat/FileUpload";
import MessageBubble from "@/components/chat/MessageBubble";
import PinnedMessages from "@/components/chat/PinnedMessages";
import TypingIndicator from "@/components/chat/TypingIndicator";
import SearchMessages from "@/components/chat/SearchMessages";
import FilePreviewModal from "@/components/chat/FilePreviewModal";

type Reaction = {
  userId: number;
  userName: string;
  emoji: string;
};

type Message = {
  id: number;
  senderId: number;
  senderName: string;
  message: string;
  type?: "text" | "file";
  fileId?: string;
  fileName?: string;
  isRead?: boolean;
  edited?: boolean;
  deleted?: boolean;
  isPinned?: boolean;
  reactions?: Reaction[];
  createdAt: string;
};

export default function ConversationPage() {
  const params = useParams();

  const conversationId =
    params.conversationId as string;

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [currentUserId, setCurrentUserId] =
    useState<number | null>(null);

  const [otherUser, setOtherUser] =
    useState<{ name: string; role: string } | null>(null);

  const [showSearch, setShowSearch] =
    useState(false);

  const [previewFile, setPreviewFile] =
    useState<{ url: string; name?: string } | null>(null);

  // Fullscreen: default true so conversation opens full window
  const [isFullscreen, setIsFullscreen] =
    useState(true);

  const bottomRef =
    useRef<HTMLDivElement>(null);

  const typingTimeout =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCurrentUser();
    loadConversationInfo();
    loadMessages();

    const interval = setInterval(loadMessages, 2000);

    return () => {
      clearInterval(interval);
      setTyping(false);
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  const loadCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setCurrentUserId(data.id);
    } catch {}
  };

  const loadConversationInfo = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();

      const match = (data.conversations || []).find(
        (c: any) => c.id === Number(conversationId),
      );

      if (match) {
        setOtherUser({
          name: match.otherUserName,
          role: match.otherUserRole,
        });
      }
    } catch {}
  };

  const loadMessages = async () => {
    try {
      const res = await fetch(
        `/api/chat/messages/${conversationId}`,
      );

      const data = await res.json();

      setMessages(data.messages || []);

      await fetch("/api/chat/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: Number(conversationId),
        }),
      });
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  const setTyping = async (typing: boolean) => {
    try {
      await fetch("/api/chat/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: Number(conversationId),
          typing,
        }),
      });
    } catch {}
  };

  const handleInputChange = (value: string) => {
    setMessage(value);
    setTyping(true);

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: Number(conversationId),
          message,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message);
        return;
      }

      setMessage("");
      setTyping(false);

      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }

      loadMessages();
    } catch {
      toast.error("Failed to send message");
    }
  };

  if (currentUserId === null) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <div
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col p-4"
            : "h-[calc(100vh-120px)] flex flex-col p-6"
        }
      >
        <div className="border rounded-lg flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b p-4 flex items-center justify-between">
            <div>
              <h1 className="font-semibold text-lg">
                {otherUser
                  ? otherUser.name
                  : `Conversation #${conversationId}`}
              </h1>

              {otherUser && (
                <p className="text-xs text-zinc-500">
                  {otherUser.role}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="text-sm border rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {showSearch ? "✕ Search" : "🔍 Search"}
              </button>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="text-sm border rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {isFullscreen ? "⤓ Minimize" : "⤢ Fullscreen"}
              </button>
            </div>
          </div>

          {/* Search panel */}
          {showSearch && (
            <div className="border-b p-4">
              <SearchMessages
                conversationId={Number(conversationId)}
              />
            </div>
          )}

          {/* Pinned messages */}
          <PinnedMessages
            conversationId={Number(conversationId)}
          />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <p className="text-zinc-400">Loading...</p>
            ) : messages.length === 0 ? (
              <p className="text-zinc-400 text-center py-8">
                No messages yet. Say hi!
              </p>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={currentUserId}
                  onRefresh={loadMessages}
                  onPreviewFile={(url, name) =>
                    setPreviewFile({ url, name })
                  }
                />
              ))
            )}

            <div ref={bottomRef} />
          </div>

          {/* Typing indicator */}
          <TypingIndicator
            conversationId={Number(conversationId)}
            currentUserId={currentUserId}
          />

          {/* Input */}
          <div className="border-t p-4 flex gap-2 items-center">
            <input
              value={message}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Type message..."
              className="
                flex-1
                border
                rounded-lg
                px-4
                py-2
              "
            />

            <FileUpload
              conversationId={Number(conversationId)}
              onUploadSuccess={loadMessages}
            />

            <button
              onClick={sendMessage}
              className="
                bg-blue-600
                text-white
                px-6
                py-2
                rounded-lg
                hover:bg-blue-700
              "
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* File preview modal — outside the fullscreen div so it always renders on top */}
      {previewFile && (
        <FilePreviewModal
          fileUrl={previewFile.url}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}