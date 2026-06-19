import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      conversationId: string;
    }>;
  },
) {
  try {
    const params =
      await context.params;

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

    const conversationId =
      parseInt(
        params.conversationId,
      );

    const { db } =
      await connectToDatabase();

    const messages =
      await db
        .collection("messages")
        .find({
          conversationId,
        })
        .sort({
          createdAt: 1,
        })
        .toArray();

    return NextResponse.json({
      messages,
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