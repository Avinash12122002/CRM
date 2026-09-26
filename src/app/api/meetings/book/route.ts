import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getNextId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { logUserAction } from "@/lib/activity/audit";

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
      role: { $in: ["meeting", "wm"] },
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

    const cleanPhone = lead.phone ? String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "") : "";

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

      phone: cleanPhone,
      candidatePhone: cleanPhone,

      status: "scheduled",

      createdAt: now,
      updatedAt: now,
    };

    await db.collection("meetingSlots").insertOne(slot);

    // Send automated WhatsApp confirmation to candidate
    if (cleanPhone && cleanPhone.length >= 8) {
      try {
        const { sendTextMessage } = await import("@/lib/whatsapp/client");
        const { format12hTime } = await import("@/lib/whatsapp/timezone");
        const { getStaticGoogleMeetLink } = await import("@/lib/whatsapp/stateMachine");
        const meetLink = getStaticGoogleMeetLink();
        const dateObj = new Date(`${meetingDate}T12:00:00+05:30`);
        const formattedDate = new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(dateObj);
        const time12h = `${format12hTime(startTime)} - ${format12hTime(endTime)} IST`;

        const confirmMsg =
          `Dear ${lead.name || "Candidate"},\n\n` +
          `Thank you for showing your interest in the *Australia Subclass 482 Work Visa*.\n\n` +
          `We are pleased to invite you to a *Google Meet session* to discuss the visa process, eligibility, requirements, and further details.\n\n` +
          `📅 *Date:* ${formattedDate}\n` +
          `⏰ *Time:* ${time12h}\n` +
          `💻 *Google Meet:* ${meetLink}\n\n` +
          `Please make sure to *join the meeting on time*.\n\n` +
          `*Best regards,*\n` +
          `*TMS Visa*`;

        await sendTextMessage(cleanPhone, confirmMsg);

        await db.collection("whatsapp_sessions").updateOne(
          { phone: cleanPhone },
          {
            $set: {
              currentStep: "BOOKED",
              meetingStatus: "booked",
              bookedSlot: {
                date: meetingDate,
                candidateTime: startTime,
                candidateTimeLabel: time12h,
                istTime: startTime,
                istTimeLabel: time12h,
                meetingUserId,
                meetingUserName: meetingUser.name,
              },
              updatedAt: now,
            },
          }
        );
      } catch (waErr) {
        console.warn("Could not dispatch WhatsApp confirmation on book:", waErr);
      }
    }

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

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: lead.meetingDetails ? "reschedule_meeting" : "book_meeting",
      entityType: "meeting",
      entityId: leadId,
      summary: `Booked meeting for lead "${lead.name || `#${leadId}`}" with ${meetingUser.name} on ${meetingDate} at ${startTime}`,
      metadata: { leadId, meetingDate, startTime, meetingUserId, meetingUserName: meetingUser.name },
    });

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
