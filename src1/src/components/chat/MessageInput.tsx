"use client";

import { useState } from "react";

type Props = {
  onSend: (
    message: string,
  ) => void;
};

export default function MessageInput({
  onSend,
}: Props) {
  const [message, setMessage] =
    useState("");

  const send = () => {
    if (!message.trim())
      return;

    onSend(message);

    setMessage("");
  };

  return (
    <div
      className="
        flex
        gap-2
        border-t
        p-4
      "
    >
      <input
        value={message}
        onChange={(e) =>
          setMessage(
            e.target.value,
          )
        }
        placeholder="Type message..."
        className="
          flex-1
          border
          rounded-lg
          px-4
          py-2
        "
        onKeyDown={(e) => {
          if (
            e.key === "Enter"
          ) {
            send();
          }
        }}
      />

      <button
        onClick={send}
        className="
          px-5
          bg-blue-600
          text-white
          rounded-lg
        "
      >
        Send
      </button>
    </div>
  );
}