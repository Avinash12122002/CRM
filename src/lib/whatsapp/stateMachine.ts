import { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { WhatsAppSession, WhatsAppStep, MeetingHistoryItem } from "./types";
import { detectCountryFromPhone, convertIstSlotToCandidateTime } from "./timezone";
import { findEligibleOccupation } from "./occupations";
import {
  getUpcomingWeekendDays,
  getAvailableWeekendSlots,
  findNextAvailableWeekendDay,
  formatSlotsOverview,
} from "./slots";
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
    process.env.GOOGLE_MEET_LINK ||
    "https://meet.google.com/qpj-ntbh-ieu"
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
    // Sync live CRM data (like meeting completion, payment status, occupation, experience) if leadId exists
    if (existing.leadId) {
      const lead = await db.collection("leads").findOne({ id: existing.leadId });
      if (lead) {
        existing.meetingCompleted = lead.meetingStatus === "completed" || lead.status === "follow-up";
        existing.paymentPending = lead.status === "payment-pending" || lead.status === "document-pending";
        if (lead.meetingStatus) existing.meetingStatus = lead.meetingStatus;
        if (lead.interestedCountry) existing.interestedCountry = lead.interestedCountry;
        if (lead.occupations && lead.occupations.length > 0 && !existing.occupation) {
          existing.occupation = lead.occupations[0];
        }
        if (lead.experience && !existing.yearsExperience) existing.yearsExperience = lead.experience;
        if (lead.email && !existing.email) existing.email = lead.email;
        if (lead.meetingCompletedAt) existing.meetingCompletedAt = lead.meetingCompletedAt;
        if (lead.meetingCancelledAt) existing.meetingCanceledAt = lead.meetingCancelledAt;
      }
    }
    if (!existing.interestedCountry) existing.interestedCountry = "Australia";
    if (!existing.meetingStatus) existing.meetingStatus = existing.bookedSlot ? "booked" : "none";
    if (!existing.meetingHistory) existing.meetingHistory = [];
    return existing;
  }

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: candidateName || "Candidate",
    countryCode: country.countryCode,
    countryName: country.countryName,
    interestedCountry: "Australia",
    timeZone: country.timeZone,
    timeZoneLabel: country.label,
    currentStep: "WELCOME",
    followupCount: 0,
    meetingStatus: "none",
    meetingHistory: [],
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(SESSIONS_COLLECTION).insertOne(newSession as unknown as Record<string, unknown>);
  return newSession;
}

/**
 * Append an entry to meeting history
 */
