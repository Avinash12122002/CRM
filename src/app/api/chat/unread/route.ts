import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(
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

    const { db } =
      await connectToDatabase();

    const conversations =
      await db
        .collection("conversations")
        .find({
          participants: payload.id,
        })
        .project({ id: 1 })
        .toArray();

    const conversationIds =
      conversations.map(
        (c: any) => c.id,
      );

    const unreadCount =
      await db
        .collection("messages")
        .countDocuments({
          conversationId: {
            $in: conversationIds,
          },

          senderId: {
            $ne: payload.id,
          },

          isRead: false,
        });

    return NextResponse.json({
      unreadCount,
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