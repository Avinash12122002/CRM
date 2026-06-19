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

    const token = matches
      ? matches[2]
      : null;

    if (!token) {
      return NextResponse.json(
        {
          message: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const payload =
      verifyToken(token);

    if (
      !payload ||
      payload.role !== "admin"
    ) {
      return NextResponse.json(
        {
          message: "Forbidden",
        },
        {
          status: 403,
        },
      );
    }

    const body =
      await req.json();

    const {
      announcementId,
      isPinned,
    } = body;

    const { db } =
      await connectToDatabase();

    await db
      .collection(
        "announcements",
      )
      .updateOne(
        {
          id:
            announcementId,
        },
        {
          $set: {
            isPinned,

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
          ? "Announcement pinned"
          : "Announcement unpinned",
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