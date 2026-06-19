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
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const query =
      new URL(req.url)
        .searchParams.get("q") || "";

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

    const files =
      await db
        .collection(
          "messages",
        )
        .find({
          conversationId: {
            $in: conversationIds,
          },

          type: "file",

          fileName: {
            $regex: query,
            $options: "i",
          },
        })
        .project({
          _id: 0,

          id: 1,

          conversationId: 1,

          senderId: 1,

          senderName: 1,

          fileId: 1,

          fileName: 1,

          createdAt: 1,
        })
        .sort({
          createdAt: -1,
        })
        .limit(50)
        .toArray();

    return NextResponse.json({
      files,
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