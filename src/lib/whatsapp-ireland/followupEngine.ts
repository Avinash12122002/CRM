import { Db } from "mongodb";
import { WhatsAppSession } from "./types";
import { updateSession, getStaticGoogleMeetLink, sendConsultationBookingPrompt } from "./stateMachine";
import { sendQuickReplyButtons, sendTextMessage } from "./client";
import { formatDateInZone, format12hTime, getNext10AmInTimezone } from "./timezone";
import { STEP_FOLLOWUP_MESSAGES } from "./followupTemplates";
import { logWhatsAppIrelandMessage } from "./messageLogger";

export interface FollowupRunResult {
  phone: string;
  type: string;
  details?: Record<string, unknown>;
}

export const EXCLUDED_CRM_FOLLOWUP_STATUSES = [
  "meeting-scheduled",
  "follow-up",
  "sales",
  "payment-pending",
  "document-pending",
  "call-back",
];

/**
 * Core Ireland WhatsApp Automated Engine:
 * 1. Executes due 10-Minute Consultation Prompts.
 * 2. Runs the 7-Day Follow-Up Sequence across all steps for Ireland.
 * 3. Sends 1-Hour Pre-Meeting reminders for Ireland consultations.
 */
export async function runWhatsAppIrelandFollowupEngine(db: Db): Promise<FollowupRunResult[]> {
  const now = new Date();
  const meetLink = getStaticGoogleMeetLink();
  const results: FollowupRunResult[] = [];

  // 1. Delayed 10-Minute Consultation Prompt
  try {
    const dueConsultationSessions = (await db
      .collection("whatsapp_ireland_sessions")
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
          `*Ready to take the next step towards Ireland? 🇮🇪*\n\n` +
          `Book a 1-on-1 consultation meeting with our Ireland Visa Expert to check your job eligibility and visa pathway.`;

        await logWhatsAppIrelandMessage({
          db,
          phone: session.phone,
          sender: "bot",
          senderName: "Pearl (TMS Visa)",
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

        results.push({ phone: session.phone, type: "ireland_consultation_prompt_10min" });
      } catch (promptErr) {
        console.warn(`[WhatsApp Ireland Followup Engine] Failed 10-min prompt for ${session.phone}:`, promptErr);
      }
    }
  } catch (err) {
    console.error("[WhatsApp Ireland Followup Engine] Error checking consultation prompts:", err);
  }

  // 2. 7-Day Follow-Up Engine
  try {
    const activeFollowupSessions = (await db
      .collection("whatsapp_ireland_sessions")
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
        followupCount: { $lt: 7 },
      })
      .toArray()) as unknown as WhatsAppSession[];

    for (const session of activeFollowupSessions) {
      try {
        // 1. Strict CRM Status Check: Do NOT send 7-day automated follow-ups to candidates already in CRM pipeline:
        // (meeting-scheduled, follow-up, sales, payment-pending, document-pending, call-back)
        const cleanPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");
        const last10 = cleanPhone.slice(-10);
        const leadPhoneQueries: any[] = [
          { phone: cleanPhone },
          { phone: `+${cleanPhone}` },
        ];
        if (cleanPhone.length >= 8 && !isNaN(Number(cleanPhone))) {
          leadPhoneQueries.push({ phone: Number(cleanPhone) });
        }
        if (last10.length === 10) {
          leadPhoneQueries.push(
            { phone: last10 },
            { phone: `+91${last10}` },
            { phone: { $regex: `${last10}$` } }
          );
          if (!isNaN(Number(last10))) {
            leadPhoneQueries.push({ phone: Number(last10) });
          }
        }

        const lead = session.leadId
          ? await db.collection("leads").findOne({ id: session.leadId })
          : await db.collection("leads").findOne({ $or: leadPhoneQueries });

        const hasSharedCv = Boolean(
          session.cvReceivedAt ||
          session.hasUploadedCv ||
          session.cvFileUrl ||
          lead?.hasCv ||
          lead?.salesDocument ||
          (Array.isArray(lead?.cvFiles) && lead.cvFiles.length > 0)
        );

        // If candidate has already shared their CV, immediately stop CV reminders
        if (session.currentStep === "AWAITING_CV" && hasSharedCv) {
          await updateSession(db, session.phone, {
            currentStep: "MEETING_COMPLETED",
            nextFollowupAt: null as any,
            updatedAt: now,
          });
          continue;
        }

        const isAwaitingCvFollowup = session.currentStep === "AWAITING_CV" && !hasSharedCv;
        const isRescheduleFollowup =
          session.currentStep === "RESCHEDULING_DATE" ||
          session.currentStep === "RESCHEDULING_SLOT" ||
          (session.currentStep === "AWAITING_REENGAGEMENT" && session.meetingStatus === "canceled");

        const effectiveCrmStatus = (lead?.status || session.crmStatus || "").toLowerCase().trim();
        if (effectiveCrmStatus && EXCLUDED_CRM_FOLLOWUP_STATUSES.includes(effectiveCrmStatus)) {
          if (!isAwaitingCvFollowup && !isRescheduleFollowup) {
            // Candidate is actively in CRM pipeline - cancel 7-day automated WhatsApp follow-ups
            await updateSession(db, session.phone, {
              nextFollowupAt: null as any,
              crmStatus: lead?.status || session.crmStatus,
              updatedAt: now,
            });
            continue;
          }
        }

        const nextDay = (session.followupCount || 0) + 1;
        if (nextDay > 7) {
          await updateSession(db, session.phone, {
            ...(session.currentStep !== "AWAITING_CV" ? { currentStep: "COLD" } : {}),
            followupCount: 7,
            nextFollowupAt: null as any,
            updatedAt: now,
          });
          continue;
        }
        let stepKey = "STEP_1_WELCOME";

        if (session.currentStep === "AWAITING_EMAIL") {
          stepKey = "STEP_2_EMAIL";
        } else if (
          session.currentStep === "VIDEO_SENT_AWAITING_INTEREST" ||
          session.currentStep === "AWAITING_CONSULTATION_DECISION"
        ) {
          stepKey = "STEP_3_CONSULTATION";
        } else if (session.currentStep === "SELECTING_DAY") {
          stepKey = "STEP_4_DATE";
        } else if (session.currentStep === "SELECTING_SLOT") {
          stepKey = "STEP_4_SLOT";
        } else if (session.currentStep === "AWAITING_CV") {
          stepKey = "STEP_6_CV";
        } else if (
          session.currentStep === "RESCHEDULING_DATE" ||
          session.currentStep === "RESCHEDULING_SLOT" ||
          (session.currentStep === "AWAITING_REENGAGEMENT" && session.meetingStatus === "canceled")
        ) {
          stepKey = "STEP_7_RESCHEDULE";
        }

        const messagesForStep = STEP_FOLLOWUP_MESSAGES[stepKey] || STEP_FOLLOWUP_MESSAGES.STEP_1_WELCOME;
        const followupItem = messagesForStep.find((m) => m.day === nextDay) || messagesForStep[0];

        if (followupItem) {
          if (followupItem.buttons && followupItem.buttons.length > 0) {
            await sendQuickReplyButtons(session.phone, followupItem.message, followupItem.buttons, { skipLog: true });
          } else {
            await sendTextMessage(session.phone, followupItem.message, { skipLog: true });
          }

          await logWhatsAppIrelandMessage({
            db,
            phone: session.phone,
            sender: "bot",
            senderName: "Aria (TMS Visa - Ireland)",
            text: followupItem.message,
            msgType: followupItem.buttons ? "interactive_button" : "text",
            buttons: followupItem.buttons,
            createdAt: now,
          });

          await updateSession(db, session.phone, {
            followupCount: nextDay,
            lastFollowupSentAt: now,
            nextFollowupAt: nextDay >= 7 ? undefined : getNext10AmInTimezone(session.timeZone),
            updatedAt: now,
          });

          results.push({
            phone: session.phone,
            type: `ireland_followup_day_${nextDay}`,
            details: { stepKey },
          });
        }
      } catch (itemErr) {
        console.warn(`[WhatsApp Ireland Followup Engine] Item error for ${session.phone}:`, itemErr);
      }
    }
  } catch (err) {
    console.error("[WhatsApp Ireland Followup Engine] Error checking active followups:", err);
  }

  // 3. 1-Hour Pre-Meeting Reminder
  try {
    const todayIST = formatDateInZone(now, "Asia/Kolkata");
    const currentHourIST = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        hour12: false,
      }).format(now),
      10
    );

    const bookedSessions = (await db
      .collection("whatsapp_ireland_sessions")
      .find({
        meetingStatus: { $in: ["booked", "rescheduled"] },
        "bookedSlot.date": todayIST,
      })
      .toArray()) as unknown as WhatsAppSession[];

    for (const session of bookedSessions) {
      if (!session.bookedSlot?.istTime || !session.bookedSlot?.date) continue;
      const slotTimeIST = new Date(`${session.bookedSlot.date}T${session.bookedSlot.istTime}:00+05:30`);
      const diffMinutes = (slotTimeIST.getTime() - now.getTime()) / (1000 * 60);

      // Check if slot starts within 1 hour (between 0 and 65 minutes away)
      if (diffMinutes > 0 && diffMinutes <= 65) {
        const reminderSentKey = `reminder_sent_${todayIST}_${session.bookedSlot.istTime}`;
        if ((session as any)[reminderSentKey]) continue;

        const candTimeDisplay = format12hTime(session.bookedSlot.candidateTime);
        const rawTz = session.timeZoneLabel || "";
        const cleanTz = rawTz.replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
        const candTzSuffix = cleanTz ? ` (${cleanTz})` : "";
        const reminderText =
          `⏰ *Reminder: Your Ireland Visa Consultation is in 1 Hour!*\n\n` +
          `📅 *Date:* ${session.bookedSlot.date}\n` +
          `⏰ *Time:* ${candTimeDisplay}${candTzSuffix}\n\n` +
          `🔗 *Google Meet Link:*\n${meetLink}\n\n` +
          `Our Ireland visa specialist is ready to evaluate your Ireland Employer Sponsored Work Visa file. Please tap the link to join on time! 🇮🇪`;

        await sendTextMessage(session.phone, reminderText, { skipLog: true });

        await logWhatsAppIrelandMessage({
          db,
          phone: session.phone,
          sender: "bot",
          senderName: "Pearl (TMS Visa)",
          text: reminderText,
          msgType: "text",
          createdAt: now,
        });

        await db.collection("whatsapp_ireland_sessions").updateOne(
          { phone: session.phone },
          {
            $set: {
              [reminderSentKey]: true,
              updatedAt: now,
            },
          }
        );

        results.push({ phone: session.phone, type: "ireland_pre_meeting_reminder_1hr" });
      }
    }
  } catch (err) {
    console.error("[WhatsApp Ireland Followup Engine] Error checking pre-meeting reminders:", err);
  }

  return results;
}
