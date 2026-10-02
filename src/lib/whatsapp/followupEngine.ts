import { Db } from "mongodb";
import { WhatsAppSession } from "@/lib/whatsapp/types";
import { updateSession, getStaticGoogleMeetLink, sendConsultationBookingPrompt } from "@/lib/whatsapp/stateMachine";
import { sendQuickReplyButtons, sendTextMessage } from "@/lib/whatsapp/client";
import { formatDateInZone, format12hTime, getNext10AmInTimezone } from "@/lib/whatsapp/timezone";
import { STEP_FOLLOWUP_MESSAGES } from "@/lib/whatsapp/followupTemplates";
import { logWhatsAppMessage } from "@/lib/whatsapp/messageLogger";

export interface FollowupRunResult {
  phone: string;
  type: string;
  details?: Record<string, unknown>;
}

/**
 * Core WhatsApp Automated Engine:
 * 1. Executes due 10-Minute Consultation Prompts (clearing consultationPromptDueAt).
 * 2. Runs the 7-Day Follow-Up Sequence (Day 1 to Day 7 distinct messages) across all stages.
 * 3. Sends 1-Hour Pre-Meeting reminders with static Google Meet link and strict 12-hour AM/PM time.
 * All outbound messages are logged to `whatsapp_messages` and `conversationHistory` via `logWhatsAppMessage`.
 */
