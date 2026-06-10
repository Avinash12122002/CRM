import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

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

    if (payload.role !== "meeting") {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();

    const today = new Date().toISOString().split("T")[0];

    const todayMeetingSlots =
      await db.collection("meetingSlots").countDocuments({
        meetingUserId: payload.id,
        meetingDate: today,
        status: "scheduled",
      });

    const completedMeetings =
      await db.collection("meetingSlots").countDocuments({
        meetingUserId: payload.id,
        status: "completed",
      });

    const cancelledMeetings =
      await db.collection("meetingSlots").countDocuments({
        meetingUserId: payload.id,
        status: "cancelled",
      });

    return NextResponse.json({
      todayMeetingSlots,
      completedMeetings,
      cancelledMeetings,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Server Error",
      },
      { status: 500 }
    );
  }
}