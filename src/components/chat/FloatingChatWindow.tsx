"use client";

import { useChat } from "@/contexts/ChatContext";
import ChatPage from "@/components/chat/ChatPage";
import ConversationPage from "@/components/chat/ConversationPage";

export default function FloatingChatWindow() {
  const {
    isOpen,
    selectedConversation,
    setSelectedConversation,
  } = useChat();

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
        height: "min(680px, calc(100vh - 8rem))",
      }}
    >
      {selectedConversation ? (
        <ConversationPage
          conversationId={selectedConversation}
          onClose={() => setSelectedConversation(null)}
        />
      ) : (
        <ChatPage compact={true} />
      )}
    </div>
  );
}