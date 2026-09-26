import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { WhatsAppSession } from "@/lib/whatsapp/types";
import { updateSession, getStaticGoogleMeetLink } from "@/lib/whatsapp/stateMachine";
import { sendQuickReplyButtons, sendTextMessage } from "@/lib/whatsapp/client";
import { formatDateInZone } from "@/lib/whatsapp/timezone";

/**
 * GET /api/whatsapp/cron/followups
 * Runs automated background tasks:
 * 1. 6-Day Re-engagement cycle (Day 2, Day 4, Day 6) for candidates who said "No" or went silent.
 * 2. Post-Meeting Payment follow-ups (every 2 days) for completed consultations awaiting payment.
 * 3. 1-Hour Pre-Meeting reminders with static Google Meet link.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided =
      req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { db } = await connectToDatabase();
    const now = new Date();
    const meetLink = getStaticGoogleMeetLink();
    const results: Array<Record<string, unknown>> = [];

    // =========================================================================
    // 1. Re-engagement Loop (Every 2 days for 6 days -> max 3 reminders)
    // =========================================================================
    const reengagementSessions = (await db
      .collection("whatsapp_sessions")
      .find({
        currentStep: {
          $in: [
            "AWAITING_REENGAGEMENT",
            "VIDEO_SENT_AWAITING_INTEREST",
            "AWAITING_EMAIL",
            "SELECTING_DAY",
            "SELECTING_SLOT",
          ],
        },
        nextFollowupAt: { $lte: now },
        followupCount: { $lt: 3 }, // Day 2, Day 4, Day 6
      })
      .toArray()) as unknown as WhatsAppSession[];

    for (const session of reengagementSessions) {
      const currentCount = session.followupCount || 0;
      const nextCount = currentCount + 1;

      if (nextCount === 1) {
        // Day 2 Reminder
        const isIndia = session.countryCode === "IN";
        const timePrompt = isIndia
          ? `between 01:00 PM and 09:00 PM IST`
          : `in your local time (${session.timeZoneLabel})`;
        const msg =
          `Hi ${session.name || "there"}! 👋 Just checking in to see if you had a chance to review our **Australia Subclass 482 Work Visa** overview.\n\n` +
          `Our senior consultant is conducting free 1-on-1 profile evaluations this weekend ${timePrompt}. Would you like to reserve a 1-hour slot?`;

        await sendQuickReplyButtons(session.phone, msg, [
          { id: "BTN_CONSULT_YES", title: "Book Consultation" },
          { id: "BTN_CONSULT_NO", title: "Not Right Now" },
        ]);

        await updateSession(db, session.phone, {
          followupCount: 1,
          lastFollowupSentAt: now,
          nextFollowupAt: new Date(Date.now() + 48 * 3600 * 1000), // Day 4
        });

        results.push({ phone: session.phone, type: "reengagement_day_2" });
      } else if (nextCount === 2) {
        // Day 4 Reminder
        const msg =
          `Hello ${session.name || "there"}! Australia 482 employer sponsorship slots are filling up for this weekend.\n\n` +
          `If you have 2+ years of work experience and want to assess your visa eligibility, tap below to book:`;

        await sendQuickReplyButtons(session.phone, msg, [
          { id: "BTN_CONSULT_YES", title: "Reserve Slot" },
          { id: "BTN_CONSULT_NO", title: "Maybe Later" },
        ]);

        await updateSession(db, session.phone, {
          followupCount: 2,
          lastFollowupSentAt: now,
          nextFollowupAt: new Date(Date.now() + 48 * 3600 * 1000), // Day 6
        });

        results.push({ phone: session.phone, type: "reengagement_day_4" });
      } else if (nextCount === 3) {
        // Day 6 (Final Reminder)
        const msg =
          `Hello ${session.name || "there"}! This is our final check-in regarding your Australian work visa inquiry with The Migration School 🇦🇺.\n\n` +
          `If you'd like our migration team to evaluate your profile, please book your session today. Otherwise, we will archive your inquiry file.`;

        await sendQuickReplyButtons(session.phone, msg, [
          { id: "BTN_CONSULT_YES", title: "Book Consultation" },
          { id: "BTN_482_NO", title: "Close My File" },
        ]);

        await updateSession(db, session.phone, {
          followupCount: 3,
          lastFollowupSentAt: now,
          currentStep: "COLD",
        });

        results.push({ phone: session.phone, type: "reengagement_day_6_final" });
      }
    }

    // =========================================================================
    // 2. Post-Meeting Payment Follow-up Loop (Every 2 days for unpaid clients)
    // =========================================================================
    // Find leads where meeting completed by Abhay, but payment is pending
    const unpaidLeads = await db
      .collection("leads")
      .find({
        $or: [
          { meetingStatus: "completed", status: { $in: ["follow-up", "payment-pending", "document-pending"] } },
          { status: "payment-pending" },
        ],
      })
      .toArray();

    for (const lead of unpaidLeads) {
      if (!lead.phone) continue;
      const cleanPhone = String(lead.phone).replace(/[^\d]/g, "").replace(/^00/, "");
      const session = (await db.collection("whatsapp_sessions").findOne({ phone: cleanPhone })) as unknown as WhatsAppSession | null;

      if (session) {
        const lastSent = session.lastFollowupSentAt ? new Date(session.lastFollowupSentAt).getTime() : 0;
        const daysSinceLast = (now.getTime() - lastSent) / (1000 * 3600 * 24);

        // Send every 2 days
        if (daysSinceLast >= 2) {
          const paymentMsg =
            `Hello ${lead.name || "there"}! 👋 Hope you had a productive consultation regarding your Australia Subclass 482 Work Visa.\n\n` +
            `This is a gentle reminder regarding your enrollment and onboarding steps to initiate employer nomination matching. If you have questions about the agreement or payment details, simply reply here and our team will assist you! 🇦🇺`;

          await sendTextMessage(cleanPhone, paymentMsg);

          await updateSession(db, cleanPhone, {
            meetingCompleted: true,
            paymentPending: true,
            paymentFollowupCount: (session.paymentFollowupCount || 0) + 1,
            lastFollowupSentAt: now,
          });

          results.push({ phone: cleanPhone, type: "post_meeting_payment_reminder" });
        }
      }
    }

    // =========================================================================
    // 3. 1-Hour Pre-Meeting Reminder
    // =========================================================================
    // Find meetings starting in the next 60 minutes (queried in Indian Standard Time)
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
        const reminderMsg =
          `⏰ **Meeting Reminder: 1 Hour Left!**\n\n` +
          `Hi! Your 1-on-1 Australia 482 Visa consultation starts in 1 hour!\n\n` +
          `⏰ **Your Time:** ${slot.candidateLocalTime || slot.startTime}\n` +
          `🇮🇳 **India Time:** ${slot.startTime} IST\n\n` +
          `🔗 **Join via Google Meet:**\n${meetLink}\n\n` +
          `Please have your resume/CV ready. See you shortly! 🇦🇺`;

        await sendTextMessage(slot.phone, reminderMsg);

        await db.collection("meetingSlots").updateOne(
          { _id: slot._id },
          { $set: { reminderSent: true, reminderSentAt: now } },
        );

        results.push({ phone: slot.phone, type: "1_hour_meeting_reminder" });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[WhatsApp Followup Cron Error]", err);
    return NextResponse.json({ error: "Internal Server Error", details: String(err) }, { status: 500 });
  }
}

export const POST = GET;
