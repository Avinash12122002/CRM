import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const meetingUserId = parseInt(searchParams.get("meetingUserId") || "");

    const meetingDate = searchParams.get("meetingDate") || "";

    if (!meetingUserId || !meetingDate) {
      return NextResponse.json(
        {
          message: "meetingUserId and meetingDate are required",
        },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().split("T")[0];

    if (meetingDate < today) {
      return NextResponse.json(
        {
          message: "Cannot book past dates",
        },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const bookedSlots = await db
  .collection("meetingSlots")
  .find({
    meetingUserId,
    meetingDate,
    status: {
      $in: ["scheduled", "completed"],
    },
  })
      .project({
        _id: 0,
        startTime: 1,
      })
      .toArray();

    const bookedTimes = bookedSlots.map((slot) => slot.startTime);

    const slots = [];

    let hour = 10;
    let minute = 0;

    while (hour < 18 || (hour === 18 && minute === 0)) {
      const startTime = `${String(hour).padStart(
        2,
        "0",
      )}:${String(minute).padStart(2, "0")}`;

      const now = new Date();

      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}`;

      const isPastSlot = meetingDate === today && startTime <= currentTime;

      slots.push({
        startTime,
        available: !bookedTimes.includes(startTime) && !isPastSlot,
      });

      minute += 30;

      if (minute >= 60) {
        hour++;
        minute = 0;
      }
    }

    return NextResponse.json({
      meetingUserId,
      meetingDate,
      slots,
    });
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
