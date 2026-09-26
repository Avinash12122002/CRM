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
    `Hello ${candidateName}! 👋\n\n` +
    `Thank you for attending your 1-on-1 Australian Visa consultation with our senior expert! 🇦🇺\n\n` +
    `✅ *Status: Consultation Completed*\n` +
    `📋 *Next Steps:*\n` +
    `• Our compliance team is preparing your profile evaluation & agreement.\n` +
    `• Official documents will be sent to your registered email shortly.\n\n` +
    `If you have any questions about your Subclass 482 visa pathway, feel free to reply right here! ✈️`;

  try {
    await sendTextMessage(cleanPhone, messageText);
  } catch (err) {
    console.warn(`[WhatsApp] Failed to dispatch meeting completed message to +${cleanPhone}:`, err);
  }

  // Sync whatsapp_sessions record so Aria / AI knows consultation is completed
  try {
    const now = new Date();
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          meetingStatus: "completed",
          meetingCompleted: true,
          meetingCompletedAt: now,
          currentStep: "MEETING_COMPLETED",
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
 * Kept strictly under 500 characters, polished and complete without truncation.
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

  const candidateName = lead.name && !lead.name.toLowerCase().includes("test") ? lead.name : "there";

  const messageText =
    `Hello ${candidateName}! 👋\n\n` +
    `Your 1-on-1 Australian Visa consultation has been cancelled. ℹ️\n\n` +
    `Please reschedule your session for an upcoming weekend (Saturdays & Sundays, 01:00 PM – 09:00 PM IST) so our team can evaluate your Australia Subclass 482 visa file!\n\n` +
    `👉 Tap below to choose an available time slot:`;

  try {
    const btnRes = await sendQuickReplyButtons(cleanPhone, messageText, [
      { id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" },
    ]);
    if (!btnRes.success) {
      await sendTextMessage(cleanPhone, messageText);
    }
  } catch (err) {
    console.warn(`[WhatsApp] Failed to dispatch meeting cancelled message to +${cleanPhone}:`, err);
  }

  // Sync whatsapp_sessions record so Aria / AI knows consultation is cancelled
  try {
    const now = new Date();
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          meetingStatus: "canceled",
          meetingCanceledAt: now,
          bookedSlot: null,
          currentStep: "AWAITING_REENGAGEMENT",
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
}
