"use client";

import { useState } from "react";

type Props = {
  conversationId: number;
};

type Tab = "messages" | "files";

export default function SearchMessages({
  conversationId,
}: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("messages");
  const [messageResults, setMessageResults] = useState<any[]>([]);
  const [fileResults, setFileResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  const runSearch = async () => {
    if (!query.trim()) return;

    try {
      if (tab === "messages") {
        const res = await fetch(
          `/api/chat/search?q=${encodeURIComponent(query)}`
        );

        const data = await res.json();

        // Restrict to this conversation
        const filtered = (data.messages || []).filter(
          (m: any) => m.conversationId === conversationId
        );

        setMessageResults(filtered);
      } else {
        const res = await fetch(
          `/api/chat/files/search?q=${encodeURIComponent(query)}`
        );

        const data = await res.json();

        const filtered = (data.files || []).filter(
          (f: any) => f.conversationId === conversationId
        );

        setFileResults(filtered);
      }

      setSearched(true);
    } catch {}
  };

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    setSearched(false);
  };

  const results =
    tab === "messages" ? messageResults : fileResults;

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => switchTab("messages")}
          className={`
            text-sm
            px-3
            py-1
            rounded-lg
            border
            ${
              tab === "messages"
                ? "bg-blue-600 text-white border-blue-600"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }
          `}
        >
          Messages
        </button>

        <button
          onClick={() => switchTab("files")}
          className={`
            text-sm
            px-3
            py-1
            rounded-lg
            border
            ${
              tab === "files"
                ? "bg-blue-600 text-white border-blue-600"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }
          `}
        >
          Files
        </button>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
          placeholder={
            tab === "messages"
              ? "Search messages..."
              : "Search files by name..."
          }
          className="
            border
            rounded-lg
            px-3
            py-2
            flex-1
          "
        />

        <button
          onClick={runSearch}
          className="
            px-4
            py-2
            rounded-lg
            bg-blue-600
            text-white
          "
        >
          Search
        </button>
      </div>

      {/* Results */}
      <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
        {searched && results.length === 0 && (
          <div className="text-sm text-zinc-400 text-center py-4">
            No results found
          </div>
        )}

        {tab === "messages" &&
          messageResults.map((message) => (
            <div
              key={message.id}
              className="p-2 border rounded-lg"
            >
              <div className="text-xs opacity-60 mb-1">
                {message.senderName} ·{" "}
                {new Date(message.createdAt).toLocaleString()}
              </div>
              <div className="text-sm">{message.message}</div>
            </div>
          ))}

        {tab === "files" &&
          fileResults.map((file) => (
            <a
              key={file.id}
              href={`/api/chat/files/${file.fileId}`}
              target="_blank"
              rel="noreferrer"
              className="
                flex
                items-center
                justify-between
                p-2
                border
                rounded-lg
                hover:bg-zinc-50
                dark:hover:bg-zinc-800
              "
            >
              <div>
                <div className="text-sm font-medium">
                  📎 {file.fileName}
                </div>

                <div className="text-xs opacity-60">
                  {file.senderName} ·{" "}
                  {new Date(file.createdAt).toLocaleString()}
                </div>
              </div>
            </a>
          ))}
      </div>
    </div>
  );
}
