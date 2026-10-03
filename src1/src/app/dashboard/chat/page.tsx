import ChatPage from "@/components/chat/ChatPage";

export default function Page() {
  // compact={false} (default) → side-by-side layout for full dashboard page
  return (
    <div className="h-full">
      <ChatPage />
    </div>
  );
}