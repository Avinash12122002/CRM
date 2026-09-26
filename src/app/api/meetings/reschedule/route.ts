import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
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

    let collectionName = "leads";
    let lead = await db.collection("leads").findOne({
      id: leadId,
    });

    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne({
        id: leadId,
      });
      if (lead) {
        collectionName = "triloknath_leads";
      }
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (payload.role !== "admin" && lead.assignedTo !== payload.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const meetingUser = await db.collection("users").findOne({
      id: meetingUserId,
      role: { $in: ["meeting", "wm"] },
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

    const cleanPhone = lead.phone ? String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "") : "";

    await db.collection("meetingSlots").insertOne({
      leadId,

      meetingUserId,
      meetingUserName: meetingUser.name,

      meetingDate,
      startTime,
      endTime,

      phone: cleanPhone,
      candidatePhone: cleanPhone,

      bookedBy: lead.meetingDetails?.bookedBy || payload.id,
      bookedByName: lead.meetingDetails?.bookedByName || payload.name,

      status: "scheduled",

      createdAt: now,
      updatedAt: now,
    });

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

        const reschedMsg =
          `Dear ${lead.name || "Candidate"},\n\n` +
          `Your *Australia Employer Sponsored Work Visa* consultation has been **successfully rescheduled**! ✅\n\n` +
          `📅 *New Date:* ${formattedDate}\n` +
          `⏰ *New Time:* ${time12h}\n` +
          `💻 *Google Meet:* ${meetLink}\n\n` +
          `Please make sure to *join the meeting on time*.\n\n` +
          `*Best regards,*\n` +
          `*TMS Visa*`;

        await sendTextMessage(cleanPhone, reschedMsg);

        await db.collection("whatsapp_sessions").updateOne(
          { phone: cleanPhone },
          {
            $set: {
              currentStep: "BOOKED",
              meetingStatus: "rescheduled",
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
        console.warn("Could not dispatch WhatsApp confirmation on reschedule:", waErr);
      }
    }

    const oldMeeting = lead.meetingDetails || null;

    await db.collection(collectionName).updateOne(
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

            bookedBy: lead.meetingDetails?.bookedBy || payload.id,
            bookedByName: lead.meetingDetails?.bookedByName || payload.name,

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
            action: oldMeeting
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

            details: oldMeeting
              ? `Meeting reassigned from ${oldMeeting.meetingUserName || "Meeting User"} (${oldMeeting.meetingDate} ${oldMeeting.startTime}) to ${meetingUser.name} (${meetingDate} ${startTime})`
              : `Meeting scheduled for ${meetingDate} ${startTime}`,
          },
        },
      },
    );

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: "reschedule_meeting",
      entityType: "meeting",
      entityId: leadId,
      summary: `Rescheduled meeting for candidate "${lead.name || `#${leadId}`}" with ${meetingUser.name} on ${meetingDate} at ${startTime}`,
      metadata: { leadId, meetingDate, startTime, meetingUserId, meetingUserName: meetingUser.name },
    });

    return NextResponse.json({
      message: oldMeeting
  ? "Meeting rescheduled successfully"
  : "Meeting booked successfully",
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
