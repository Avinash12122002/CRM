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

    if (payload.role !== "meeting") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const uid = payload.id;
    const uidStr = String(uid);
    const uidNum = isNaN(Number(uid)) ? null : Number(uid);
    const matchUserIds = Array.from(new Set([uid, uidStr, uidNum].filter((x) => x != null)));

    // Fetch leads assigned to, booked by, conducted by, or converted by this meeting user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLeads: any[] = await db
      .collection("leads")
      .find({
        $or: [
          { "meetingDetails.meetingUserId": { $in: matchUserIds } },
          { "meetingDetails.bookedBy": { $in: matchUserIds } },
          { assignedTo: { $in: matchUserIds } },
          { "salesDocument.uploadedBy": { $in: matchUserIds } },
          { history: { $elemMatch: { action: "status_updated", newStatus: "sales", performedBy: { $in: matchUserIds } } } },
        ],
      })
      .toArray();

    // Today's scheduled meetings
    const todayMeetingSlots = allLeads.filter((l) => {
      const isToday = l.meetingDetails?.meetingDate === todayStr;
      const isScheduled =
        l.meetingStatus === "scheduled" ||
        (!l.meetingStatus && l.status !== "sales" && l.status !== "lost");
      return isToday && isScheduled;
    }).length;

    // Completed meetings
    const completedMeetings = allLeads.filter(
      (l) => l.meetingStatus === "completed" || l.status === "sales"
    ).length;

    // Cancelled meetings
    const cancelledMeetings = allLeads.filter(
      (l) => l.meetingStatus === "cancelled"
    ).length;

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