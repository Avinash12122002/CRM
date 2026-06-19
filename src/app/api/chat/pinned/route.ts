import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token =
      matches
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

    const body =
      await req.json();

    const {
      messageId,
      isPinned,
    } = body;

    const { db } =
      await connectToDatabase();

    await db
      .collection(
        "messages",
      )
      .updateOne(
        {
          id:
            messageId,
        },
        {
          $set: {
            isPinned,

            pinnedBy:
              isPinned
                ? payload.id
                : null,

            pinnedAt:
              isPinned
                ? new Date()
                : null,
          },
        },
      );

    return NextResponse.json({
      message:
        isPinned
          ? "Message pinned"
          : "Message unpinned",
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

export async function GET(
  req: NextRequest,
) {
  try {
    const conversationId =
      Number(
        new URL(req.url)
          .searchParams.get(
            "conversationId",
          ),
      );

    const { db } =
      await connectToDatabase();

    const messages =
      await db
        .collection(
          "messages",
        )
        .find({
          conversationId,
          isPinned: true,
        })
        .sort({
          pinnedAt: -1,
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