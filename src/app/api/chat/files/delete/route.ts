import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const query =
      new URL(req.url).searchParams.get("q") || "";

    const { db } =
      await connectToDatabase();

    const users = await db
      .collection("users")
      .find({
        $or: [
          {
            name: {
              $regex: query,
              $options: "i",
            },
          },
          {
            username: {
              $regex: query,
              $options: "i",
            },
          },
        ],
      })
      .project({
        _id: 0,
        id: 1,
        name: 1,
        username: 1,
      })
      .limit(10)
      .toArray();

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

    const messages = await db
      .collection("messages")
      .find({
        conversationId: {
          $in: conversationIds,
        },

        message: {
          $regex: query,
          $options: "i",
        },
      })
      .limit(20)
      .toArray();

    return NextResponse.json({
      users,
      messages,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Server Error",
      },
      {
        status: 500,
      }
    );
  }
}