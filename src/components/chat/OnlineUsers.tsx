"use client";

import { useEffect, useState } from "react";

type OnlineUser = {
  userId: number;
  userName: string;
  username: string;
  role: string;
  online: boolean;
  lastSeen: string;
};

export default function OnlineUsers() {
  const [users, setUsers] = useState<
    OnlineUser[]
  >([]);

  useEffect(() => {
    loadUsers();

    const interval =
      setInterval(
        loadUsers,
        10000
      );

    return () =>
      clearInterval(interval);
  }, []);

  const loadUsers =
    async () => {
      try {
        const res =
          await fetch(
            "/api/chat/online-users"
          );

        const data =
          await res.json();

        setUsers(
          data.onlineUsers ||
            []
        );
      } catch {}
    };

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-semibold mb-4">
        Online Users
      </h2>

      <div className="space-y-3">
  {users.map((user) => (
    <div
      key={user.userId}
      className="
        flex
        items-center
        justify-between
        border
        rounded-lg
        p-3
      "
    >
      <div>
        <div className="font-medium">
          🟢 {user.userName}
        </div>

        <div className="text-xs text-zinc-500">
          @{user.username}
        </div>

        <div className="text-xs text-zinc-400">
          {user.role}
        </div>
      </div>

      <div className="text-xs text-green-600 font-medium">
        Online
      </div>
    </div>
  ))}
</div>
    </div>
  );
}