import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

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

    if (payload.role !== "meeting" && payload.role !== "wm") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const uid = payload.id;
    const uidStr = String(uid);
    const uidNum = isNaN(Number(uid)) ? null : Number(uid);
    const matchUserIds = Array.from(new Set([uid, uidStr, uidNum].filter((x) => x != null)));

    // Find only leads that have meeting details, just like /api/meetings
    const filter: Record<string, unknown> = {
      meetingDetails: { $exists: true, $ne: null },
    };

    if (payload.role === "meeting" || payload.role === "wm") {
      filter["$or"] = [
        { "meetingDetails.meetingUserId": { $in: matchUserIds } },
        { assignedTo: { $in: matchUserIds } },
      ];
    } else if (
      payload.role === "telecaller" ||
      payload.role === "employee" ||
      payload.role === "wtc" ||
      payload.role === "supervisor" ||
      payload.role === "follow_up" ||
      payload.role === "trainee"
    ) {
      filter["$or"] = [
        { assignedTo: { $in: matchUserIds } },
        { "meetingDetails.bookedBy": { $in: matchUserIds } },
      ];
    }

    const allLeads = await db.collection("leads").find(filter).toArray();

    const isCompleted = (l: Record<string, unknown>) => {
      const md = l.meetingDetails as Record<string, unknown> | undefined;
      return l.meetingStatus === "completed" || md?.status === "completed" || l.status === "sales";
    };
    const isCancelled = (l: Record<string, unknown>) => {
      const md = l.meetingDetails as Record<string, unknown> | undefined;
      return l.meetingStatus === "cancelled" || md?.status === "cancelled";
    };
    const isScheduled = (l: Record<string, unknown>) => {
      const md = l.meetingDetails as Record<string, unknown> | undefined;
      return (
        !isCompleted(l) &&
        !isCancelled(l) &&
        (l.meetingStatus === "scheduled" || l.status === "meeting-scheduled" || md?.status === "scheduled")
      );
    };

    // Today's scheduled meetings (or total scheduled, depending on what we want, but the UI says "Today's Meetings")
    const todayMeetingSlots = allLeads.filter((l) => {
      const isToday = l.meetingDetails?.meetingDate === todayStr;
      return isToday && isScheduled(l);
    }).length;

    // Completed meetings
    const completedMeetings = allLeads.filter(isCompleted).length;

    // Cancelled meetings
    const cancelledMeetings = allLeads.filter(isCancelled).length;

    return NextResponse.json({
      todayMeetingSlots,
      completedMeetings,
      cancelledMeetings,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 }
    );
  }
}