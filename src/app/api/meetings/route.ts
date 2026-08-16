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

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {
      meetingDetails: { $exists: true, $ne: null },
    };

    const uid = payload.id;
    const uidStr = String(uid);
    const uidNum = isNaN(Number(uid)) ? null : Number(uid);
    const matchUserIds = Array.from(new Set([uid, uidStr, uidNum].filter((x) => x != null)));

    if (payload.role === "meeting" || payload.role === "wm") {
      filter["$or"] = [
        { "meetingDetails.meetingUserId": { $in: matchUserIds } },
        { assignedTo: { $in: matchUserIds } },
      ];
    } else if (payload.role === "telecaller" || payload.role === "employee" || payload.role === "wtc" || payload.role === "supervisor") {
      filter["$or"] = [
        { assignedTo: { $in: matchUserIds } },
        { "meetingDetails.bookedBy": { $in: matchUserIds } },
      ];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadsMain: any[] = await db.collection("leads").find(filter).toArray();

    const allMeetings = leadsMain.sort((a, b) => {
      const dateA = a.meetingDetails?.meetingDate || "";
      const dateB = b.meetingDetails?.meetingDate || "";
      const dateCmp = dateB.localeCompare(dateA);
      if (dateCmp !== 0) return dateCmp;

      const timeA = a.meetingDetails?.startTime || "";
      const timeB = b.meetingDetails?.startTime || "";
      return timeB.localeCompare(timeA);
    });

    const total = allMeetings.length;
    const isCompleted = (l: any) =>
      l.meetingStatus === "completed" || l.meetingDetails?.status === "completed" || l.status === "sales";
    const isCancelled = (l: any) =>
      l.meetingStatus === "cancelled" || l.meetingDetails?.status === "cancelled";
    const isScheduled = (l: any) =>
      !isCompleted(l) &&
      !isCancelled(l) &&
      (l.meetingStatus === "scheduled" || l.status === "meeting-scheduled" || l.meetingDetails?.status === "scheduled");

    const completed = allMeetings.filter(isCompleted).length;
    const cancelled = allMeetings.filter(isCancelled).length;
    const scheduled = allMeetings.filter(isScheduled).length;

    const totalPages = Math.ceil(total / limit) || 0;
    const startIndex = (page - 1) * limit;
    const paginatedMeetings = allMeetings.slice(startIndex, startIndex + limit).map((l) => ({
      id: l.id,
      name: l.name || "—",
      phone: l.phone || "—",
      status: l.status || "—",
      meetingStatus: l.meetingStatus || (l.status === "sales" ? "completed" : "scheduled"),
      meetingDetails: l.meetingDetails,
    }));

    return NextResponse.json({
      meetings: paginatedMeetings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: { total, scheduled, completed, cancelled },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Server Error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}