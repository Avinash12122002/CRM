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

    const nowIST = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      }),
    );

    const today =
      nowIST.getFullYear() +
      "-" +
      String(nowIST.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(nowIST.getDate()).padStart(2, "0");

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
        meetingUserId: { $in: [meetingUserId, String(meetingUserId)] },
        meetingDate,
        status: {
          $in: ["scheduled", "completed"],
        },
      })
      .project({
        _id: 0,
        startTime: 1,
        endTime: 1,
      })
      .toArray();

    const slots = [];

    let hour = 10;
    let minute = 0;

    while (hour < 20 || (hour === 20 && minute === 0)) {
      const startTime = `${String(hour).padStart(
        2,
        "0",
      )}:${String(minute).padStart(2, "0")}`;

      const slotEndMinute = minute + 30;
      const slotEndHour = hour + Math.floor(slotEndMinute / 60);
      const slotEndMinNorm = slotEndMinute % 60;
      const endTime = `${String(slotEndHour).padStart(2, "0")}:${String(
        slotEndMinNorm,
      ).padStart(2, "0")}`;

      const isOverlapping = bookedSlots.some((b) => {
        const bStart = b.startTime;
        const bEnd = b.endTime || b.startTime;
        return startTime < bEnd && endTime > bStart;
      });

      const now = new Date();

      const slotDateTime = new Date(`${meetingDate}T${startTime}:00+05:30`);

      const isPastSlot = slotDateTime <= now;
      slots.push({
        startTime,
        available: !isOverlapping && !isPastSlot,
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
