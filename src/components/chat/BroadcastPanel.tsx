"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type BroadcastPanelProps = {
  userRole: "admin" | "employee" | "meeting";
};

type Broadcast = {
  id: number;
  senderName: string;
  message: string;
  createdAt: string;
};

export default function BroadcastPanel({userRole,}: BroadcastPanelProps) {
  const [message, setMessage] =
    useState("");

  const [broadcasts, setBroadcasts] =
    useState<Broadcast[]>(
      []
    );

  useEffect(() => {
    loadBroadcasts();
  }, []);

  const loadBroadcasts =
    async () => {
      const res =
        await fetch(
          "/api/chat/broadcast"
        );

      const data =
        await res.json();

      setBroadcasts(
        data.broadcasts ||
          []
      );
    };

  const sendBroadcast =
    async () => {
      if (
        !message.trim()
      )
        return;

      const res =
        await fetch(
          "/api/chat/broadcast",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              {
                message,
              }
            ),
          }
        );

      const data =
        await res.json();

      if (!res.ok) {
        toast.error(
          data.message
        );

        return;
      }

      setMessage("");

      loadBroadcasts();

      toast.success(
        "Broadcast sent"
      );
    };

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-semibold mb-4">
        Broadcasts
      </h2>

      {userRole === "admin" && (
  <div className="flex gap-2 mb-4">
    <input
      value={message}
      onChange={(e) =>
        setMessage(e.target.value)
      }
      className="
        flex-1
        border
        rounded-lg
        px-3
        py-2
      "
    />

    <button
      onClick={sendBroadcast}
      className="
        px-4
        bg-blue-600
        text-white
        rounded-lg
      "
    >
      Send
    </button>
  </div>
)}

      <div className="space-y-2">
        {broadcasts.map(
          (item) => (
            <div
              key={item.id}
              className="
                border
                rounded-lg
                p-3
              "
            >
              <div className="font-medium">
                {
                  item.senderName
                }
              </div>

              <div>
                {
                  item.message
                }
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}