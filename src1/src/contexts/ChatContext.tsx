"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

type ChatContextType = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedConversation: number | null;
  setSelectedConversation: React.Dispatch<React.SetStateAction<number | null>>;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        setIsOpen,
        selectedConversation,
        setSelectedConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used inside ChatProvider");
  }
  return context;
}