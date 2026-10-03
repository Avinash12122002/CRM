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

    const numLeadId = Number(leadId);
    const leadIdFilter = isNaN(numLeadId) ? { id: leadId } : { $or: [{ id: numLeadId }, { id: String(leadId) }] };

    let collectionName = "leads";
    let lead = await db.collection("leads").findOne(leadIdFilter);

    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne(leadIdFilter);
      if (lead) {
        collectionName = "triloknath_leads";
      }
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (
      lead.meetingStatus === "completed" ||
      lead.meetingDetails?.status === "completed" ||
      lead.status === "follow-up" ||
      lead.meetingCompletedAt
    ) {
      return NextResponse.json(
        { message: "This meeting has already been completed and cannot be rescheduled." },
        { status: 400 }
      );
    }

    const isOwner = String(lead.assignedTo) === String(payload.id);
    const isMeetingUser = String(lead.meetingDetails?.meetingUserId) === String(payload.id);
    const isBooker = String(lead.meetingDetails?.bookedBy) === String(payload.id);
    const isVisible = Array.isArray(lead.visibleTo) && lead.visibleTo.some((v: unknown) => String(v) === String(payload.id));

    if (payload.role !== "admin" && !isOwner && !isMeetingUser && !isBooker && !isVisible) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const numMeetingUserId = Number(meetingUserId);
    const meetingUserMatchIds = [meetingUserId, String(meetingUserId), numMeetingUserId].filter(
      (x) => x !== undefined && x !== null && !isNaN(Number(x))
    );

    const meetingUser = await db.collection("users").findOne({
      id: { $in: meetingUserMatchIds },
      role: { $in: ["meeting", "wm"] },
    });

    if (!meetingUser) {
      return NextResponse.json(
        { message: "Meeting user not found" },
        { status: 404 },
      );
    }

    const [hour, minute] = startTime.split(":");

    const endDate = new Date();

    endDate.setHours(Number(hour), Number(minute) + 30, 0, 0);

    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(
      endDate.getMinutes(),
    ).padStart(2, "0")}`;

    const slotExists = await db.collection("meetingSlots").findOne({
      meetingUserId: { $in: meetingUserMatchIds },
      meetingDate,
      status: "scheduled",
      leadId: { $nin: [lead.id, String(lead.id)] },
      $or: [
        { startTime },
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime },
        },
      ],
    });

    if (slotExists) {
      return NextResponse.json(
        {
          message: "Selected slot is already booked",
        },
        { status: 400 },
      );
    }

    const isIreland = lead.interestedCountry === "Ireland";

    const now = new Date();

    await db.collection("meetingSlots").deleteMany({
      $or: [{ leadId: lead.id }, { leadId: String(lead.id) }],
      ...(isIreland ? { channel: "WhatsApp Ireland" } : { channel: { $ne: "WhatsApp Ireland" } }),
    });

    const cleanPhone = lead.phone ? String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "") : "";

    // Detect candidate timezone and calculate localized timing
    const {
      format12hTime,
      detectCountryFromPhone,
      convertIstSlotToCandidateTime,
      extractShortTimezone,
    } = isIreland
      ? await import("@/lib/whatsapp-ireland/timezone")
      : await import("@/lib/whatsapp/timezone");

    const countryInfo = cleanPhone ? detectCountryFromPhone(cleanPhone) : null;
    const tzShort = countryInfo ? extractShortTimezone(countryInfo.label) : "IST";
    const candStart = countryInfo
      ? convertIstSlotToCandidateTime(meetingDate, startTime, countryInfo.timeZone)
      : null;
    const candEnd = countryInfo
      ? convertIstSlotToCandidateTime(meetingDate, endTime, countryInfo.timeZone)
      : null;

    const ist12hRange = `${format12hTime(startTime)} - ${format12hTime(endTime)} IST`;
    const timeDisplay =
      countryInfo && countryInfo.countryCode !== "IN" && candStart && candEnd
        ? `${candStart.display12h} - ${candEnd.display12h} (${tzShort})`
        : ist12hRange;

    await db.collection("meetingSlots").insertOne({
      leadId,

      meetingUserId,
      meetingUserName: meetingUser.name,

      meetingDate,
      startTime,
      endTime,

      candidateLocalTime: candStart?.candidateTime || startTime,
      candidateLocalEndTime: candEnd?.candidateTime || endTime,
      candidateTimezone: tzShort,
      candidateDisplayLabel: timeDisplay,

      channel: isIreland ? "WhatsApp Ireland" : "WhatsApp",

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
        const dateObj = new Date(`${meetingDate}T12:00:00+05:30`);
        const formattedDate = new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(dateObj);

        const safeCandidateName = (lead.name && lead.name !== "at" && lead.name.trim().length > 2 && !lead.name.toLowerCase().includes("test")) ? lead.name.trim() : "Candidate";

        if (isIreland) {
          const { sendTextMessage } = await import("@/lib/whatsapp-ireland/client");
          const { getStaticGoogleMeetLink } = await import("@/lib/whatsapp-ireland/stateMachine");
          const { logWhatsAppIrelandMessage } = await import("@/lib/whatsapp-ireland/messageLogger");
          const meetLink = getStaticGoogleMeetLink();

          const reschedMsg =
            `Dear ${safeCandidateName},\n\n` +
            `Your *Ireland Employer Sponsored Work Visa* consultation has been **successfully rescheduled**! ✅\n\n` +
            `📅 *New Date:* ${formattedDate}\n` +
            `⏰ *New Time:* ${timeDisplay}\n` +
            `💻 *Google Meet:* ${meetLink}\n\n` +
            `Please make sure to *join the meeting on time*.\n\n` +
            `*Best regards,*\n` +
            `*TMS Visa (Ireland Team) 🇮🇪*`;

          await sendTextMessage(cleanPhone, reschedMsg, { skipLog: true });

          try {
            await logWhatsAppIrelandMessage({
              db,
              phone: cleanPhone,
              sender: "bot",
              senderName: "TMS Visa (Ireland)",
              text: reschedMsg,
              createdAt: now,
            });
          } catch (logErr) {
            console.warn("Could not log Ireland meeting reschedule WhatsApp message:", logErr);
          }

          const last10 = cleanPhone.slice(-10);
          const waPhoneFilter = {
            $or: [
              { phone: cleanPhone },
              { phone: `+${cleanPhone}` },
              ...(last10.length === 10 ? [{ phone: { $regex: `${last10}$` } }] : []),
            ],
          };

          await db.collection("whatsapp_ireland_sessions").updateOne(
            waPhoneFilter,
            {
              $set: {
                currentStep: "BOOKED",
                meetingStatus: "rescheduled",
                crmStatus: "meeting-scheduled",
                nextFollowupAt: null,
                bookedSlot: {
                  date: meetingDate,
                  candidateTime: candStart?.candidateTime || startTime,
                  candidateTimeLabel: timeDisplay,
                  istTime: startTime,
                  istTimeLabel: ist12hRange,
                  meetingUserId,
                  meetingUserName: meetingUser.name,
                },
                updatedAt: now,
              },
            }
          );
        } else {
          const { sendTextMessage } = await import("@/lib/whatsapp/client");
          const { getStaticGoogleMeetLink } = await import("@/lib/whatsapp/stateMachine");
          const meetLink = getStaticGoogleMeetLink();

          const reschedMsg =
            `Dear ${safeCandidateName},\n\n` +
            `Your *Australia Employer Sponsored Work Visa* consultation has been **successfully rescheduled**! ✅\n\n` +
            `📅 *New Date:* ${formattedDate}\n` +
            `⏰ *New Time:* ${timeDisplay}\n` +
            `💻 *Google Meet:* ${meetLink}\n\n` +
            `Please make sure to *join the meeting on time*.\n\n` +
            `*Best regards,*\n` +
            `*TMS Visa*`;

          await sendTextMessage(cleanPhone, reschedMsg, { skipLog: true });

          try {
            const { logWhatsAppMessage } = await import("@/lib/whatsapp/messageLogger");
            await logWhatsAppMessage({
              db,
              phone: cleanPhone,
              sender: "bot",
              senderName: "TMS Visa",
              text: reschedMsg,
              createdAt: now,
            });
          } catch (logErr) {
            console.warn("Could not log meeting reschedule WhatsApp message:", logErr);
          }

          const last10 = cleanPhone.slice(-10);
          const waPhoneFilter = {
            $or: [
              { phone: cleanPhone },
              { phone: `+${cleanPhone}` },
              ...(last10.length === 10 ? [{ phone: { $regex: `${last10}$` } }] : []),
            ],
          };

          await db.collection("whatsapp_sessions").updateOne(
            waPhoneFilter,
            {
              $set: {
                currentStep: "BOOKED",
                meetingStatus: "rescheduled",
                crmStatus: "meeting-scheduled",
                nextFollowupAt: null,
                bookedSlot: {
                  date: meetingDate,
                  candidateTime: candStart?.candidateTime || startTime,
                  candidateTimeLabel: timeDisplay,
                  istTime: startTime,
                  istTimeLabel: ist12hRange,
                  meetingUserId,
                  meetingUserName: meetingUser.name,
                },
                updatedAt: now,
              },
            }
          );
        }
      } catch (waErr) {
        console.warn("Could not dispatch WhatsApp confirmation on reschedule:", waErr);
      }
    }

    const oldMeeting = lead.meetingDetails || null;

    await db.collection(collectionName).updateOne(
      { id: lead.id },
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
