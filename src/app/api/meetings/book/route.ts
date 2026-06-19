import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getNextId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

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

    const body = await req.json();

    const { leadId, meetingUserId, meetingDate, startTime } = body;

    if (!leadId || !meetingUserId || !meetingDate || !startTime) {
      return NextResponse.json(
        {
          message:
            "leadId, meetingUserId, meetingDate and startTime are required",
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

    const lead = await db.collection("leads").findOne({
      id: leadId,
    });

    if (!lead) {
      return NextResponse.json(
        {
          message: "Lead not found",
        },
        {
          status: 404,
        },
      );
    }

    const meetingUser = await db.collection("users").findOne({
      id: meetingUserId,
      role: "meeting",
    });

    if (!meetingUser) {
      return NextResponse.json(
        {
          message: "Meeting user not found",
        },
        {
          status: 404,
        },
      );
    }

    const existingSlot = await db.collection("meetingSlots").findOne({
  meetingUserId,
  meetingDate,
  startTime,
  status: "scheduled",
  leadId: { $ne: leadId },
});

    if (existingSlot) {
      return NextResponse.json(
        {
          message: "This slot is already booked",
        },
        {
          status: 400,
        },
      );
    }

    await db.collection("meetingSlots").deleteMany({
      leadId,
    });

    const slotId = await getNextId(db, "meetingSlots");

    const now = new Date();

    const [hours, minutes] = startTime.split(":");

    const endDate = new Date();

    endDate.setHours(Number(hours), Number(minutes) + 30, 0, 0);

    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(
      endDate.getMinutes(),
    ).padStart(2, "0")}`;

    const slot = {
      id: slotId,

      leadId,

      meetingUserId,
      meetingUserName: meetingUser.name,

      bookedBy: lead.meetingDetails?.bookedBy || payload.id,
      bookedByName: lead.meetingDetails?.bookedByName || payload.name,

      meetingDate,

      startTime,
      endTime,

      status: "scheduled",

      createdAt: now,
      updatedAt: now,
    };

    await db.collection("meetingSlots").insertOne(slot);

   await db.collection("leads").updateOne(
  {
    id: leadId,
  },
  {
    $set: {
      status: "meeting-scheduled",
      meetingStatus: "scheduled",

      // Assignment Info
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
        bookedBy: lead.meetingDetails?.bookedBy || payload.id,
        bookedByName: lead.meetingDetails?.bookedByName || payload.name,

        meetingDate,

        startTime,
        endTime,

        status: "scheduled",
      },

      updatedAt: now,
    },

    $push: {
      history: {
        action: lead.meetingDetails
  ? "meeting_rescheduled"
  : "meeting_booked",
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

        details: lead.meetingDetails
  ? `Meeting reassigned to ${meetingUser.name} on ${meetingDate} at ${startTime}`
  : `Meeting booked and assigned to ${meetingUser.name} on ${meetingDate} at ${startTime}`,
      },
    },

    $addToSet: {
      participants: {
        $each: [
          payload.id,
          meetingUserId,
          lead.assignedTo,
        ].filter(Boolean),
      },
    },
  },
);

    return NextResponse.json({
      message: "Meeting booked successfully",
      slot,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Server Error",
      },
      {
        status: 500,
      },
    );
  }
}
