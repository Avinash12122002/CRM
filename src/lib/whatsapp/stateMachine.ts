import { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { WhatsAppSession, WhatsAppStep } from "./types";
import { detectCountryFromPhone, convertIstSlotToCandidateTime } from "./timezone";
import { getUpcomingWeekendDays, getAvailableWeekendSlots } from "./slots";
import { generateAiResponse } from "./ai";
import {
  sendTextMessage,
  sendQuickReplyButtons,
  sendVideoMessage,
  sendInteractiveList,
  delay,
} from "./client";

const SESSIONS_COLLECTION = "whatsapp_sessions";

export function getStaticGoogleMeetLink(): string {
  return (
    process.env.GOOGLE_MEET_LINK || ""
  );
}

export function getVideo482Url(): string {
  return process.env.VIDEO_482_URL || "";
}

/**
 * Load or initialize candidate session from MongoDB
 */
export async function getOrCreateSession(
  db: Db,
  phone: string,
  candidateName?: string,
): Promise<WhatsAppSession> {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  const country = detectCountryFromPhone(cleanPhone);
  const now = new Date();

  const existing = (await db
    .collection(SESSIONS_COLLECTION)
    .findOne({ phone: cleanPhone })) as unknown as WhatsAppSession | null;

  if (existing) {
    // Sync live CRM data (like meeting completion or payment status) if leadId exists
    if (existing.leadId) {
      const lead = await db.collection("leads").findOne({ id: existing.leadId });
      if (lead) {
        existing.meetingCompleted = lead.meetingStatus === "completed" || lead.status === "follow-up";
        existing.paymentPending = lead.status === "payment-pending" || lead.status === "document-pending";
      }
    }
    return existing;
  }

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: candidateName || "Candidate",
    countryCode: country.countryCode,
    countryName: country.countryName,
    timeZone: country.timeZone,
    timeZoneLabel: country.label,
    currentStep: "WELCOME",
    followupCount: 0,
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(SESSIONS_COLLECTION).insertOne(newSession as unknown as Record<string, unknown>);
  return newSession;
}

/**
 * Update session fields in MongoDB
 */
export async function updateSession(
  db: Db,
  phone: string,
  updates: Partial<WhatsAppSession>,
) {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  await db.collection(SESSIONS_COLLECTION).updateOne(
    { phone: cleanPhone },
    {
      $set: {
        ...updates,
        updatedAt: new Date(),
      },
    },
  );
}

/**
 * Synchronize or create lead in CRM `leads` collection
 */
async function syncCrmLead(
  db: Db,
  session: WhatsAppSession,
  status: string = "new-lead",
): Promise<number> {
  const now = new Date();
  const phoneQuery = {
    $or: [
      { phone: session.phone },
      { phone: `+${session.phone}` },
      { phone: Number(session.phone) },
    ],
  };

  const existingLead = await db.collection("leads").findOne(phoneQuery);

  if (existingLead) {
    await db.collection("leads").updateOne(
      { id: existingLead.id },
      {
        $set: {
          email: session.email || existingLead.email,
          country: session.countryName,
          interestedCountry: "Australia",
          jobApplied: "Subclass 482 Work Visa",
          leadSource: "WhatsApp Ad Automation",
          updatedAt: now,
        },
      },
    );
    return existingLead.id;
  }

  const id = await getNextId(db, "leads");
  const newLead = {
    id,
    name: session.name || `WhatsApp Candidate (+${session.phone})`,
    phone: `+${session.phone}`,
    email: session.email || "",
    country: session.countryName,
    interestedCountry: "Australia",
    jobApplied: "Subclass 482 Work Visa",
    leadSource: "WhatsApp Ad Automation",
    status,
    isAgent: false,
    callbackDate: null,
    callbackSeen: false,
    assignedTo: null,
    assignedToName: null,
    assignedToRole: null,
    assignedBy: null,
    assignedByName: null,
    meetingDetails: null,
    meetingStatus: null,
    meetingCompletedAt: null,
    meetingCancelledAt: null,
    participants: [],
    visibleTo: [],
    notes: [
      {
        text: `Inbound WhatsApp lead captured from Ad. Location: ${session.countryName} (${session.timeZoneLabel}).`,
        createdAt: now,
        createdBy: "WhatsApp Automation",
      },
    ],
    history: [
      {
        action: "created_via_whatsapp",
        performedByName: "WhatsApp Automation",
        timestamp: now,
        details: `Automated WhatsApp qualification initiated`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("leads").insertOne(newLead);
  return id;
}

/**
 * Dispatches the timed video & process guide sequence with 10-second pauses
 */
export async function sendTimedVideoAndProcessGuide(
  phone: string,
  email: string,
  videoUrl: string,
) {
  // 1. Send the 482 explainer video or streaming watch link immediately if configured
  if (videoUrl) {
    const isWebOrDriveLink =
      videoUrl.includes("drive.google.com") ||
      videoUrl.includes("youtu") ||
      !videoUrl.toLowerCase().endsWith(".mp4");

    if (isWebOrDriveLink) {
      const videoIntro =
        `🎥 **Australia Subclass 482 Work Visa — Process Guide Video** 🇦🇺\n\n` +
        `Here is our video explaining employer sponsorship requirements, eligible occupations, and relocation pathways:\n\n` +
        `▶️ **Watch the Video Here:**\n${videoUrl}\n\n` +
        `*(Tap the link above to watch the video anytime)*`;
      await sendTextMessage(phone, videoIntro);
    } else {
      await sendVideoMessage(
        phone,
        videoUrl,
        "🇦🇺 Australia Subclass 482 Work Visa Process Guide by The Migration School",
      );
    }

    // Wait 10 seconds before sending process guide
    await delay(10000);
  }

  // 3. Send detailed process guide message
  const processGuideText =
    `📋 **The 5-Step Process to Relocate to Australia under Subclass 482:**\n\n` +
    `1️⃣ **Free Profile & CV Evaluation:** Assessing your 2+ years of work experience & English proficiency.\n` +
    `2️⃣ **Skills & Verification:** Verifying work references and trade/educational qualifications.\n` +
    `3️⃣ **Australian Employer Matching:** Connecting your profile with approved Australian sponsoring companies.\n` +
    `4️⃣ **Nomination & Visa Filing:** Formal application lodgement with the Australian Department of Home Affairs.\n` +
    `5️⃣ **Visa Grant & PR Pathway:** Work full-time with your family in Australia, transitioning to Permanent Residency (PR 186) after 2 years! 🇦🇺`;

  await sendTextMessage(phone, processGuideText);

  // 4. Wait another 10 seconds
  await delay(10000);

  // 5. Send consultation offer prompt
  const consultationPrompt =
    `**Would you like to know more about our processes and evaluate your profile live?**\n\n` +
    `Book a free 1-on-1 video consultation with our senior visa expert this weekend! 📅`;

  await sendQuickReplyButtons(phone, consultationPrompt, [
    { id: "BTN_CONSULT_YES", title: "Book Consultation" },
    { id: "BTN_CONSULT_NO", title: "Maybe Later" },
  ]);
}

/**
 * Main incoming message dispatcher and state machine
 */
export async function processIncomingWhatsAppMessage(params: {
  phone: string;
  senderName?: string;
  messageType: "text" | "interactive_button" | "interactive_list";
  textBody?: string;
  selectedId?: string; // Payload ID from button or list row
}): Promise<{ replyText?: string; step: WhatsAppStep }> {
  const { db } = await connectToDatabase();
  const session = await getOrCreateSession(db, params.phone, params.senderName);

  const cleanText = (params.textBody || "").trim();
  const actionId = (params.selectedId || "").trim();
  const meetLink = getStaticGoogleMeetLink();
  const videoUrl = getVideo482Url();

  const lowerText = cleanText.toLowerCase().replace(/[^a-z0-9@. ]/g, "").trim();

  // Greetings check
  const GREETING_WORDS = [
    "hi", "hello", "hey", "start", "restart", "menu", "namaste", "hlo", "hii",
    "good morning", "good evening", "good afternoon"
  ];
  const isGreeting =
    GREETING_WORDS.includes(lowerText) ||
    lowerText.startsWith("hi ") ||
    lowerText.startsWith("hello ");

  // Affirmative check (handles button clicks or typed equivalents like "yes, interested", "sure", "yep")
  const isAffirmative =
    actionId === "BTN_482_YES" ||
    (session.currentStep === "WELCOME" &&
      ["yes", "yep", "yeah", "interested", "sure", "ok", "okay"].some((w) =>
        lowerText === w || lowerText.includes(w)
      ));

  // Negative check (handles button clicks or typed equivalents like "not right now", "no", "maybe later")
  const isNegative =
    actionId === "BTN_482_NO" ||
    actionId === "BTN_CONSULT_NO" ||
    ["no", "not now", "not right now", "not interested", "later", "maybe later"].some((w) =>
      lowerText === w || lowerText.startsWith(w)
    );

  // Email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isDirectEmail = emailRegex.test(cleanText.toLowerCase());

  // 1. Initial State: WELCOME (when starting or saying hi)
  const isFreshWelcome =
    session.currentStep === "WELCOME" &&
    !actionId &&
    !isGreeting &&
    !isAffirmative &&
    !isNegative &&
    !isDirectEmail;

  if (actionId === "RESTART_FLOW" || isGreeting || isFreshWelcome) {
    const welcomeText =
      `Hello ${session.name || "there"}! Welcome to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `We specialize in employer-sponsored work visas for Australia.\n\n` +
      `**Are you interested in the Australia Subclass 482 Work Visa?**`;

    await sendQuickReplyButtons(session.phone, welcomeText, [
      { id: "BTN_482_YES", title: "Yes, Interested" },
      { id: "BTN_482_NO", title: "Not Right Now" },
    ]);

    await updateSession(db, session.phone, { currentStep: "WELCOME" });
    return { replyText: welcomeText, step: "WELCOME" };
  }

  // 2. Candidate said NO at any stage -> Trigger 6-day reminder cycle (every 2 days)
  if (isNegative) {
    const noReply =
      `No problem at all! Feel free to review our updates anytime when you are ready to explore Australian migration with TMS Visa 🇦🇺.\n\n` +
      `We'll keep you posted with relevant visa updates. Have a wonderful day!`;

    // Schedule re-engagement reminder in 2 days (48 hours), initialize followupCount to 0
    const nextFollowup = new Date(Date.now() + 48 * 3600 * 1000);
    await updateSession(db, session.phone, {
      currentStep: "AWAITING_REENGAGEMENT",
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });

    await sendTextMessage(session.phone, noReply);
    return { replyText: noReply, step: "AWAITING_REENGAGEMENT" };
  }

  // 3. Candidate clicked YES to 482 -> Request Email
  if (isAffirmative && !isDirectEmail) {
    const emailPrompt =
      `Great! To register your profile and send you our Subclass 482 sponsorship guide & video, **please reply with your Email Address:**`;

    await updateSession(db, session.phone, { currentStep: "AWAITING_EMAIL" });
    await sendTextMessage(session.phone, emailPrompt);
    return { replyText: emailPrompt, step: "AWAITING_EMAIL" };
  }

  // 4. In AWAITING_EMAIL state (or direct email shared) -> Capture & Validate Email, Trigger Timed Sequence
  if (session.currentStep === "AWAITING_EMAIL" || (isDirectEmail && session.currentStep !== "BOOKED")) {
    const extractedEmail = cleanText.toLowerCase();

    if (!isDirectEmail) {
      const invalidEmailMsg =
        `Please enter a valid email address (e.g. name@gmail.com) so we can proceed with your profile registration.`;
      await sendTextMessage(session.phone, invalidEmailMsg);
      return { replyText: invalidEmailMsg, step: "AWAITING_EMAIL" };
    }

    // Save email & create/update lead in CRM
    const updatedSession = {
      ...session,
      email: extractedEmail,
      currentStep: "VIDEO_SENT_AWAITING_INTEREST" as WhatsAppStep,
      videoSentAt: new Date(),
      nextFollowupAt: new Date(Date.now() + 48 * 3600 * 1000), // First 2-day reminder
      followupCount: 0,
    };
    const leadId = await syncCrmLead(db, updatedSession, "new-lead");
    await updateSession(db, session.phone, {
      email: extractedEmail,
      leadId,
      currentStep: "VIDEO_SENT_AWAITING_INTEREST",
      videoSentAt: new Date(),
      nextFollowupAt: new Date(Date.now() + 48 * 3600 * 1000),
      followupCount: 0,
    });

    // Fire timed sequence (Video -> 10s wait -> Process Info -> 10s wait -> Consultation Prompt)
    // Run asynchronously so webhook acknowledges promptly
    sendTimedVideoAndProcessGuide(session.phone, extractedEmail, videoUrl).catch(console.error);

    return {
      replyText: `Profile registered! Sending 482 video and process information...`,
      step: "VIDEO_SENT_AWAITING_INTEREST",
    };
  }

  // 5. Candidate wants Consultation -> Show Saturday & Sunday Options
  const wantsConsultation =
    actionId === "BTN_CONSULT_YES" ||
    actionId === "BTN_CHANGE_DAY" ||
    (session.currentStep === "VIDEO_SENT_AWAITING_INTEREST" &&
      (["yes", "book", "consult", "consultation", "meeting", "call"].some((w) =>
        lowerText.includes(w)
      )));

  if (wantsConsultation) {
    const weekends = getUpcomingWeekendDays();

    const sections = [
      {
        title: "Select Consultation Day",
        rows: weekends.map((w) => ({
          id: `DAY_SELECT_${w.date}`,
          title: `${w.dayName} Consultation`,
          description: w.displayLabel,
        })),
      },
    ];

    const dayText =
      `Our 1-on-1 consultations with senior visa consultant **Abhay** are held on **Saturdays and Sundays**.\n\n` +
      `All slots are conducted between 11:00 AM and 07:00 PM Indian Time (IST) and will be shown in your local time (**${session.timeZoneLabel}**).\n\n` +
      `Please select which day suits you best:`;

    await sendInteractiveList(
      session.phone,
      "Consultation Booking",
      dayText,
      "Choose Day",
      sections,
    );

    await updateSession(db, session.phone, { currentStep: "SELECTING_DAY" });
    return { replyText: dayText, step: "SELECTING_DAY" };
  }

  // 6. Candidate selected day -> Show available 30-min slots strictly 11am-7pm IST in Candidate Local Time
  if (actionId.startsWith("DAY_SELECT_")) {
    const meetingDate = actionId.replace("DAY_SELECT_", ""); // YYYY-MM-DD
    const slots = await getAvailableWeekendSlots({
      db,
      meetingDate,
      candidateTimeZone: session.timeZone,
      candidateTimeLabel: session.timeZoneLabel,
    });

    // getAvailableWeekendSlots automatically excludes booked slots
    const availableSlots = slots.filter((s) => s.available);

    if (availableSlots.length === 0) {
      const fullText =
        `All consultation slots for that day are currently fully booked! Would you like to check the other weekend day?`;
      await sendQuickReplyButtons(session.phone, fullText, [
        { id: "BTN_CONSULT_YES", title: "Choose Other Day" },
      ]);
      return { replyText: fullText, step: "SELECTING_DAY" };
    }

    // Meta Interactive List allows up to 10 rows
    const displayedSlots = availableSlots.slice(0, 10);

    const sections = [
      {
        title: "Available Slots",
        rows: displayedSlots.map((s) => ({
          id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
          title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24), // e.g. "04:30 PM - 05:00 PM"
          description: `India Time: ${s.istStartTime} IST (with Abhay)`.slice(0, 72),
        })),
      },
    ];

    const slotPrompt =
      `Here are the available 30-minute consultation slots in your local time (**${session.timeZoneLabel}**).\n\n` +
      `Tap below to reserve your slot with our consultant Abhay:`;

    await sendInteractiveList(
      session.phone,
      "Pick Your Time",
      slotPrompt,
      "Select Time",
      sections,
    );

    await updateSession(db, session.phone, { currentStep: "SELECTING_SLOT" });
    return { replyText: slotPrompt, step: "SELECTING_SLOT" };
  }

  // 7. Candidate selected slot -> Lock slot in CRM, Assign to Abhay, Send Meet Link
  if (actionId.startsWith("SLOT_")) {
    // Format: SLOT_{meetingDate}_{istStart}_{candidateStart}
    const parts = actionId.split("_");
    const meetingDate = parts[1];
    const istStart = parts[2];
    const candidateStart = parts[3];

    // Compute 30-min end times
    const [h, m] = istStart.split(":").map(Number);
    let endH = h;
    let endM = m + 30;
    if (endM >= 60) {
      endH += 1;
      endM -= 60;
    }
    const istEnd = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    const candEndObj = convertIstSlotToCandidateTime(
      meetingDate,
      istEnd,
      session.timeZone,
    );
    const candidateEnd = candEndObj.candidateTime;

    const now = new Date();

    // Look up user "Abhay" in CRM users collection
    const abhayUser = await db.collection("users").findOne({
      username: { $regex: /^abhay$/i },
    });
    const abhayId = abhayUser ? abhayUser.id : 1;
    const abhayName = abhayUser ? abhayUser.name : "Abhay";

    // 1. Resolve lead ID first so it can be linked to the meetingSlot
    const leadId = session.leadId || (await syncCrmLead(db, session, "meeting-scheduled"));

    // 2. Lock slot in meetingSlots collection (compatible with all CRM meeting APIs)
    const slotId = await getNextId(db, "meetingSlots");
    const slotDoc = {
      id: slotId,
      leadId,
      meetingDate,
      startTime: istStart,
      endTime: istEnd,
      status: "scheduled",
      phone: session.phone,
      email: session.email,
      meetingUserId: abhayId,
      meetingUserName: abhayName,
      bookedBy: "WhatsApp Automation",
      bookedByName: "WhatsApp Automation",
      candidateTimezone: session.timeZone,
      candidateLocalTime: candidateStart,
      googleMeetLink: meetLink,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("meetingSlots").insertOne(slotDoc);

    // 3. Update CRM Lead -> Assigned to Abhay with status "meeting-scheduled"
    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          status: "meeting-scheduled",
          meetingStatus: "scheduled",
          assignedTo: abhayId,
          assignedToName: abhayName,
          assignedToRole: (abhayUser?.role as string) || "meeting",
          assignedBy: "WhatsApp Automation",
          assignedByName: "WhatsApp Automation",
          meetingDetails: {
            meetingUserId: abhayId,
            meetingUserName: abhayName,
            meetingDate,
            startTime: istStart,
            endTime: istEnd,
            candidateTimezone: session.timeZone,
            candidateLocalStartTime: candidateStart,
            candidateLocalEndTime: candidateEnd,
            bookedBy: "WhatsApp Automation",
            bookedByName: "WhatsApp Automation",
            googleMeetLink: meetLink,
            status: "scheduled",
          },
          updatedAt: now,
        },
        $addToSet: {
          visibleTo: abhayId,
          participants: abhayId,
        },
        $push: {
          history: {
            action: "meeting_booked_via_whatsapp",
            performedByName: "WhatsApp Automation",
            timestamp: now,
            details: `Booked for ${meetingDate} at ${candidateStart} (${session.timeZoneLabel}) / ${istStart} IST. Assigned to Abhay. Room: ${meetLink}`,
          },
        } as unknown as Record<string, unknown>,
      },
    );

    // 4. In-App Notification for Abhay in the CRM
    if (abhayUser) {
      try {
        const { createNotification } = await import("@/lib/notifications");
        await createNotification({
          userId: abhayUser.id,
          title: "New WhatsApp Meeting Booked",
          message: `1-on-1 Australia 482 consultation booked with ${session.name || "WhatsApp Candidate"} on ${meetingDate} at ${istStart} IST (${candidateStart} ${session.timeZoneLabel}).`,
          type: "meeting_scheduled",
          link: `/dashboard/leads/${leadId}`,
        });
      } catch (notifErr) {
        console.error("Failed to notify consultant:", notifErr);
      }
    }

    // 3. Mark session as BOOKED
    await updateSession(db, session.phone, {
      currentStep: "BOOKED",
      bookedSlot: {
        date: meetingDate,
        candidateTime: candidateStart,
        candidateTimeLabel: `${candidateStart} (${session.timeZoneLabel})`,
        istTime: istStart,
        istTimeLabel: `${istStart} - ${istEnd} (IST)`,
        meetingUserId: abhayId,
        meetingUserName: abhayName,
      },
    });

    const confirmationMsg =
      `🎉 **Consultation Confirmed with Abhay!**\n\n` +
      `Your 1-on-1 Australia Subclass 482 profile evaluation has been scheduled:\n\n` +
      `📅 **Date:** ${meetingDate}\n` +
      `⏰ **Your Local Time:** ${candidateStart} (${session.timeZoneLabel})\n` +
      `🇮🇳 **Consultant Indian Time:** ${istStart} - ${istEnd} IST\n` +
      `👤 **Consultant:** ${abhayName}\n\n` +
      `🔗 **Join via Google Meet:**\n${meetLink}\n\n` +
      `📌 *Tip: Please have your CV ready for the call. We will also send you a reminder 1 hour before the meeting starts!*\n\n` +
      `See you there! 🇦🇺`;

    await sendTextMessage(session.phone, confirmationMsg);
    return { replyText: confirmationMsg, step: "BOOKED" };
  }

  // 8. Free-form conversational message -> Consult Context-Aware Meta AI
  const aiAnswer = await generateAiResponse({
    message: cleanText,
    session,
  });

  await sendTextMessage(session.phone, aiAnswer);
  return { replyText: aiAnswer, step: session.currentStep };
}
