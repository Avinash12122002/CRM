import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
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

    const { db } = await connectToDatabase();

    const activity = await db.collection("activities").findOne({
      userId: payload.id,
      checkOut: null,
    });

    if (!activity) {
      return NextResponse.json(
        { message: "No active session found" },
        { status: 400 }
      );
    }

    if (activity.status === "break") {
      return NextResponse.json(
        { message: "Already on break" },
        { status: 400 }
      );
    }

    const now = new Date();

    let workSeconds = activity.workSeconds || 0;

    if (activity.status === "working") {
      workSeconds += Math.floor(
        (now.getTime() - new Date(activity.checkIn).getTime()) / 1000
      );
    }

    await db.collection("activities").updateOne(
      { _id: activity._id },
      {
        $set: {
          status: "break",
          breakStart: now,
          workSeconds,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({
      message: "Break started",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
  }
}