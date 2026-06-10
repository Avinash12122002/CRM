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

    // Only Meeting users and Admins
    if (
      payload.role !== "meeting" &&
      payload.role !== "admin"
    ) {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();

    const filter =
      payload.role === "admin"
        ? {
            meetingDetails: { $ne: null },
          }
        : {
            "meetingDetails.meetingUserId":
              payload.id,
          };

    const meetings = await db
      .collection("leads")
      .find(filter)
      .project({
        _id: 0,

        id: 1,
        name: 1,
        phone: 1,
        status: 1,

        meetingStatus: 1,
        meetingDetails: 1,

        createdAt: 1,
        updatedAt: 1,
      })
      .sort({
        "meetingDetails.meetingDate": 1,
        "meetingDetails.startTime": 1,
      })
      .toArray();

    return NextResponse.json({
      meetings,
    });
  } catch (err) {
    console.error(err);

    const errorMessage =
      err instanceof Error
        ? err.message
        : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}