export async function appendMeetingHistory(
  db: Db,
  phone: string,
  historyItem: MeetingHistoryItem,
) {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  await db.collection(SESSIONS_COLLECTION).updateOne(
    { phone: cleanPhone },
    {
      $push: { meetingHistory: historyItem } as any,
      $set: { updatedAt: new Date() },
    },
  );
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
  let actionId = (params.selectedId || "").trim();
  const meetLink = getStaticGoogleMeetLink();
  const videoUrl = getVideo482Url();

  const lowerText = cleanText.toLowerCase().replace(/[^a-z0-9@. ]/g, "").trim();

  // --- Auto-extract and persist candidate profile details ---
  // 1. Occupation & Sector from 691 list
  const occMatch = findEligibleOccupation(cleanText);
  if (occMatch && (!session.occupation || session.occupation !== occMatch.role)) {
    session.occupation = occMatch.role;
    session.occupationSector = occMatch.category;
    await updateSession(db, session.phone, {
      occupation: occMatch.role,
      occupationSector: occMatch.category,
    });
    if (session.leadId) {
      await db.collection("leads").updateOne(
        { id: session.leadId },
        {
          $addToSet: { occupations: occMatch.role } as any,
          $set: { jobApplied: occMatch.role, updatedAt: new Date() },
        }
      );
    }
  }

  // 2. Years of Experience
  const expRegex = /\b(\d{1,2})\s*(?:\+|\s*plus)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?\b/i;
  const expMatch = cleanText.match(expRegex);
  if (expMatch && (!session.yearsExperience || session.yearsExperience !== `${expMatch[1]} years`)) {
    const expStr = `${expMatch[1]} years`;
    session.yearsExperience = expStr;
    await updateSession(db, session.phone, { yearsExperience: expStr });
    if (session.leadId) {
      await db.collection("leads").updateOne(
        { id: session.leadId },
        { $set: { experience: expStr, updatedAt: new Date() } }
      );
    }
  }

  // 3. English Language Test / Score
  const englishRegex = /\b(ielts|pte|toefl|celpip|oet)\s*(?:overall\s*)?(\d+(?:\.\d+)?)\b/i;
  const engMatch = cleanText.match(englishRegex);
  if (engMatch) {
    const engStr = `${engMatch[1].toUpperCase()} ${engMatch[2]}`;
    session.englishTestStatus = engStr;
    await updateSession(db, session.phone, { englishTestStatus: engStr });
  }

  // 4. Highest Qualification
  const qualRegex = /\b(master'?s?|bachelor'?s?|b\.?tech|m\.?tech|degree|diploma|phd|mba|bsc|msc|bca|mca)\b/i;
  const qualMatch = cleanText.match(qualRegex);
  if (qualMatch && !session.highestQualification) {
    session.highestQualification = qualMatch[0].toUpperCase();
    await updateSession(db, session.phone, { highestQualification: qualMatch[0].toUpperCase() });
  }

  // 5. Destination of Interest
  if (!session.interestedCountry) {
    session.interestedCountry = "Australia";
    await updateSession(db, session.phone, { interestedCountry: "Australia" });
  }

  // --- Meeting Cancellation Request Check ---
  const isCancelRequest =
    actionId === "CANCEL_MEETING" ||
    lowerText === "cancel" ||
    lowerText === "cancel meeting" ||
    lowerText === "cancel consultation" ||
    lowerText === "cancel slot" ||
    lowerText === "cancel my appointment" ||
    lowerText === "cancel my meeting" ||
    lowerText === "cancel my slot" ||
    (lowerText.includes("cancel") &&
      (lowerText.includes("meeting") ||
        lowerText.includes("consultation") ||
        lowerText.includes("slot") ||
        lowerText.includes("appointment")));

  if (isCancelRequest && session.bookedSlot) {
    const canceledSlot = session.bookedSlot;
    const slotStartTime = canceledSlot.istTime.split(" ")[0];

    // Release slot in meetingSlots collection
    try {
      await db.collection("meetingSlots").updateOne(
        {
          date: canceledSlot.date,
          startTime: slotStartTime,
          isBooked: true,
        },
        {
          $set: {
            isBooked: false,
            bookedBy: null,
            candidatePhone: null,
            updatedAt: new Date(),
          },
        }
      );
    } catch (slotErr) {
      console.warn("Could not release slot on cancel:", slotErr);
    }

    // Append to Meeting History
    const historyItem: MeetingHistoryItem = {
      action: "canceled",
      date: canceledSlot.date,
      candidateTime: canceledSlot.candidateTimeLabel,
      istTime: canceledSlot.istTimeLabel,
      timestamp: new Date(),
      reason: cleanText || "Candidate requested cancellation via WhatsApp",
    };
    await appendMeetingHistory(db, session.phone, historyItem);

    // Update session in whatsapp_sessions
    await updateSession(db, session.phone, {
      meetingStatus: "canceled",
      meetingCanceledAt: new Date(),
      meetingCancellationReason: cleanText || "Requested by candidate via WhatsApp",
      bookedSlot: undefined,
      currentStep: "AWAITING_REENGAGEMENT",
    });

    // Update CRM lead
    if (session.leadId) {
      await db.collection("leads").updateOne(
        { id: session.leadId },
        {
          $set: {
            meetingStatus: "cancelled",
            meetingCancelledAt: new Date(),
            meetingDetails: null,
            updatedAt: new Date(),
          },
          $push: {
            history: {
              action: "meeting_cancelled_via_whatsapp",
              performedByName: "WhatsApp Automation",
              timestamp: new Date(),
              details: `Consultation on ${canceledSlot.date} at ${canceledSlot.istTimeLabel} cancelled by candidate`,
            } as any,
          },
        }
      );
    }

    const cancelMsg =
      `Your consultation scheduled for **${canceledSlot.date}** at **${canceledSlot.candidateTimeLabel}** has been cancelled. ✅\n\n` +
      `Whenever you are ready to reschedule or discuss your Australia Subclass 482 visa options, feel free to tap below or reply here anytime!`;

    await sendQuickReplyButtons(session.phone, cancelMsg, [
      { id: "BTN_RESCHEDULE_MEETING", title: "Book New Date" },
    ]);

    return { replyText: cancelMsg, step: "AWAITING_REENGAGEMENT" };
  }

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

  // 5. Candidate wants Consultation or wants to Reschedule/Change Date -> Show 10 Upcoming Weekend Dates (~whole month)
  const isRescheduleIntent =
    actionId === "BTN_RESCHEDULE" ||
    actionId === "BTN_CHANGE_DAY" ||
    lowerText.includes("reschedule") ||
    lowerText.includes("wrong time") ||
    lowerText.includes("wrong date") ||
    lowerText.includes("wrong slot") ||
    (lowerText.includes("change") &&
      (lowerText.includes("date") ||
        lowerText.includes("time") ||
        lowerText.includes("slot") ||
        lowerText.includes("meeting"))) ||
    (lowerText.includes("different") &&
      (lowerText.includes("date") ||
        lowerText.includes("time") ||
        lowerText.includes("slot")));

  const wantsConsultation =
    actionId === "BTN_CONSULT_YES" ||
    isRescheduleIntent ||
    (session.currentStep === "VIDEO_SENT_AWAITING_INTEREST" &&
      ["yes", "book", "consult", "consultation", "meeting", "call"].some((w) =>
        lowerText.includes(w)
      ));

  if (wantsConsultation) {
    const weekends = getUpcomingWeekendDays(10);

    const sections = [
      {
        title: "Select Weekend Date",
        rows: weekends.map((w) => ({
          id: `DAY_DATE_${w.date}`,
          title: w.displayLabel.slice(0, 24), // e.g. "Sat, 26 Sep"
          description: `${w.dayName} · 11 AM - 7 PM IST`.slice(0, 72),
        })),
      },
    ];

    const isRescheduling = Boolean(session.bookedSlot);
    const dayText = isRescheduling
      ? `📅 *Change Consultation Date & Time*\n\n` +
        `Your current meeting is on **${session.bookedSlot?.date}** at **${session.bookedSlot?.candidateTimeLabel || session.bookedSlot?.istTimeLabel}**.\n\n` +
        `Please select your new preferred weekend date from the upcoming month:`
      : `Our 1-on-1 consultations with our senior visa experts are held on **Saturdays and Sundays**.\n\n` +
        `All slots run strictly between 11:00 AM and 07:00 PM Indian Time (IST) in 30-minute intervals and will be shown in your local time (**${session.timeZoneLabel}**).\n\n` +
        `Here are the 10 upcoming weekend dates across the month. Please select your preferred date:`;

    await sendInteractiveList(
      session.phone,
      "Consultation Booking",
      dayText,
      "Select Date",
      sections,
    );

    await updateSession(db, session.phone, { currentStep: "SELECTING_DAY" });
    return { replyText: dayText, step: "SELECTING_DAY" };
  }

  // 6. Candidate selected day -> Show all 16 slots at once in one view
  if (
    actionId.startsWith("DAY_DATE_") ||
    actionId.startsWith("DAY_SELECT_") ||
    actionId.startsWith("DAY_MORNING_") ||
    actionId.startsWith("DAY_EVENING_")
  ) {
    let meetingDate = "";

    if (actionId.startsWith("DAY_MORNING_")) {
      meetingDate = actionId.replace("DAY_MORNING_", "");
    } else if (actionId.startsWith("DAY_EVENING_")) {
      meetingDate = actionId.replace("DAY_EVENING_", "");
    } else if (actionId.startsWith("DAY_DATE_")) {
      meetingDate = actionId.replace("DAY_DATE_", "");
    } else {
      meetingDate = actionId.replace("DAY_SELECT_", "");
    }

    const slots = await getAvailableWeekendSlots({
      db,
      meetingDate,
      candidateTimeZone: session.timeZone,
      candidateTimeLabel: session.timeZoneLabel,
    });

    const availableSlots = slots.filter((s) => s.available);

    // If NO slots available on this date:
    if (availableSlots.length === 0) {
      const allWeekends = getUpcomingWeekendDays(10);
      const selectedDayObj = allWeekends.find((w) => w.date === meetingDate);
      const selectedLabel = selectedDayObj ? selectedDayObj.displayLabel : meetingDate;

      // Find next weekend with open slots
      const nextWeekend = await findNextAvailableWeekendDay({
        db,
        afterDate: meetingDate,
        candidateTimeZone: session.timeZone,
        candidateTimeLabel: session.timeZoneLabel,
      });

      if (nextWeekend && nextWeekend.availableSlots.length > 0) {
        const nextDate = nextWeekend.dayOption.date;
        const nextLabel = nextWeekend.dayOption.displayLabel;
        const isIndia = session.countryCode === "IN";

        // Save active slots date
        await updateSession(db, session.phone, {
          currentStep: "SELECTING_SLOT",
          activeSlotsDate: nextDate,
        });

        // 1. Send complete overview text of all available slots for next weekend in one view
        const overviewText =
          `All consultation slots for **${selectedLabel}** are currently fully booked! 🔒\n\n` +
          `Here are all available consultation slots for the next weekend on **${nextLabel}**:\n\n` +
          formatSlotsOverview({
            slots: nextWeekend.availableSlots,
            dayLabel: nextLabel,
            candidateTimeZoneLabel: session.timeZoneLabel,
            isIndia,
          });

        await sendTextMessage(session.phone, overviewText);

        // 2. Send interactive list(s) so candidate can tap or reply with a number
        if (nextWeekend.availableSlots.length <= 10) {
          const sections = [
            {
              title: "Available Slots",
              rows: nextWeekend.availableSlots.map((s) => ({
                id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
                title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24),
                description: `IST: ${s.istStartTime} - ${s.istEndTime}`.slice(0, 72),
              })),
            },
          ];
          await sendInteractiveList(
            session.phone,
            "Pick Your Time",
            "Tap below to choose your consultation slot:",
            "Select Slot",
            sections,
          );
        } else {
          // Send 2 list messages so all slots can be tapped
          const part1 = nextWeekend.availableSlots.slice(0, 8);
          const part2 = nextWeekend.availableSlots.slice(8, 16);

          await sendInteractiveList(
            session.phone,
            "Slots 1 to 8",
            "Choose an earlier slot (11:00 AM - 03:00 PM IST):",
            "Slots 1-8",
            [
              {
                title: "11:00 AM - 03:00 PM",
                rows: part1.map((s) => ({
                  id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
                  title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24),
                  description: `IST: ${s.istStartTime} - ${s.istEndTime}`.slice(0, 72),
                })),
              },
            ],
          );

          await delay(300);

          await sendInteractiveList(
            session.phone,
            "Slots 9 to 16",
            "Choose a later slot (03:00 PM - 07:00 PM IST):",
            "Slots 9-16",
            [
              {
                title: "03:00 PM - 07:00 PM",
                rows: part2.map((s) => ({
                  id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
                  title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24),
                  description: `IST: ${s.istStartTime} - ${s.istEndTime}`.slice(0, 72),
                })),
              },
            ],
          );
        }

        return { replyText: overviewText, step: "SELECTING_SLOT" };
      } else {
        const fullText =
          `All consultation slots for **${selectedLabel}** are currently fully booked! 🔒\n\n` +
          `Would you like to review all upcoming dates across the month?`;
        await sendQuickReplyButtons(session.phone, fullText, [
          { id: "BTN_CHANGE_DAY", title: "View All 10 Dates" },
        ]);
        return { replyText: fullText, step: "SELECTING_DAY" };
      }
    }

    // Slots are available for this date!
    const allWeekends = getUpcomingWeekendDays(10);
    const dayObj = allWeekends.find((w) => w.date === meetingDate);
    const dayLabel = dayObj ? dayObj.displayLabel : meetingDate;
    const isIndia = session.countryCode === "IN";

    // Save activeSlotsDate in session so reply with number works
    await updateSession(db, session.phone, {
      currentStep: "SELECTING_SLOT",
      activeSlotsDate: meetingDate,
    });

    // 1. Send complete overview text of ALL 16 slots at once in one view!
    const overviewText = formatSlotsOverview({
      slots: availableSlots,
      dayLabel,
      candidateTimeZoneLabel: session.timeZoneLabel,
      isIndia,
    });

    await sendTextMessage(session.phone, overviewText);

    // 2. Send interactive list(s)
    if (availableSlots.length <= 10) {
      const sections = [
        {
          title: "Available Slots",
          rows: availableSlots.map((s) => ({
            id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
            title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24),
            description: `IST: ${s.istStartTime} - ${s.istEndTime}`.slice(0, 72),
          })),
        },
      ];

      await sendInteractiveList(
        session.phone,
        "Pick Your Time",
        "Tap below to choose your consultation slot:",
        "Select Slot",
        sections,
      );
    } else {
      // Send 2 list messages so all 16 slots can be tapped
      const part1 = availableSlots.slice(0, 8);
      const part2 = availableSlots.slice(8, 16);

      await sendInteractiveList(
        session.phone,
        "Slots 1 to 8",
        "Choose an earlier slot (11:00 AM - 03:00 PM IST):",
        "Slots 1-8",
        [
          {
            title: "11:00 AM - 03:00 PM",
            rows: part1.map((s) => ({
              id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
              title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24),
              description: `IST: ${s.istStartTime} - ${s.istEndTime}`.slice(0, 72),
            })),
          },
        ],
      );

      await delay(300);

      await sendInteractiveList(
        session.phone,
        "Slots 9 to 16",
        "Choose a later slot (03:00 PM - 07:00 PM IST):",
        "Slots 9-16",
        [
          {
            title: "03:00 PM - 07:00 PM",
            rows: part2.map((s) => ({
              id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
              title: s.candidateDisplayLabel.split(" (")[0].slice(0, 24),
              description: `IST: ${s.istStartTime} - ${s.istEndTime}`.slice(0, 72),
            })),
          },
        ],
      );
    }

    return { replyText: overviewText, step: "SELECTING_SLOT" };
  }

  // 6b. Candidate typed a slot number (e.g. "1", "5", "14") or typed a time (e.g. "11:00", "2:30", "4pm")
  if (
    session.currentStep === "SELECTING_SLOT" &&
    session.activeSlotsDate &&
    !actionId.startsWith("SLOT_")
  ) {
    const num = parseInt(cleanText.replace(/[^\d]/g, ""), 10);
    const dateSlots = await getAvailableWeekendSlots({
      db,
      meetingDate: session.activeSlotsDate,
      candidateTimeZone: session.timeZone,
      candidateTimeLabel: session.timeZoneLabel,
    });
    const available = dateSlots.filter((s) => s.available);

    if (!isNaN(num) && num >= 1 && num <= available.length) {
      const picked = available[num - 1];
      actionId = `SLOT_${picked.date}_${picked.istStartTime}_${picked.candidateStartTime}`;
    } else {
      const cleanLower = cleanText.toLowerCase();
      const matched = available.find((s) =>
        cleanLower.includes(s.istStartTime) ||
        cleanLower.includes(s.candidateStartTime) ||
        cleanLower.replace(/[: ]/g, "").includes(s.istStartTime.replace(":", ""))
      );
      if (matched) {
        actionId = `SLOT_${matched.date}_${matched.istStartTime}_${matched.candidateStartTime}`;
      }
    }
  }

  // 7. Candidate selected slot -> Lock slot in CRM, Assign to Abhay, Send Meet Link, Replace previous slot if rescheduling
  if (actionId.startsWith("SLOT_")) {
    // Format: SLOT_{meetingDate}_{istStart}_{candidateStart}
    const parts = actionId.split("_");
    const meetingDate = parts[1];
    const istStart = parts[2];
    const candidateStart = parts[3];

    // Double-booking check: Ensure slot is not already locked/booked by someone else!
    const existingSlot = await db.collection("meetingSlots").findOne({
      meetingDate,
      startTime: istStart,
      status: { $in: ["scheduled", "completed"] },
    });

    if (existingSlot && existingSlot.phone !== session.phone) {
      console.log(`[WhatsApp] Collision: slot ${meetingDate} ${istStart} is already booked by ${existingSlot.phone}`);

      // Re-query available slots for this date
      const remainingSlots = await getAvailableWeekendSlots({
        db,
        meetingDate,
        candidateTimeZone: session.timeZone,
        candidateTimeLabel: session.timeZoneLabel,
      });
      const availableRemaining = remainingSlots.filter((s) => s.available);

      if (availableRemaining.length > 0) {
        const isIndia = session.countryCode === "IN";
        const dayLabel = remainingSlots[0]?.dayLabel || meetingDate;

        const collisionMsg =
          `⚠️ That slot (**${istStart} IST**) was just booked by another candidate!\n\n` +
          `All consultation slots are locked once reserved to avoid overlap. Please choose another available time:\n\n` +
          formatSlotsOverview({
            slots: availableRemaining,
            dayLabel,
            candidateTimeZoneLabel: session.timeZoneLabel,
            isIndia,
          });

        await sendTextMessage(session.phone, collisionMsg);
        return { replyText: collisionMsg, step: "SELECTING_SLOT" };
      } else {
        // All slots on this day are now booked! Suggest next weekend
        const nextWeekend = await findNextAvailableWeekendDay({
          db,
          afterDate: meetingDate,
          candidateTimeZone: session.timeZone,
          candidateTimeLabel: session.timeZoneLabel,
        });

        if (nextWeekend && nextWeekend.availableSlots.length > 0) {
          const nextLabel = nextWeekend.dayOption.displayLabel;
          const isIndia = session.countryCode === "IN";

          const collisionMsg =
            `⚠️ That slot was just booked, and all slots for that day are now fully reserved! 🔒\n\n` +
            `Here are all available consultation slots for the next weekend on **${nextLabel}**:\n\n` +
            formatSlotsOverview({
              slots: nextWeekend.availableSlots,
              dayLabel: nextLabel,
              candidateTimeZoneLabel: session.timeZoneLabel,
              isIndia,
            });

          await sendTextMessage(session.phone, collisionMsg);
          return { replyText: collisionMsg, step: "SELECTING_SLOT" };
        } else {
          const fullText =
            `⚠️ That slot was just booked and upcoming weekend dates are currently full.\n\n` +
            `Would you like to review all upcoming dates across the month?`;
          await sendQuickReplyButtons(session.phone, fullText, [
            { id: "BTN_CHANGE_DAY", title: "View All 10 Dates" },
          ]);
          return { replyText: fullText, step: "SELECTING_DAY" };
        }
      }
    }

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

    // Check if this candidate ALREADY has a previously scheduled meeting (Rescheduling flow!)
    const previousScheduledSlot = await db.collection("meetingSlots").findOne({
      phone: session.phone,
      status: "scheduled",
    });

    const isReschedule = Boolean(previousScheduledSlot);
    let previousSlotDetails = "";

    if (previousScheduledSlot) {
      previousSlotDetails = `${previousScheduledSlot.meetingDate} at ${previousScheduledSlot.startTime} IST`;
      console.log(`[WhatsApp] Rescheduling: releasing previous slot for ${session.phone}: ${previousSlotDetails}`);

      // Delete previous scheduled slot from meetingSlots so it is immediately FREE and UNLOCKED for others in the whole system!
      await db.collection("meetingSlots").deleteMany({
        phone: session.phone,
        status: "scheduled",
      });
    }

    // 2. Lock NEW slot in meetingSlots collection
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
            action: isReschedule ? "meeting_rescheduled_via_whatsapp" : "meeting_booked_via_whatsapp",
            performedByName: "WhatsApp Automation",
            timestamp: now,
            details: isReschedule
              ? `Rescheduled from ${previousSlotDetails} to ${meetingDate} at ${candidateStart} (${session.timeZoneLabel}) / ${istStart} IST. Assigned to Abhay. Room: ${meetLink}`
              : `Booked for ${meetingDate} at ${candidateStart} (${session.timeZoneLabel}) / ${istStart} IST. Assigned to Abhay. Room: ${meetLink}`,
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
          title: isReschedule ? "WhatsApp Meeting Rescheduled" : "New WhatsApp Meeting Booked",
          message: isReschedule
            ? `1-on-1 consultation with ${session.name || "WhatsApp Candidate"} was RESCHEDULED to ${meetingDate} at ${istStart} IST (${candidateStart} ${session.timeZoneLabel}).`
            : `1-on-1 Australia 482 consultation booked with ${session.name || "WhatsApp Candidate"} on ${meetingDate} at ${istStart} IST (${candidateStart} ${session.timeZoneLabel}).`,
          type: "meeting_scheduled",
          link: `/dashboard/leads/${leadId}`,
        });
      } catch (notifErr) {
        console.error("Failed to notify consultant:", notifErr);
      }
    }

    // 5. Update session in whatsapp_sessions
    const historyItem: MeetingHistoryItem = {
      action: isReschedule ? "rescheduled" : "booked",
      date: meetingDate,
      candidateTime: `${candidateStart} (${session.timeZoneLabel})`,
      istTime: `${istStart} - ${istEnd} (IST)`,
      timestamp: now,
      previousSlot: isReschedule && session.bookedSlot ? {
        date: session.bookedSlot.date,
        candidateTime: session.bookedSlot.candidateTimeLabel,
        istTime: session.bookedSlot.istTimeLabel,
      } : undefined,
    };

    await updateSession(db, session.phone, {
      currentStep: "BOOKED",
      meetingStatus: isReschedule ? "rescheduled" : "booked",
      meetingBookedAt: !isReschedule ? now : session.meetingBookedAt || now,
      meetingRescheduledAt: isReschedule ? now : session.meetingRescheduledAt,
      meetingRescheduledCount: (session.meetingRescheduledCount || 0) + (isReschedule ? 1 : 0),
      activeSlotsDate: undefined,
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

    await appendMeetingHistory(db, session.phone, historyItem);

    const candidateDisplayName = session.name && session.name !== "Candidate" ? session.name : "Candidate";

    const dateObj = new Date(`${meetingDate}T12:00:00+05:30`);
    const formattedDate = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dateObj); // e.g. "27 September 2026"

    const timeDisplay = session.countryCode === "IN"
      ? `${istStart} - ${istEnd} IST`
      : `${candidateStart} (${session.timeZoneLabel}) / ${istStart} - ${istEnd} IST`;

    const confirmationMsg = isReschedule
      ? `Dear ${candidateDisplayName},\n\n` +
        `Your *Australia Subclass 482 Work Visa* consultation has been **successfully rescheduled**! ✅\n\n` +
        `📅 *New Date:* ${formattedDate}\n` +
        `⏰ *New Time:* ${timeDisplay}\n` +
        `💻 *Google Meet:* ${meetLink}\n\n` +
        `Please make sure to *join the meeting on time*.\n\n` +
        `We look forward to speaking with you.\n\n` +
        `*Best regards,*\n` +
        `*TMS Visa*`
      : `Dear ${candidateDisplayName},\n\n` +
        `Thank you for showing your interest in the *Australia Subclass 482 Work Visa*.\n\n` +
        `We are pleased to invite you to a *Google Meet session* to discuss the visa process, eligibility, requirements, and further details.\n\n` +
        `📅 *Date:* ${formattedDate}\n` +
        `⏰ *Time:* ${timeDisplay}\n` +
        `💻 *Google Meet:* ${meetLink}\n\n` +
        `Please make sure to *join the meeting on time*.\n\n` +
        `We look forward to speaking with you.\n\n` +
        `*Best regards,*\n` +
        `*TMS Visa*`;

    await sendTextMessage(session.phone, confirmationMsg);

    // Send Quick Reply Button: Change Date & Time (in case candidate made a mistake or wants to reschedule)
    await delay(300);
    const changePrompt =
      `ℹ️ *Need to change your date or time?*\n` +
      `If you mistakenly selected the wrong slot or need to change it later, tap below anytime:`;

    await sendQuickReplyButtons(session.phone, changePrompt, [
      { id: "BTN_RESCHEDULE", title: "Change Date & Time" },
    ]);

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