export async function runWhatsAppFollowupEngine(db: Db): Promise<FollowupRunResult[]> {
  const now = new Date();
  const meetLink = getStaticGoogleMeetLink();
  const results: FollowupRunResult[] = [];

  // =========================================================================
  // 1. Delayed 10-Minute Consultation Prompt (if timer did not fire or serverless froze)
  // =========================================================================
  try {
    const dueConsultationSessions = (await db
      .collection("whatsapp_sessions")
      .find({
        currentStep: { $in: ["AWAITING_CONSULTATION_DECISION", "VIDEO_SENT_AWAITING_INTEREST"] },
        consultationPromptDueAt: { $lte: now },
        bookedSlot: { $in: [null, undefined] },
      })
      .toArray()) as unknown as WhatsAppSession[];

    for (const session of dueConsultationSessions) {
      try {
        await sendConsultationBookingPrompt(session.phone);

        const promptText =
          `*Ready to take the next step towards Australia? 🇦🇺*\n\n` +
          `Book a 1-on-1 consultation meeting with our Australian Visa Expert to check your job eligibility and visa pathway.`;

        await logWhatsAppMessage({
          db,
          phone: session.phone,
          sender: "bot",
          senderName: "Aria (TMS Visa)",
          text: promptText,
          msgType: "interactive_button",
          buttons: [
            { id: "BTN_CONSULT_YES", title: "Book Consultation" },
            { id: "BTN_CONSULT_NO", title: "Maybe Later" },
          ],
          createdAt: now,
        });

        await updateSession(db, session.phone, {
          consultationPromptDueAt: undefined,
          updatedAt: now,
        });

        results.push({ phone: session.phone, type: "consultation_prompt_10min" });
      } catch (promptErr) {
        console.warn(`[WhatsApp Followup Engine] Failed to send 10-min prompt to ${session.phone}:`, promptErr);
      }
    }
  } catch (err) {
    console.error("[WhatsApp Followup Engine] Error checking due consultation prompts:", err);
  }

  // =========================================================================
  // 2. 7-Day Follow-Up Engine (Day 1 to Day 7 distinct messages per step)
  // =========================================================================
  try {
    const activeFollowupSessions = (await db
      .collection("whatsapp_sessions")
      .find({
        currentStep: {
          $in: [
            "WELCOME",
            "AWAITING_EMAIL",
            "VIDEO_SENT_AWAITING_INTEREST",
            "AWAITING_CONSULTATION_DECISION",
            "SELECTING_DAY",
            "SELECTING_SLOT",
            "AWAITING_CV",
            "RESCHEDULING_DATE",
            "RESCHEDULING_SLOT",
            "AWAITING_REENGAGEMENT",
          ],
        },
        nextFollowupAt: { $lte: now },
        followupCount: { $lt: 7 }, // Stops strictly after 7 days
      })
      .toArray()) as unknown as WhatsAppSession[];

    for (const session of activeFollowupSessions) {
      // If candidate already has an active booked slot and is NOT in AWAITING_CV, skip reminders
      if (session.bookedSlot && session.currentStep !== "AWAITING_CV") {
        continue;
      }

      const currentCount = session.followupCount || 0;
      const targetDay = currentCount + 1; // 1 to 7

      if (targetDay > 7) {
        // Capped after 7 days -> mark cold and do not message further
        await updateSession(db, session.phone, {
          currentStep: "COLD",
          followupCount: 7,
          updatedAt: now,
        });
        continue;
      }

      // Map session step to template key
      let templateKey = "STEP_1_WELCOME";
      if (session.currentStep === "AWAITING_EMAIL") {
        templateKey = "STEP_2_EMAIL";
      } else if (
        session.currentStep === "AWAITING_CONSULTATION_DECISION" ||
        session.currentStep === "VIDEO_SENT_AWAITING_INTEREST"
      ) {
        templateKey = "STEP_3_CONSULTATION";
      } else if (session.currentStep === "SELECTING_DAY") {
        templateKey = "STEP_4_DATE";
      } else if (session.currentStep === "SELECTING_SLOT") {
        templateKey = "STEP_4_SLOT";
      } else if (session.currentStep === "AWAITING_CV") {
        templateKey = "STEP_6_CV";
      } else if (
        session.currentStep === "RESCHEDULING_DATE" ||
        session.currentStep === "RESCHEDULING_SLOT" ||
        (session.currentStep === "AWAITING_REENGAGEMENT" && session.meetingStatus === "canceled")
      ) {
        templateKey = "STEP_7_RESCHEDULE";
      }

      const templates = STEP_FOLLOWUP_MESSAGES[templateKey] || STEP_FOLLOWUP_MESSAGES["STEP_1_WELCOME"];
      const dayTemplate = templates.find((t) => t.day === targetDay) || templates[templates.length - 1];

      try {
        let sentMessageId: string | undefined;

        if (dayTemplate.buttons && dayTemplate.buttons.length > 0) {
          const btnRes = await sendQuickReplyButtons(session.phone, dayTemplate.message, dayTemplate.buttons, { skipLog: true });
          if (btnRes.success) {
            sentMessageId = btnRes.messageId;
          } else {
            const fallbackTextRes = await sendTextMessage(session.phone, dayTemplate.message, { skipLog: true });
            sentMessageId = fallbackTextRes.messageId;
          }
        } else {
          const textRes = await sendTextMessage(session.phone, dayTemplate.message, { skipLog: true });
          sentMessageId = textRes.messageId;
        }

        // Log message to unified chat
        await logWhatsAppMessage({
          db,
          phone: session.phone,
          sender: "bot",
          senderName: "Aria (TMS Visa)",
          text: dayTemplate.message,
          msgType: dayTemplate.buttons && dayTemplate.buttons.length > 0 ? "interactive_button" : "text",
          buttons: dayTemplate.buttons,
          messageId: sentMessageId,
          createdAt: now,
        });

        // Schedule next reminder for 10 AM tomorrow in candidate's LOCAL timezone
        const isFinalDay = targetDay >= 7;
        const nextFollowup = isFinalDay
          ? undefined
          : getNext10AmInTimezone(session.timeZone || "Asia/Kolkata");

        await updateSession(db, session.phone, {
          followupCount: targetDay,
          lastFollowupSentAt: now,
          nextFollowupAt: nextFollowup,
          ...(isFinalDay ? { currentStep: "COLD" } : {}),
        });

        results.push({
          phone: session.phone,
          type: "7_day_followup",
          details: {
            step: session.currentStep,
            templateKey,
            day: targetDay,
          },
        });
      } catch (sendErr) {
        console.warn(`[WhatsApp Followup Engine] Follow-up failed for +${session.phone} (Day ${targetDay}):`, sendErr);
      }
    }
  } catch (err) {
    console.error("[WhatsApp Followup Engine] Error running 7-day followups:", err);
  }

  // =========================================================================
  // 3. 1-Hour Pre-Meeting Reminder (Strict 12-Hour AM/PM format)
  // =========================================================================
  try {
    const todayISO = formatDateInZone(now, "Asia/Kolkata");
    const upcomingSlots = await db
      .collection("meetingSlots")
      .find({
        meetingDate: todayISO,
        status: "scheduled",
        reminderSent: { $ne: true },
      })
      .toArray();

    for (const slot of upcomingSlots) {
      if (!slot.startTime || !slot.phone) continue;
      const slotTimeIST = new Date(`${slot.meetingDate}T${slot.startTime}:00+05:30`);
      const diffMinutes = (slotTimeIST.getTime() - now.getTime()) / (1000 * 60);

      // Within 1 hour (between 0 and 65 minutes away)
      if (diffMinutes > 0 && diffMinutes <= 65) {
        const ist12h = format12hTime(slot.startTime);
        const candTime12h = slot.candidateLocalTime ? format12hTime(slot.candidateLocalTime) : ist12h;

        const isIndia =
          slot.candidateTimezone === "IST" ||
          String(slot.phone).replace(/\D/g, "").startsWith("91");
        const timeLine = isIndia
          ? `⏰ *Time:* ${ist12h} IST\n\n`
          : `⏰ *Time:* ${candTime12h} (${slot.candidateTimezone || "Local"})\n\n`;

        const reminderMsg =
          `⏰ *Reminder: Your Australian Visa Consultation is in 1 Hour!*\n\n` +
          `📅 *Date:* ${slot.meetingDate}\n` +
          timeLine +
          `🔗 *Google Meet Link:*\n${meetLink}\n\n` +
          `Our Australian visa specialist is ready to evaluate your Australia Employer Sponsored Work Visa file. Please tap the link to join on time! 🇦🇺`;

        const sendRes = await sendTextMessage(slot.phone, reminderMsg, { skipLog: true });

        await logWhatsAppMessage({
          db,
          phone: slot.phone,
          sender: "bot",
          senderName: "Aria (TMS Visa)",
          text: reminderMsg,
          msgType: "text",
          messageId: sendRes.messageId,
          createdAt: now,
        });

        await db.collection("meetingSlots").updateOne(
          { _id: slot._id },
          { $set: { reminderSent: true, reminderSentAt: now } }
        );

        results.push({ phone: slot.phone, type: "1_hour_meeting_reminder" });
      }
    }
  } catch (err) {
    console.error("[WhatsApp Followup Engine] Error checking meeting reminders:", err);
  }

  return results;
}
