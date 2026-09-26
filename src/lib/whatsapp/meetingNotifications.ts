import { Db } from "mongodb";
import { sendTextMessage, sendQuickReplyButtons } from "./client";

/**
 * Sends an automated WhatsApp confirmation when a consultation meeting is completed.
 * Kept strictly under 500 characters, polished and complete without truncation.
 */
export async function sendMeetingCompletedNotification(params: {
  db: Db;
  lead: {
    id: number | string;
    name?: string;
    phone?: string;
    email?: string;
  };
}): Promise<void> {
  const { db, lead } = params;

  if (!lead.phone) return;

  const cleanPhone = String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "");
  if (cleanPhone.length < 8) return;

  const candidateName = lead.name && !lead.name.toLowerCase().includes("test") ? lead.name : "there";

  const messageText =
    `Thanks for attending the meeting to initiate the process for Australia employer-sponsored work visa! 🇦🇺\n\n` +
    `Please send your CV / Resume here in PDF or Word document format. 📄`;

  try {
    await sendTextMessage(cleanPhone, messageText);
  } catch (err) {
    console.warn(`[WhatsApp] Failed to dispatch meeting completed message to +${cleanPhone}:`, err);
  }

  // Sync whatsapp_sessions record
  try {
    const now = new Date();
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          meetingStatus: "completed",
          meetingCompleted: true,
          meetingCompletedAt: now,
          currentStep: "AWAITING_CV",
          followupCount: 0,
          nextFollowupAt: new Date(Date.now() + 24 * 3600 * 1000),
          updatedAt: now,
        },
        $push: {
          meetingHistory: {
            action: "completed",
            timestamp: now,
            reason: "Consultation marked completed in CRM",
          } as any,
        },
      }
    );
  } catch (dbErr) {
    console.warn(`[WhatsApp] Could not update session status for +${cleanPhone}:`, dbErr);
  }
}

/**
 * Sends an automated WhatsApp confirmation when a consultation meeting is cancelled.
 */
export async function sendMeetingCancelledNotification(params: {
  db: Db;
  lead: {
    id: number | string;
    name?: string;
    phone?: string;
    meetingDetails?: any;
  };
}): Promise<void> {
  const { db, lead } = params;

  if (!lead.phone) return;

  const cleanPhone = String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "");
  if (cleanPhone.length < 8) return;

  const messageText =
    `Unfortunately your consultation meeting could not take place with us today.\n\n` +
    `Please reschedule your meeting with us by choosing an available date below:`;

  try {
    const { getUpcomingWeekendDays } = await import("./slots");
    const { sendInteractiveList } = await import("./client");
    const weekends = getUpcomingWeekendDays(10);
    const isIndia = cleanPhone.startsWith("91");
    const sections = [
      {
        title: "Select Weekend Date",
        rows: weekends.slice(0, 10).map((w) => ({
          id: `DAY_DATE_${w.date}`,
          title: w.displayLabel.slice(0, 24),
          description: isIndia ? `${w.dayName} · 1 PM - 9 PM IST`.slice(0, 72) : `${w.dayName} · Local Time`.slice(0, 72),
        })),
      },
    ];

    const listRes = await sendInteractiveList(
      cleanPhone,
      "Reschedule Consultation",
      messageText,
      "Select Date",
      sections
    );
    if (!listRes.success) {
      const btnRes = await sendQuickReplyButtons(cleanPhone, messageText, [
        { id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" },
      ]);
      if (!btnRes.success) {
        await sendTextMessage(cleanPhone, messageText);
      }
    }
  } catch (err) {
    console.warn(`[WhatsApp] Failed to dispatch meeting cancelled message to +${cleanPhone}:`, err);
  }

  // Sync whatsapp_sessions record so state machine knows to track rescheduling
  try {
    const now = new Date();
    // Find candidate timezone for smart scheduling
    const { getNext10AmInTimezone } = await import("@/lib/whatsapp/timezone");
    const session = await db.collection("whatsapp_sessions").findOne({ phone: cleanPhone });
    const candidateTz = (session?.timeZone as string) || "Asia/Kolkata";

    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          meetingStatus: "canceled",
          meetingCanceledAt: now,
          bookedSlot: null,
          currentStep: "RESCHEDULING_DATE",
          followupCount: 0,
          nextFollowupAt: getNext10AmInTimezone(candidateTz), // 10 AM candidate's local time
          updatedAt: now,
        },
        $push: {
          meetingHistory: {
            action: "canceled",
            timestamp: now,
            reason: "Consultation marked cancelled in CRM",
          } as any,
        },
      }
    );
  } catch (dbErr) {
    console.warn(`[WhatsApp] Could not update session status for +${cleanPhone}:`, dbErr);
  }

  // Update CRM leads collection — mark lead status as "meeting-rescheduled"
  try {
    const now = new Date();
    const lead = await db.collection("leads").findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
      ],
    });
    if (lead) {
      await db.collection("leads").updateOne(
        { id: lead.id },
        {
          $set: {
            status: "meeting-rescheduled",
            meetingStatus: "cancelled",
            meetingCancelledAt: now,
            meetingDetails: null,
            updatedAt: now,
          },
          $push: {
            history: {
              action: "meeting_cancelled_crm",
              performedByName: "WhatsApp Automation",
              timestamp: now,
              details: `Meeting cancelled. Status set to meeting-rescheduled. Reschedule message sent via WhatsApp.`,
            } as any,
          },
        }
      );
    }
  } catch (leadErr) {
    console.warn(`[WhatsApp] Could not update CRM lead status for +${cleanPhone}:`, leadErr);
  }
}

