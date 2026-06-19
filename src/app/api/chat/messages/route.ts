import { NextRequest, NextResponse } from "next/server";
import {
  connectToDatabase,
} from "@/lib/mongodb";

import {
  verifyToken,
  getNextId,
} from "@/lib/auth";

export async function POST(
  req: NextRequest,
) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token = matches
      ? matches[2]
      : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body =
      await req.json();

const {
  conversationId,
  message,
  type,
  fileId,
  fileName,
} = body;

    const { db } =
      await connectToDatabase();

    const id =
      await getNextId(
        db,
        "messages",
      );

   const newMessage = {
  id,

  conversationId,

  senderId: payload.id,

  senderName: payload.name,

  type: type || "text",

  message: message || "",

  fileId: fileId || null,

  fileName:
    fileName || null,

  isRead: false,

  edited: false,

  deleted: false,

  reactions: [],

  isPinned: false,

  pinnedBy: null,

  pinnedAt: null,

  createdAt: new Date(),
};

    await db
      .collection("messages")
      .insertOne(
        newMessage,
      );

    await db
      .collection(
        "conversations",
      )
      .updateOne(
        {
          id:
            conversationId,
        },
        {
          $set: {
            lastMessage:
              message,

            lastMessageAt:
              new Date(),

            updatedAt:
              new Date(),
          },
        },
      );

    return NextResponse.json({
      message:
        "Message sent",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message:
          "Server Error",
      },
      {
        status: 500,
      },
    );
  }
}