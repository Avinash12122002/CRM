import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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

    const { db } = await connectToDatabase();

    const activeActivity = await db.collection("activities").findOne({
      userId: payload.id,
      checkOut: null,
    });

    if (!activeActivity) {
      return NextResponse.json({
        isCheckedIn: false,
        activity: null,
      });
    }

    const now = new Date();

    let workSeconds = activeActivity.workSeconds || 0;
    let breakSeconds = activeActivity.breakSeconds || 0;
    let trainingSeconds = activeActivity.trainingSeconds || 0;

    // Running Work Time
    if (activeActivity.status === "working") {
      workSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() -
            new Date(activeActivity.checkIn).getTime()) /
            1000
        )
      );
    }

    // Running Break Time
    if (
      activeActivity.status === "break" &&
      activeActivity.breakStart
    ) {
      breakSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() -
            new Date(activeActivity.breakStart).getTime()) /
            1000
        )
      );
    }

    // Running Training Time
    if (
      activeActivity.status === "training" &&
      activeActivity.trainingStart
    ) {
      trainingSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() -
            new Date(activeActivity.trainingStart).getTime()) /
            1000
        )
      );
    }

    return NextResponse.json({
      isCheckedIn: true,

      activity: {
        id: activeActivity.id,

        userId: activeActivity.userId,

        firstCheckIn:
          activeActivity.firstCheckIn ||
          activeActivity.checkIn,

        checkIn: activeActivity.checkIn,

        checkOut: activeActivity.checkOut,

        lastCheckOut:
          activeActivity.lastCheckOut || null,

        status:
          activeActivity.status || "working",

        workSeconds,

        breakSeconds,

        trainingSeconds,

        breakStart:
          activeActivity.breakStart || null,

        trainingStart:
          activeActivity.trainingStart || null,

        sessions:
          activeActivity.sessions || 1,

        date: activeActivity.date,
      },
    });
  } catch (err) {
    console.error(err);

    const errorMessage =
      err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}