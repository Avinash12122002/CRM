import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
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

    const { leadId, meetingDate, startTime, meetingUserId } = await req.json();

    if (!leadId || !meetingDate || !startTime || !meetingUserId) {
      return NextResponse.json(
        {
          message:
            "leadId, meetingDate, startTime and meetingUserId are required",
        },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().split("T")[0];

    if (meetingDate < today) {
      return NextResponse.json(
        {
          message: "Cannot schedule meeting in the past",
        },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({
      id: leadId,
    });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (payload.role !== "admin" && lead.assignedTo !== payload.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const meetingUser = await db.collection("users").findOne({
      id: meetingUserId,
      role: "meeting",
    });

    if (!meetingUser) {
      return NextResponse.json(
        { message: "Meeting user not found" },
        { status: 404 },
      );
    }

    const slotExists = await db.collection("meetingSlots").findOne({
      meetingUserId,
      meetingDate,
      startTime,
      status: "scheduled",
      leadId: { $ne: leadId },
    });

    if (slotExists) {
      return NextResponse.json(
        {
          message: "Selected slot is already booked",
        },
        { status: 400 },
      );
    }

    const [hour, minute] = startTime.split(":");

    const endDate = new Date();

    endDate.setHours(Number(hour), Number(minute) + 30, 0, 0);

    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(
      endDate.getMinutes(),
    ).padStart(2, "0")}`;

    const now = new Date();

    await db.collection("meetingSlots").deleteMany({
      leadId,
    });

    await db.collection("meetingSlots").insertOne({
      leadId,

      meetingUserId,
      meetingUserName: meetingUser.name,

      meetingDate,
      startTime,
      endTime,

      bookedBy: payload.id,
      bookedByName: payload.name,

      status: "scheduled",

      createdAt: now,
      updatedAt: now,
    });

    const oldMeeting = lead.meetingDetails || null;

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          status: "meeting-scheduled",

          meetingStatus: "scheduled",

          assignedTo: meetingUserId,
          assignedToName: meetingUser.name,
          assignedToRole: "meeting",

          assignedBy: payload.id,
          assignedByName: payload.name,
          assignedByRole: payload.role,

          meetingCompletedAt: null,
          meetingCancelledAt: null,

          meetingDetails: {
            meetingUserId,
            meetingUserName: meetingUser.name,

            meetingDate,
            startTime,
            endTime,

            status: "scheduled",
          },

          updatedAt: now,
        },

        $addToSet: {
          participants: {
            $each: [payload.id, meetingUserId, lead.assignedTo].filter(Boolean),
          },
        },

        $push: {
          history: {
            action: "meeting_rescheduled",

            performedBy: payload.id,
            performedByName: payload.name,
            performedByRole: payload.role,

            timestamp: now,

            meetingDate,
            startTime,

            previousAssignee: lead.assignedTo || null,
            previousAssigneeName: lead.assignedToName || null,
            previousAssigneeRole: lead.assignedToRole || null,

            newAssignee: meetingUserId,
            newAssigneeName: meetingUser.name,
            newAssigneeRole: "meeting",

            details: oldMeeting
              ? `Meeting reassigned from ${oldMeeting.meetingUserName || "Meeting User"} (${oldMeeting.meetingDate} ${oldMeeting.startTime}) to ${meetingUser.name} (${meetingDate} ${startTime})`
              : `Meeting scheduled for ${meetingDate} ${startTime}`,
          },
        },
      },
    );

    return NextResponse.json({
      message: "Meeting rescheduled successfully",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Server Error",
      },
      { status: 500 },
    );
  }
}
