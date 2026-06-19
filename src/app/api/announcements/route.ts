import { NextRequest, NextResponse } from "next/server";
import {
  connectToDatabase,
} from "@/lib/mongodb";

import {
  verifyToken,
  getNextId,
} from "@/lib/auth";

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

    const announcements =
      await db
        .collection(
          "announcements",
        )
        .find({})
        .sort({
          createdAt: -1,
        })
        .toArray();

    return NextResponse.json({
      announcements,
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

    if (
      !payload ||
      payload.role !== "admin"
    ) {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 },
      );
    }

    const body =
      await req.json();

    const {
      title,
      message,
    } = body;

    const { db } =
      await connectToDatabase();

    const id =
      await getNextId(
        db,
        "announcements",
      );

    await db
      .collection(
        "announcements",
      )
      .insertOne({
        id,

        title,

        message,

        createdBy:
          payload.id,

        createdByName:
          payload.name,

        isPinned: false,

        pinnedAt: null,

        readBy: [],

        createdAt:
          new Date(),
      });

    return NextResponse.json({
      message:
        "Announcement created",
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
