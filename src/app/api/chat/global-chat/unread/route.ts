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

    const { db } =
      await connectToDatabase();

    const readData =
      await db
        .collection(
          "globalChatReads",
        )
        .findOne({
          userId:
            payload.id,
        });

    const lastReadAt =
      readData?.lastReadAt ||
      new Date(0);

    const unreadCount =
      await db
        .collection(
          "globalMessages",
        )
        .countDocuments({
          createdAt: {
            $gt:
              lastReadAt,
          },
          senderId: {
            $ne:
              payload.id,
          },
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

    const { db } =
      await connectToDatabase();

    await db
      .collection(
        "globalChatReads",
      )
      .updateOne(
        {
          userId:
            payload.id,
        },
        {
          $set: {
            lastReadAt:
              new Date(),
          },
        },
        {
          upsert: true,
        },
      );

    return NextResponse.json({
      message:
        "Marked as read",
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