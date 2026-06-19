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
      announcementId,
    } = body;

    const { db } =
      await connectToDatabase();

    const announcement =
      await db
        .collection(
          "announcements",
        )
        .findOne({
          id:
            announcementId,
        });

    if (!announcement) {
      return NextResponse.json(
        {
          message:
            "Announcement not found",
        },
        {
          status: 404,
        },
      );
    }

    const alreadyRead =
      (
        announcement.readBy ||
        []
      ).some(
        (r: any) =>
          r.userId ===
          payload.id,
      );

    if (!alreadyRead) {
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
            $push: {
              readBy: {
                userId:
                  payload.id,

                userName:
                  payload.name,

                readAt:
                  new Date(),
              },
            },
          },
        );
    }

    return NextResponse.json({
      message:
        "Announcement marked as read",
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