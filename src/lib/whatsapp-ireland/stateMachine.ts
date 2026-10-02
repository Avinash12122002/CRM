import { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { WhatsAppSession, WeekendSlot } from "./types";
import {
  detectCountryFromPhone,
  convertIstSlotToCandidateTime,
  extractShortTimezone,
  getNext10AmInTimezone,
  getCandidateConsultationWindow,
} from "./timezone";
import {
  getUpcomingWeekendDays,
  getAvailableWeekendSlots,
} from "./slots";
import { generateAiResponse } from "./ai";
import {
  sendTextMessage,
  sendQuickReplyButtons,
  sendVideoMessage,
  sendInteractiveList,
  delay,
} from "./client";
import { sendWhatsAppIrelandInfoEmail } from "./infoEmail";

const SESSIONS_COLLECTION = "whatsapp_ireland_sessions";

export function getStaticGoogleMeetLink(): string {
  return (
    process.env.GOOGLE_MEET_LINK_IRELAND ||
    process.env.GOOGLE_MEET_LINK ||
    "https://meet.google.com/hgu-yxat-nwy"
  );
}

export function getVideoIrelandUrl(): string {
  return (
    process.env.VIDEO_IRELAND_URL ||
    "https://tmsvisa.com/wp-content/uploads/2026/09/Ireland-process-video.mp4"
  );
}

function buildSlotRows(
  availableSlots: WeekendSlot[],
  _meetingDate: string,
  timeZoneLabel: string,
) {
  const tzShort = extractShortTimezone(timeZoneLabel);
  return availableSlots.slice(0, 10).map((s, idx) => ({
    id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
    title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
    description: `Slot #${idx + 1} (${tzShort})`.slice(0, 72),
  }));
}

/**
 * Load or initialize Ireland candidate session from MongoDB
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
    if (!existing.name || existing.name === "Candidate" || existing.name.toLowerCase().includes("test")) {
      const realCandidateName =
        candidateName && candidateName !== "Candidate" && !candidateName.toLowerCase().includes("test")
          ? candidateName
          : undefined;

      if (realCandidateName) {
        existing.name = realCandidateName;
        await db.collection(SESSIONS_COLLECTION).updateOne(
          { phone: cleanPhone },
          { $set: { name: realCandidateName, updatedAt: now } }
        );
      }
    }

    if (!existing.interestedCountry) {
      existing.interestedCountry = "Ireland";
      await db.collection(SESSIONS_COLLECTION).updateOne(
        { phone: cleanPhone },
        { $set: { interestedCountry: "Ireland", updatedAt: now } }
      );
    }

    // Sync live CRM lead data so bot reflects latest CRM status (meeting done, payment, etc.)
    const lead = existing.leadId
      ? await db.collection("leads").findOne({ id: existing.leadId })
      : await db.collection("leads").findOne({
          $or: [
            { phone: cleanPhone },
            { phone: `+${cleanPhone}` },
            { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
          ],
        });

    if (lead) {
      if (!existing.leadId) {
        existing.leadId = lead.id;
        await db.collection(SESSIONS_COLLECTION).updateOne(
          { phone: cleanPhone },
          { $set: { leadId: lead.id, updatedAt: now } }
        );
      }
      if (lead.name && (!existing.name || existing.name === "Candidate" || existing.name.toLowerCase().includes("test"))) {
        existing.name = lead.name;
        await db.collection(SESSIONS_COLLECTION).updateOne(
          { phone: cleanPhone },
          { $set: { name: lead.name, updatedAt: now } }
        );
      }
      existing.meetingCompleted = lead.meetingStatus === "completed" || lead.status === "follow-up";
      existing.paymentPending = lead.status === "payment-pending" || lead.status === "document-pending";
      if (lead.email && !existing.email) existing.email = lead.email;
      if (lead.meetingCompletedAt) existing.meetingCompletedAt = lead.meetingCompletedAt;
    }

    return existing;
  }

  // Lookup existing CRM lead
  const existingLead = await db.collection("leads").findOne({
    $or: [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
      { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
    ],
  });

  const resolvedName =
    existingLead?.name && !existingLead.name.toLowerCase().includes("test")
      ? existingLead.name
      : candidateName && candidateName !== "Candidate" && !candidateName.toLowerCase().includes("test")
      ? candidateName
      : "Candidate";

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: resolvedName,
    email: existingLead?.email,
    countryCode: country.countryCode,
    countryName: country.countryName,
    interestedCountry: "Ireland",
    timeZone: country.timeZone,
    timeZoneLabel: country.label,
    currentStep: "WELCOME",
    leadId: existingLead?.id,
    followupCount: 0,
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(SESSIONS_COLLECTION).insertOne(newSession as any);
  return newSession;
}

export async function updateSession(
  db: Db,
  phone: string,
  updates: Partial<WhatsAppSession>,
): Promise<void> {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  await db
    .collection(SESSIONS_COLLECTION)
    .updateOne({ phone: cleanPhone }, { $set: { ...updates, updatedAt: new Date() } });
}

/**
 * Creates or updates an Ireland CRM lead in the `leads` collection
 */
async function ensureLeadExists(
  db: Db,
  session: WhatsAppSession,
  additionalData: Record<string, unknown> = {},
): Promise<number> {
  const cleanPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");

  const existing = await db.collection("leads").findOne({
    $or: [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
      { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
    ],
  });

  if (existing) {
    await db.collection("leads").updateOne(
      { id: existing.id },
      {
        $set: {
          ...additionalData,
          interestedCountry: "Ireland",
          updatedAt: new Date(),
        },
      }
    );
    return existing.id;
  }

  const newId = await getNextId(db, "leads");
  const now = new Date();

  const newLead = {
    id: newId,
    name: session.name || "Ireland WhatsApp Candidate",
    phone: cleanPhone,
    email: session.email || "",
    status: "new-lead",
    source: "WhatsApp Ireland",
    leadSource: "WhatsApp Ireland",
    interestedCountry: "Ireland",
    country: session.countryName,
    history: [
      {
        action: "created_via_whatsapp_ireland",
        performedByName: "WhatsApp Ireland Bot",
        timestamp: now,
        details: "Candidate initiated inquiry on Ireland WhatsApp channel.",
      },
    ],
    notes: [],
    createdAt: now,
    updatedAt: now,
    ...additionalData,
  };

  await db.collection("leads").insertOne(newLead as any);
  return newId;
}

/**
 * Sends initial welcome sequence for Ireland
 */
export async function sendInitialWelcome(phone: string, candidateName?: string): Promise<void> {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  const nameSalutation = candidateName && candidateName !== "Candidate" ? `Hi ${candidateName}! ` : "Hi! ";

  const welcomeText =
    `${nameSalutation}Welcome to **The Migration School (TMS Visa)** — European & Ireland Migration Support! 🇮🇪\n\n` +
    `Are you interested in living and working in Ireland under the **Ireland Employer Sponsored Work Visa** (Critical Skills & General Employment)?\n\n` +
    `• Irish employer covers your **€1,000 Work Permit fee + €60 Visa fee** and flight tickets! ✈️\n` +
    `• **FREE** English communication coaching & Interview Preparation included in your enrollment.\n` +
    `• Direct PR pathway to **Stamp 4** after just 2 years.\n` +
    `• 100% Money-Back Guarantee if visa rejected for any reason.\n\n` +
    `Tap below to get started:`;

  await sendQuickReplyButtons(cleanPhone, welcomeText, [
    { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
    { id: "BTN_IRELAND_NO", title: "Not Right Now" },
  ]);
}

/**
 * Sends consultation booking prompt with weekend slots
 */
export async function sendConsultationBookingPrompt(phone: string): Promise<void> {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  const { db } = await connectToDatabase();
  const session = await getOrCreateSession(db, cleanPhone);

  const weekends = getUpcomingWeekendDays(10);
  const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);

  const sections = [
    {
      title: "Available Consultation Dates",
      rows: weekends.slice(0, 10).map((w) => ({
        id: `SELECT_DAY_${w.date}`,
        title: w.displayLabel.slice(0, 24),
        description: `Window: ${candWindow.displayWindow}`.slice(0, 72),
      })),
    },
  ];

  await sendInteractiveList(
    cleanPhone,
    "Ireland 1-on-1 Consultation",
    `Speak directly with our **Senior Ireland Migration Expert** to assess your eligibility for Irish employer sponsorship! 🇮🇪\n\n` +
    `All sessions are 100% free and conducted via Google Meet in your local timezone (${candWindow.tzShort}).\n\n` +
    `Please select a convenient weekend date below:`,
    "Choose Date 📅",
    sections
  );

  await updateSession(db, cleanPhone, {
    currentStep: "SELECTING_DAY",
  });
}

/**
 * Master message processor for incoming Ireland WhatsApp messages
 */
export async function processIncomingWhatsAppMessage(params: {
  phone: string;
  senderName: string;
  messageType: "text" | "interactive_button" | "interactive_list";
  textBody?: string;
  selectedId?: string;
}): Promise<void> {
  const { phone, senderName, messageType: _messageType, textBody, selectedId } = params;
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");

  const { connectToDatabase } = await import("@/lib/mongodb");
  const { db } = await connectToDatabase();

  const session = await getOrCreateSession(db, cleanPhone, senderName);
  const now = new Date();

  const cleanActionId = selectedId?.trim() || "";
  const rawText = (textBody || "").trim();
  const lowerText = rawText.toLowerCase();

  // =========================================================================
  // --- EXISTING LEAD DUPLICATE CHECK ---
  // If this phone number already exists as a CRM lead with a meaningful status,
  // send a "we already have your details" message and skip the bot flow.
  // Only triggers on first-ever message (new session just created < 60s ago).
  // =========================================================================
  const isNewIrelandSession =
    session.createdAt &&
    new Date().getTime() - new Date(session.createdAt).getTime() < 60_000;

  if (isNewIrelandSession && session.leadId) {
    const existingCrmLead = await db.collection("leads").findOne({ id: session.leadId });
    const advancedStatuses = [
      "meeting-scheduled",
      "follow-up",
      "sales",
      "payment-pending",
      "document-pending",
      "call-back",
    ];
    if (existingCrmLead && advancedStatuses.includes(existingCrmLead.status)) {
      const salutation =
        session.name && session.name !== "Candidate"
          ? `Hi ${session.name}! 👋`
          : "Hi there! 👋";
      const duplicateMsg =
        `${salutation}\n\n` +
        `We already have your details in our system. 📋\n\n` +
        `Our team will shortly call you to assist with your Ireland work visa enquiry. 🇮🇪\n\n` +
        `If you have any urgent questions in the meantime, please feel free to message us here!`;
      await sendTextMessage(cleanPhone, duplicateMsg);
      return;
    }
  }

  // 1. Interactive Button Handling
  if (
    cleanActionId === "BTN_IRELAND_YES" ||
    lowerText === "yes" ||
    lowerText === "yes, interested" ||
    lowerText === "interested"
  ) {
    const videoUrl = getVideoIrelandUrl();
    await sendVideoMessage(
      cleanPhone,
      videoUrl,
      `Here is our quick 2-minute explainer video on how the **Ireland Employer Sponsored Work Visa** works! 🎬🇮🇪\n\n` +
      `Watch how approved Irish employers sponsor candidates, cover €1,000 permit fees, and pave the way to Stamp 4 PR.`
    );

    await delay(1200);

    await sendTextMessage(
      cleanPhone,
      `Please reply with your **Email Address** 📩 so we can send you our comprehensive Ireland Work Visa Guide and Occupation List.`
    );

    await updateSession(db, cleanPhone, {
      currentStep: "AWAITING_EMAIL",
      videoSentAt: now,
      consultationPromptDueAt: new Date(now.getTime() + 10 * 60 * 1000), // 10 min prompt
    });
    return;
  }

  if (
    cleanActionId === "BTN_IRELAND_NO" ||
    cleanActionId === "BTN_CONSULT_NO"
  ) {
    await sendTextMessage(
      cleanPhone,
      `No problem at all! We'll be here whenever you are ready to explore your career in Ireland. 🇮🇪\n\n` +
      `Feel free to message us here anytime if you have questions.`
    );

    await updateSession(db, cleanPhone, {
      currentStep: "COLD",
    });
    return;
  }

  if (
    cleanActionId === "BTN_CONSULT_YES" ||
    cleanActionId === "BTN_BOOK_MEETING" ||
    lowerText.includes("book consultation") ||
    lowerText.includes("book meeting")
  ) {
    await sendConsultationBookingPrompt(cleanPhone);
    return;
  }

  // 2. Date Selection (SELECT_DAY_YYYY-MM-DD or RESCHEDULE_DAY_YYYY-MM-DD)
  if (cleanActionId.startsWith("SELECT_DAY_") || cleanActionId.startsWith("RESCHEDULE_DAY_")) {
    const dateStr = cleanActionId.replace("SELECT_DAY_", "").replace("RESCHEDULE_DAY_", "");
    const availableSlots = await getAvailableWeekendSlots({
      db,
      meetingDate: dateStr,
      candidateTimeZone: session.timeZone,
      candidateTimeLabel: session.timeZoneLabel,
    });

    if (availableSlots.length === 0) {
      await sendTextMessage(
        cleanPhone,
        `All slots for ${dateStr} are currently booked. Please select another weekend date: `
      );
      await sendConsultationBookingPrompt(cleanPhone);
      return;
    }

    const slotRows = buildSlotRows(availableSlots, dateStr, session.timeZoneLabel);
    const sections = [
      {
        title: "Available Time Slots",
        rows: slotRows,
      },
    ];

    await sendInteractiveList(
      cleanPhone,
      "Choose Consultation Slot",
      `Available times on **${availableSlots[0].dayLabel}** in your local timezone (${session.timeZoneLabel}):`,
      "Select Time ⏰",
      sections
    );

    await updateSession(db, cleanPhone, {
      currentStep: "SELECTING_SLOT",
      activeSlotsDate: dateStr,
    });
    return;
  }

  // 3. Slot Selection (SLOT_date_istStart_candStart)
  if (cleanActionId.startsWith("SLOT_")) {
    const parts = cleanActionId.split("_");
    const meetingDate = parts[1];
    const istStart = parts[2];
    const candStart = parts[3];

    // Compute end times (1-hour interval)
    const istHour = parseInt(istStart.split(":")[0], 10);
    const istEnd = `${String(istHour + 1).padStart(2, "0")}:00`;

    const candEndObj = convertIstSlotToCandidateTime(meetingDate, istEnd, session.timeZone);
    const candStartObj = convertIstSlotToCandidateTime(meetingDate, istStart, session.timeZone);

    const candidateTimeLabel = `${candStartObj.display12h} - ${candEndObj.display12h} (${session.timeZoneLabel})`;
    const istTimeLabel = `${istStart} - ${istEnd} IST`;

    // Confirm slot in DB
    const bookedSlotInfo = {
      date: meetingDate,
      candidateTime: candStart,
      candidateTimeLabel,
      istTime: istStart,
      istTimeLabel,
      meetingUserId: 0,
      meetingUserName: "TMS Senior Ireland Expert",
    };

    const meetLink = getStaticGoogleMeetLink();

    await updateSession(db, cleanPhone, {
      currentStep: "BOOKED",
      meetingStatus: "booked",
      meetingBookedAt: now,
      bookedSlot: bookedSlotInfo,
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
    });

    const leadId = await ensureLeadExists(db, session, {
      status: "meeting-scheduled",
      meetingDetails: {
        meetingDate,
        startTime: istStart,
        endTime: istEnd,
        meetingLink: meetLink,
        status: "scheduled",
        candidateTime: candidateTimeLabel,
        channel: "WhatsApp Ireland",
      },
    });

    await updateSession(db, cleanPhone, { leadId });

    // Send confirmation message to candidate with Google Meet link
    const confirmMessage =
      `🎉 **Your Ireland Consultation is Confirmed!**\n\n` +
      `📅 **Date:** ${meetingDate}\n` +
      `⏰ **Your Local Time:** ${candidateTimeLabel}\n` +
      `👨‍💼 **Expert:** Senior Ireland Migration Counselor\n` +
      `🔗 **Google Meet Link:** ${meetLink}\n\n` +
      `Our expert will walk you through the complete process — from CV to work permit to flight tickets. 🇮🇪\n\n` +
      `In the meantime, feel free to upload your CV here for prior review! 📄`;

    await sendTextMessage(cleanPhone, confirmMessage);
    return;
  }

  // 4. Email Address Detection
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    const extractedEmail = emailMatch[0].toLowerCase();

    await updateSession(db, cleanPhone, {
      email: extractedEmail,
      currentStep: "AWAITING_CONSULTATION_DECISION",
    });

    const leadId = await ensureLeadExists(db, session, { email: extractedEmail });

    // Send Ireland information email pack
    await sendWhatsAppIrelandInfoEmail({
      phone: cleanPhone,
      name: session.name,
      email: extractedEmail,
      leadId,
    });

    await sendTextMessage(
      cleanPhone,
      `Thank you! 📩 We have dispatched the **Ireland Work Visa Information Pack** to **${extractedEmail}**.\n\n` +
      `It includes:\n` +
      `• 2-stage milestone fees (€300 to start / €700 only after visa approval)\n` +
      `• 3-Way eligibility check (Critical Skills CSOL & General GEP — min 2 yrs experience)\n` +
      `• Irish employer sponsorship process & Occupation Lists\n` +
      `• FREE Interview Preparation & English communication coaching\n` +
      `• Stamp 4 PR roadmap & CSEP benefits\n` +
      `• 100% Money-Back Guarantee terms`
    );

    await delay(1200);

    // Prompt for 1-on-1 consultation
    await sendConsultationBookingPrompt(cleanPhone);
    return;
  }

  // 5. Intelligent AI Reasoning
  try {
    const aiResponse = await generateAiResponse({
      message: rawText,
      session,
    });

    if (aiResponse) {
      await sendTextMessage(cleanPhone, aiResponse);
    }
  } catch (aiErr) {
    console.error(`[WhatsApp Ireland StateMachine AI Error] +${cleanPhone}:`, aiErr);
    await sendTextMessage(
      cleanPhone,
      `Thank you for your message! Our Ireland migration counseling team has received your inquiry and will review your profile shortly. 🇮🇪`
    );
  }
}
