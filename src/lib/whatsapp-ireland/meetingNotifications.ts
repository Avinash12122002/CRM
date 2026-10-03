import { Db } from "mongodb";
import { sendTextMessage } from "./client";
import { getSafeCandidateDisplayName } from "./stateMachine";

/**
 * Sends an automated WhatsApp confirmation when an Ireland consultation meeting is completed.
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

  const candidateName = getSafeCandidateDisplayName(lead.name);
  const nameSalutation = candidateName ? `Hi ${candidateName}! ` : "";

  const messageText =
    `Thanks for attending the meeting. We hope that you enjoyed the meeting with our expert. Now, our review team will review your CV to match the requirements of Irish Employers! 🇮🇪\n\n` +
    `Please send your CV / Resume here in PDF or Word document format. 📄`;

  try {
    await sendTextMessage(cleanPhone, messageText);
  } catch (err) {
    console.warn(`[WhatsApp Ireland] Failed to dispatch meeting completed message to +${cleanPhone}:`, err);
  }

  // Sync whatsapp_ireland_sessions record
  try {
    const now = new Date();
    const { getNext10AmInTimezone } = await import("./timezone");
    const session = await db.collection("whatsapp_ireland_sessions").findOne({ phone: cleanPhone });
    const candidateTz = (session?.timeZone as string) || "Asia/Kolkata";

    const hasSharedCv = Boolean(
      session?.hasUploadedCv ||
      session?.cvReceivedAt ||
      session?.cvFileUrl ||
      (lead as any)?.hasCv ||
      (lead as any)?.salesDocument ||
      (Array.isArray((lead as any)?.cvFiles) && (lead as any).cvFiles.length > 0)
    );

    const currentStep = hasSharedCv ? "MEETING_COMPLETED" : "AWAITING_CV";
    const nextFollowupAt = hasSharedCv ? undefined : getNext10AmInTimezone(candidateTz);

    await db.collection("whatsapp_ireland_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          crmStatus: "follow-up",
          meetingStatus: "completed",
          meetingCompleted: true,
          meetingCompletedAt: now,
          currentStep,
          followupCount: 0,
          nextFollowupAt,
          updatedAt: now,
        },
        $push: {
          meetingHistory: {
            action: "completed",
            timestamp: now,
            reason: "Ireland consultation marked completed in CRM",
          } as any,
        },
      }
    );
  } catch (dbErr) {
    console.warn(`[WhatsApp Ireland] Could not update session status for +${cleanPhone}:`, dbErr);
  }
}

/**
 * Sends an automated WhatsApp confirmation when an Ireland consultation meeting is cancelled.
 */
export async function sendMeetingCancelledNotification(params: {
  db: Db;
  lead: {
    id: number | string;
    name?: string;
    phone?: string;
  };
}): Promise<void> {
  const { db, lead } = params;

  if (!lead.phone) return;

  const cleanPhone = String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "");
  if (cleanPhone.length < 8) return;

  const messageText =
    `Unfortunately your consultation meeting could not take place today.\n\n` +
    `Please reschedule your consultation with our Ireland expert by choosing an available date below:`;

  try {
    const { getUpcomingWeekdays } = await import("./slots");
    const { sendInteractiveList } = await import("./client");
    const { detectCountryFromPhone, getCandidateConsultationWindow } = await import("./timezone");
    const weekdays = getUpcomingWeekdays(5);
    const countryInfo = detectCountryFromPhone(cleanPhone);
    const candWindow = getCandidateConsultationWindow(countryInfo.timeZone, countryInfo.label);
    const sections = [
      {
        title: "Available Dates",
        rows: weekdays.slice(0, 5).map((w) => ({
          id: `RESCHEDULE_DAY_${w.date}`,
          title: w.displayLabel.slice(0, 24),
          description: `Window: ${candWindow.displayWindow}`.slice(0, 72),
        })),
      },
    ];

    await sendInteractiveList(
      cleanPhone,
      "Reschedule Ireland Consultation",
      messageText,
      "Choose Date 📅",
      sections
    );

    const now = new Date();
    const { getNext10AmInTimezone } = await import("./timezone");
    const session = await db.collection("whatsapp_ireland_sessions").findOne({ phone: cleanPhone });
    const candidateTz = (session?.timeZone as string) || "Asia/Kolkata";

    await db.collection("whatsapp_ireland_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          meetingStatus: "canceled",
          meetingCanceledAt: now,
          crmStatus: "meeting-reschedule",
          bookedSlot: null,
          currentStep: "RESCHEDULING_DATE",
          followupCount: 0,
          nextFollowupAt: getNext10AmInTimezone(candidateTz),
          updatedAt: now,
        },
        $push: {
          meetingHistory: {
            action: "canceled",
            timestamp: now,
            reason: "Consultation cancelled in CRM",
          } as any,
        },
      }
    );

    // Release slot in meetingSlots collection so it is immediately unlocked for others
    await db.collection("meetingSlots").updateMany(
      {
        $or: [
          { phone: cleanPhone },
          { phone: `+${cleanPhone}` },
          ...(lead.id ? [{ leadId: lead.id }, { leadId: String(lead.id) }] : []),
        ],
        channel: "WhatsApp Ireland",
        status: "scheduled",
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: now,
          cancelledReason: "Consultation marked cancelled in CRM",
          updatedAt: now,
        },
      }
    );
  } catch (err) {
    console.warn(`[WhatsApp Ireland] Failed to dispatch meeting cancelled message to +${cleanPhone}:`, err);
  }
}
