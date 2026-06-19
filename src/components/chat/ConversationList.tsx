"use client";

import { useRouter } from "next/navigation";

type Props = {
  conversations: any[];
};

export default function ConversationList({
  conversations,
}: Props) {
  const router =
    useRouter();

  return (
    <div className="space-y-2">
      {conversations.map(
        (conversation) => (
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
              border
              rounded-lg
              p-3
              cursor-pointer
              hover:bg-zinc-100
              dark:hover:bg-zinc-800
            "
          >
            <div className="font-semibold">
              {
                conversation.otherUserName
              }
            </div>

            <div className="text-xs opacity-70">
              {
                conversation.otherUserRole
              }
            </div>

            <div className="text-sm mt-1 truncate">
              {
                conversation.lastMessage
              }
            </div>

            {conversation.unreadCount >
              0 && (
              <span
                className="
                  inline-block
                  mt-2
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
        ),
      )}
    </div>
  );
}