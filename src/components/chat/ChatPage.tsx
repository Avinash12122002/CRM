"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import GlobalChatWindow from "@/components/chat/GlobalChatWindow";
import StarredMessages from "@/components/chat/StarredMessages";
import ConversationPage from "@/components/chat/ConversationPage";
import BroadcastPanel from "@/components/chat/BroadcastPanel";
import { Search, MessageCircle, Globe, Megaphone, Star } from "lucide-react";

type UserRole = "admin" | "employee" | "meeting";

type User = {
  id: number;
  name: string;
  username: string;
  role: string;
};

type Conversation = {
  id: number;
  otherUserId?: number;
  otherUserName: string;
  otherUserRole: string;
  lastMessage: string;
  unreadCount: number;
  updatedAt: string;
};

type ChatPageProps = {
  compact?: boolean;
  /** Pass an initial conversation ID to open immediately (e.g. from a notification) */
  initialConversationId?: number | null;
};

export default function ChatPage({ compact = false, initialConversationId }: ChatPageProps) {
  const [activeTab, setActiveTab] = useState<"messages" | "global" | "broadcast" | "starred">("messages");
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("employee");
  const [globalUnread, setGlobalUnread] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<number | null>(
    initialConversationId ?? null
  );

  useEffect(() => {
    loadCurrentUser();
    loadUsers();
    loadConversations();
    loadOnlineUsers();
    loadGlobalUnread();

    const interval = setInterval(() => {
      loadOnlineUsers();
      loadGlobalUnread();
      loadConversations();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // If parent passes a new initialConversationId (e.g. deep-link from notification)
  useEffect(() => {
    if (initialConversationId) {
      setSelectedConversation(initialConversationId);
      setActiveTab("messages");
    }
  }, [initialConversationId]);

  const loadCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setCurrentUserId(data.id);
      setCurrentUserName(data.name);
      setCurrentUserRole(data.role as UserRole);
    } catch {}
  };

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/chat/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
  };

  const loadOnlineUsers = async () => {
    try {
      const res = await fetch("/api/chat/online-users");
      const data = await res.json();
      setOnlineUsers((data.onlineUsers || []).map((u: any) => u.userId));
    } catch {}
  };

  const loadGlobalUnread = async () => {
    try {
      const res = await fetch("/api/chat/global-chat/unread");
      const data = await res.json();
      setGlobalUnread(data.unreadCount || 0);
    } catch {}
  };

  const openGlobalChat = () => {
    setActiveTab("global");
    setGlobalUnread(0);
  };

  const startChat = async (userId: number) => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message);
        return;
      }
      setSelectedConversation(data.conversation.id);
      setActiveTab("messages");
      loadConversations();
    } catch {
      toast.error("Failed to create chat");
    }
  };

  // Merge users with their conversation data so we can show last message + unread
  const filteredUsers = users
    .filter(
      (u) =>
        u.id !== currentUserId &&
        (u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.username.toLowerCase().includes(search.toLowerCase()))
    )
    .map((u) => {
      // Match by otherUserId if present, otherwise fall back to name matching
      const conv =
        conversations.find((c) => c.otherUserId === u.id) ||
        conversations.find((c) => c.otherUserName === u.name) ||
        null;
      return { ...u, conv };
    });

  // Total unread DMs (excluding the open conversation — it's being read right now)
  const totalDmUnread = conversations.reduce(
    (sum, c) => (c.id === selectedConversation ? sum : sum + (c.unreadCount || 0)),
    0
  );

  const hideTabs = compact && !!selectedConversation && activeTab === "messages";

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-zinc-950">

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      {!hideTabs && (
        <div className="flex items-center border-b bg-white dark:bg-zinc-950 overflow-x-auto scrollbar-hide shrink-0">
          <TabBtn
            active={activeTab === "messages"}
            onClick={() => setActiveTab("messages")}
            icon={<MessageCircle size={16} />}
            label="Messages"
            badge={totalDmUnread}
          />
          <TabBtn
            active={activeTab === "global"}
            onClick={openGlobalChat}
            icon={<Globe size={16} />}
            label="Global"
            badge={globalUnread}
          />
          <TabBtn
            active={activeTab === "broadcast"}
            onClick={() => setActiveTab("broadcast")}
            icon={<Megaphone size={16} />}
            label={compact ? undefined : "Broadcasts"}
          />
          <TabBtn
            active={activeTab === "starred"}
            onClick={() => setActiveTab("starred")}
            icon={<Star size={16} />}
            label={compact ? undefined : "Starred"}
          />
        </div>
      )}

      {/* ── Messages tab ─────────────────────────────────────────── */}
      {activeTab === "messages" && (
        <>
          {/* DASHBOARD: side-by-side */}
          {!compact && (
            <div className="flex-1 min-h-0 overflow-hidden flex">
              {/* Left: user list */}
              <div className="w-72 shrink-0 border-r flex flex-col min-h-0">
                <div className="p-3 border-b shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search people..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-full border pl-9 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition"
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {loading ? (
                    <SkeletonList count={4} />
                  ) : filteredUsers.length === 0 ? (
                    <EmptyState search={search} />
                  ) : (
                    filteredUsers.map((user) => (
                      <UserCard
                        key={user.id}
                        user={user}
                        isOnline={onlineUsers.includes(user.id)}
                        isSelected={user.conv?.id === selectedConversation}
                        unreadCount={user.conv?.unreadCount ?? 0}
                        lastMessage={user.conv?.lastMessage ?? ""}
                        onClick={() => startChat(user.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Right: conversation or placeholder */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {selectedConversation ? (
                  <ConversationPage
                    key={selectedConversation}
                    conversationId={selectedConversation}
                    onClose={() => setSelectedConversation(null)}
                    compact={false}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 select-none gap-3">
                    <MessageCircle size={64} strokeWidth={1} className="text-zinc-200 dark:text-zinc-700" />
                    <div className="text-center">
                      <h2 className="text-lg font-semibold text-zinc-500">Select a conversation</h2>
                      <p className="text-sm mt-1">Choose someone from the left to start chatting.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COMPACT: stacked */}
          {compact && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {selectedConversation ? (
                <ConversationPage
                  key={selectedConversation}
                  conversationId={selectedConversation}
                  onClose={() => {
                    setSelectedConversation(null);
                    loadConversations();
                  }}
                  compact={true}
                />
              ) : (
                <>
                  <div className="p-2.5 border-b shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-full border pl-9 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {loading ? (
                      <SkeletonList count={3} compact />
                    ) : filteredUsers.length === 0 ? (
                      <EmptyState search={search} />
                    ) : (
                      filteredUsers.map((user) => (
                        <UserCard
                          key={user.id}
                          user={user}
                          isOnline={onlineUsers.includes(user.id)}
                          isSelected={user.conv?.id === selectedConversation}
                          unreadCount={user.conv?.unreadCount ?? 0}
                          lastMessage={user.conv?.lastMessage ?? ""}
                          onClick={() => startChat(user.id)}
                          compact
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "global" && currentUserId !== null && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <GlobalChatWindow currentUserId={currentUserId} currentUserName={currentUserName} />
        </div>
      )}

      {activeTab === "broadcast" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <BroadcastPanel userRole={currentUserRole} />
        </div>
      )}

      {activeTab === "starred" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <StarredMessages />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
  badge = 0,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-white"
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
      {badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function UserCard({
  user,
  isOnline,
  isSelected,
  unreadCount,
  lastMessage,
  onClick,
  compact = false,
}: {
  user: { id: number; name: string; username: string; role: string };
  isOnline: boolean;
  isSelected: boolean;
  unreadCount: number;
  lastMessage: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left flex items-center gap-3
        border-b border-zinc-100 dark:border-zinc-800
        transition-colors duration-100
        ${compact ? "px-3 py-3" : "px-4 py-3.5"}
        ${isSelected
          ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-600"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
        }
      `}
    >
      {/* Avatar + online dot */}
      <div className="relative shrink-0">
        <div
          className={`rounded-full bg-blue-600 text-white flex items-center justify-center font-bold select-none ${
            compact ? "w-10 h-10 text-sm" : "w-11 h-11 text-base"
          }`}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        {/* Always render dot: green = online, grey = offline */}
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-zinc-950 transition-colors ${
            isOnline ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"
          } ${compact ? "w-2.5 h-2.5" : "w-3 h-3"}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm text-zinc-900 dark:text-white truncate ${
              unreadCount > 0 ? "font-bold" : "font-semibold"
            }`}
          >
            {user.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isOnline && (
              <span className="text-[10px] font-medium text-green-500">Online</span>
            )}
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>

        {compact ? (
          <div className="text-xs text-zinc-400 truncate">
            {lastMessage || `@${user.username} · ${user.role}`}
          </div>
        ) : (
          <>
            <div className="text-xs text-zinc-400 truncate">
              {lastMessage || `@${user.username}`}
            </div>
            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 capitalize">
              {user.role}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

function SkeletonList({ count, compact = false }: { count: number; compact?: boolean }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 animate-pulse border-b border-zinc-100 dark:border-zinc-800 ${
            compact ? "px-3 py-3" : "px-4 py-3.5"
          }`}
        >
          <div className={`rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0 ${compact ? "w-10 h-10" : "w-11 h-11"}`} />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
            <div className="h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="py-12 text-center text-zinc-400 text-sm">
      {search ? `No results for "${search}"` : "No users available"}
    </div>
  );
}