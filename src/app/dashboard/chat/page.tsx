"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import GlobalChatWindow from "@/components/chat/GlobalChatWindow";
import StarredMessages from "@/components/chat/StarredMessages";

type User = {
  id: number;
  name: string;
  username: string;
  role: string;
};

type Conversation = {
  id: number;
  participants: number[];
  lastMessage: string;
  updatedAt: string;

  otherUserId: number;
  otherUserName: string;
  otherUserUsername: string;
  otherUserRole: string;

  unreadCount: number;
};

export default function ChatPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] =
    useState<"messages" | "global" | "starred">("messages");

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [onlineUsers, setOnlineUsers] =
    useState<number[]>([]);

  const [currentUserId, setCurrentUserId] =
    useState<number | null>(null);

  const [currentUserName, setCurrentUserName] =
    useState("");

  const [globalUnread, setGlobalUnread] =
    useState(0);

  const [search, setSearch] = useState("");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    loadUsers();
    loadConversations();
    loadOnlineUsers();
    loadCurrentUser();
    loadGlobalUnread();

    const interval = setInterval(() => {
      loadConversations();
      loadOnlineUsers();
      loadGlobalUnread();
    }, 3000);

    return () =>
      clearInterval(interval);
  }, []);

  const loadCurrentUser = async () => {
    try {
      const res =
        await fetch("/api/auth/me");

      const data =
        await res.json();

      setCurrentUserId(data.id);
      setCurrentUserName(data.name);
    } catch {}
  };

  const loadUsers = async () => {
    try {
      const res =
        await fetch("/api/chat/users");

      const data =
        await res.json();

      setUsers(data.users || []);
    } catch {
      toast.error(
        "Failed to load users",
      );
    }
  };

  const loadOnlineUsers =
    async () => {
      try {
        const res =
          await fetch(
            "/api/chat/online-users",
          );

        const data =
          await res.json();

        setOnlineUsers(
          (data.onlineUsers || []).map(
            (user: any) =>
              user.userId,
          ),
        );
      } catch {}
    };

  const loadConversations =
    async () => {
      try {
        const res =
          await fetch(
            "/api/chat/conversations",
          );

        const data =
          await res.json();

        setConversations(
          data.conversations || [],
        );
      } catch {
        toast.error(
          "Failed to load chats",
        );
      } finally {
        setLoading(false);
      }
    };

  const loadGlobalUnread = async () => {
    try {
      const res = await fetch(
        "/api/chat/global-chat/unread",
      );

      const data = await res.json();

      setGlobalUnread(data.unreadCount || 0);
    } catch {}
  };

  const openGlobalChat = () => {
    setActiveTab("global");

    // GlobalChatWindow marks messages as read on mount via
    // /api/chat/global-chat/read, so just reset the badge here.
    setGlobalUnread(0);
  };

  const startChat = async (
    userId: number,
  ) => {
    try {
      const res =
        await fetch(
          "/api/chat/conversations",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              userId,
            }),
          },
        );

      const data =
        await res.json();

      if (!res.ok) {
        toast.error(
          data.message,
        );

        return;
      }

      router.push(
        `/dashboard/chat/${data.conversation.id}`,
      );
    } catch {
      toast.error(
        "Failed to create chat",
      );
    }
  };

  const filteredUsers =
    users.filter(
      (u) =>
        u.id !== currentUserId &&
        (u.name
          .toLowerCase()
          .includes(
            search.toLowerCase(),
          ) ||
          u.username
            .toLowerCase()
            .includes(
              search.toLowerCase(),
            )),
    );

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-white dark:bg-zinc-950 p-6 flex flex-col overflow-hidden"
          : "p-6 flex flex-col h-[calc(100vh-80px)]"
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Chat
        </h1>

        <div className="flex items-center gap-2">
          {activeTab === "messages" && (
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value,
                )
              }
              className="
                border
                rounded-lg
                px-4
                py-2
                w-80
              "
            />
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-sm border rounded-lg px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? "⤓ Exit fullscreen" : "⤢ Fullscreen"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab("messages")}
          className={`
            px-4
            py-2
            text-sm
            font-medium
            border-b-2
            -mb-px
            ${
              activeTab === "messages"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }
          `}
        >
          Direct Messages
        </button>

        <button
          onClick={openGlobalChat}
          className={`
            px-4
            py-2
            text-sm
            font-medium
            border-b-2
            -mb-px
            flex
            items-center
            gap-2
            ${
              activeTab === "global"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }
          `}
        >
          🌐 Global Chat

          {globalUnread > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {globalUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("starred")}
          className={`
            px-4
            py-2
            text-sm
            font-medium
            border-b-2
            -mb-px
            ${
              activeTab === "starred"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }
          `}
        >
          ⭐ Starred
        </button>
      </div>

      {/* Direct messages tab */}
      {activeTab === "messages" && (
        <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden">
          {/* Users */}

          <div className="col-span-4 border rounded-lg p-4 overflow-y-auto">
            <h2 className="font-semibold mb-4">
              Users
            </h2>

            <div className="space-y-2">
              {filteredUsers.map(
                (user) => (
                  <button
                    key={user.id}
                    onClick={() =>
                      startChat(
                        user.id,
                      )
                    }
                    className="
                      w-full
                      text-left
                      p-3
                      rounded-lg
                      border
                      hover:bg-zinc-100
                      dark:hover:bg-zinc-800
                    "
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-medium">
                        {user.name}
                      </div>

                      {onlineUsers.includes(
                        user.id,
                      ) && (
                        <span>
                          🟢
                        </span>
                      )}
                    </div>

                    <div className="text-xs opacity-70">
                      @
                      {
                        user.username
                      }
                    </div>

                    <div className="text-xs">
                      {
                        user.role
                      }
                    </div>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Conversations */}

          <div className="col-span-8 border rounded-lg p-4 overflow-y-auto">
            <h2 className="font-semibold mb-4">
              Recent Chats
            </h2>

            {loading ? (
              <p>
                Loading...
              </p>
            ) : conversations.length ===
              0 ? (
              <p>
                No chats yet
              </p>
            ) : (
              <div className="space-y-3">
                {conversations.map(
                  (
                    conversation,
                  ) => (
                    <div
                      key={
                        conversation.id
                      }
                      onClick={() =>
                        router.push(
                          `/dashboard/chat/${conversation.id}`,
                        )
                      }
                      className="
                        p-4
                        border
                        rounded-lg
                        cursor-pointer
                        hover:bg-zinc-100
                        dark:hover:bg-zinc-800
                      "
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">
                            {
                              conversation.otherUserName
                            }
                          </div>

                          <div className="text-xs text-zinc-500">
                            {
                              conversation.otherUserRole
                            }
                          </div>
                        </div>

                        {conversation.unreadCount >
                          0 && (
                          <span
                            className="
                              bg-red-500
                              text-white
                              text-xs
                              px-2
                              py-1
                              rounded-full
                            "
                          >
                            {
                              conversation.unreadCount
                            }
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-sm text-zinc-500 truncate">
                        {conversation.lastMessage ||
                          "No messages yet"}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global chat tab */}
      {activeTab === "global" && currentUserId !== null && (
        <div className="flex-1 overflow-hidden">
          <GlobalChatWindow
            currentUserId={currentUserId}
            currentUserName={currentUserName}
          />
        </div>
      )}

      {/* Starred tab */}
      {activeTab === "starred" && (
        <div className="flex-1 overflow-y-auto border rounded-lg p-4">
          <StarredMessages />
        </div>
      )}
    </div>
  );
}