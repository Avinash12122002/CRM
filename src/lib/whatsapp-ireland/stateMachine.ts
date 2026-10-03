import { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { WhatsAppSession, WhatsAppStep, MeetingHistoryItem, WeekendSlot } from "./types";
import {
  detectCountryFromPhone,
  convertIstSlotToCandidateTime,
  extractShortTimezone,
  findCountryByNameOrCode,
  format12hTime,
  getNext10AmInTimezone,
  getCandidateConsultationWindow,
} from "./timezone";
import {
  getUpcomingWeekdays,
  getAvailableWeekdaySlots,
  findNextAvailableWeekday,
  formatSlotsOverview,
} from "./slots";
import type { WeekdayOption } from "./types";
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
    "https://tmsvisa.com/ireland-work-visa-process"
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
 * Returns a clean, displayable candidate name.
 * Filters out placeholder strings like "Candidate", "at", names <= 2 chars, test strings, and emails.
 */
export function getSafeCandidateDisplayName(name?: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === "candidate" ||
    lower === "at" ||
    trimmed.length <= 2 ||
    lower.includes("test") ||
    lower.includes("@")
  ) {
    return "";
  }
  return trimmed;
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
    if (!existing.name || existing.name === "Candidate" || existing.name === "at" || existing.name.trim().length <= 2 || existing.name.toLowerCase().includes("test")) {
      const realCandidateName =
        candidateName && candidateName !== "Candidate" && candidateName !== "at" && candidateName.trim().length > 2 && !candidateName.toLowerCase().includes("test")
          ? candidateName.trim()
          : undefined;

      let foundName = realCandidateName;
      if (!foundName) {
        const lastLog = await db.collection("whatsapp_ireland_incoming_logs").findOne({
          phone: cleanPhone,
          senderName: { $exists: true, $nin: ["Candidate", "candidate", "at", ""] },
        });
        if (lastLog?.senderName && lastLog.senderName !== "at" && lastLog.senderName.trim().length > 2) {
          foundName = lastLog.senderName.trim();
        }
      }

      if (foundName) {
        existing.name = foundName;
        await db.collection(SESSIONS_COLLECTION).updateOne(
          { phone: cleanPhone },
          { $set: { name: foundName, updatedAt: now } }
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

      existing.crmStatus = lead.status;
      existing.meetingCompleted = lead.meetingStatus === "completed" || lead.status === "follow-up";
      existing.paymentPending = lead.status === "payment-pending";
      existing.documentPending = lead.status === "document-pending";
      if (lead.meetingStatus) existing.meetingStatus = lead.meetingStatus;
      if (lead.status === "meeting-scheduled" && !existing.meetingStatus) existing.meetingStatus = "booked";

      // Extract occupations
      const leadOccs: string[] = [];
      if (Array.isArray(lead.occupations) && lead.occupations.length > 0) {
        leadOccs.push(...lead.occupations.filter((o: any) => typeof o === "string" && o.trim()));
      } else if (typeof lead.occupations === "string" && (lead.occupations as string).trim()) {
        leadOccs.push((lead.occupations as string).trim());
      }
      if (lead.jobApplied && !leadOccs.includes(lead.jobApplied)) {
        leadOccs.push(lead.jobApplied);
      }
      if (lead.occupation && !leadOccs.includes(lead.occupation)) {
        leadOccs.push(lead.occupation);
      }
      if (leadOccs.length > 0) {
        existing.occupations = leadOccs;
        if (!existing.occupation) existing.occupation = leadOccs[0];
      }

      if (lead.experience && !existing.yearsExperience) existing.yearsExperience = lead.experience;
      if (lead.email && !existing.email) existing.email = lead.email;
      if (lead.meetingCompletedAt) existing.meetingCompletedAt = lead.meetingCompletedAt;
      if (lead.meetingCancelledAt) existing.meetingCanceledAt = lead.meetingCancelledAt;
      if (lead.meetingDetails) existing.crmMeetingDetails = lead.meetingDetails;
      if (lead.callbackDate) existing.crmCallbackDate = lead.callbackDate;
      if (lead.assignedTo) existing.crmAssignedTo = lead.assignedTo;
      if (lead.assignedToName) existing.crmAssignedToName = lead.assignedToName;
      if (Array.isArray(lead.notes) && lead.notes.length > 0) {
        existing.crmNotes = lead.notes.map((n: any) => (typeof n === "string" ? n : n.note || "")).filter(Boolean);
      }

      if (lead.country && (!existing.countryName || existing.countryName === "International")) {
        const matchCountry = findCountryByNameOrCode(lead.country);
        if (matchCountry) {
          existing.countryCode = matchCountry.countryCode;
          existing.countryName = matchCountry.countryName;
          existing.timeZone = matchCountry.timeZone;
          existing.timeZoneLabel = matchCountry.label;
        }
      }

      // CRITICAL: Stop 7-day follow-ups for candidates already in active CRM stages!
      const EXCLUDED_CRM_STATUSES = [
        "meeting-scheduled",
        "follow-up",
        "sales",
        "payment-pending",
        "document-pending",
        "call-back",
      ];
      if (lead.status && EXCLUDED_CRM_STATUSES.includes(lead.status.toLowerCase().trim())) {
        existing.nextFollowupAt = undefined;
        await db.collection(SESSIONS_COLLECTION).updateOne(
          { phone: cleanPhone },
          {
            $unset: { nextFollowupAt: "" },
            $set: { crmStatus: lead.status, updatedAt: now },
          }
        );
      }
    }

    if (!existing.bookedSlot) {
      const last10 = cleanPhone.slice(-10);
      const activeSlot = await db.collection("meetingSlots").findOne({
        status: "scheduled",
        $or: [
          { phone: cleanPhone },
          { phone: `+${cleanPhone}` },
          ...(last10.length === 10 ? [{ phone: last10 }, { phone: `+91${last10}` }, { phone: { $regex: `${last10}$` } }] : []),
        ],
      });
      if (activeSlot) {
        const slotTz = existing.timeZone || country.timeZone;
        const candSlotStart = activeSlot.candidateLocalTime
          ? { candidateTime: activeSlot.candidateLocalTime, display12h: format12hTime(activeSlot.candidateLocalTime) }
          : convertIstSlotToCandidateTime(activeSlot.meetingDate, activeSlot.startTime, slotTz);
        const candSlotEnd = activeSlot.candidateLocalEndTime
          ? { candidateTime: activeSlot.candidateLocalEndTime, display12h: format12hTime(activeSlot.candidateLocalEndTime) }
          : convertIstSlotToCandidateTime(activeSlot.meetingDate, activeSlot.endTime, slotTz);
        const slotTzShort = extractShortTimezone(existing.timeZoneLabel || country.label);
        const isIndia = (existing.countryCode || country.countryCode) === "IN";
        const candLabel = isIndia
          ? `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)} IST`
          : `${candSlotStart.display12h} - ${candSlotEnd.display12h} (${slotTzShort})`;

        existing.bookedSlot = {
          date: activeSlot.meetingDate,
          candidateTime: candSlotStart.candidateTime,
          candidateTimeLabel: activeSlot.candidateDisplayLabel || candLabel,
          istTime: activeSlot.startTime,
          istTimeLabel: `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)} IST`,
          meetingUserId: activeSlot.meetingUserId || 0,
          meetingUserName: activeSlot.meetingUserName || "TMS Senior Ireland Expert",
        };
        existing.meetingStatus = "booked";
        if (existing.currentStep === "WELCOME" || existing.currentStep === "AWAITING_EMAIL") {
          existing.currentStep = "BOOKED";
        }
      }
    }

    if (!existing.meetingStatus) existing.meetingStatus = existing.bookedSlot ? "booked" : "none";
    if (!existing.meetingHistory) existing.meetingHistory = [];
    return existing;
  }

  // Lookup existing CRM lead
  const cleanLast10 = cleanPhone.slice(-10);
  const existingLead = await db.collection("leads").findOne({
    $or: [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
      ...(cleanLast10.length === 10 ? [{ phone: cleanLast10 }, { phone: `+91${cleanLast10}` }, { phone: { $regex: `${cleanLast10}$` } }] : []),
    ],
  });

  const resolvedName =
    existingLead?.name && !existingLead.name.toLowerCase().includes("test")
      ? existingLead.name
      : candidateName && candidateName !== "Candidate" && !candidateName.toLowerCase().includes("test")
      ? candidateName
      : "Candidate";

  const leadOccsNew: string[] = [];
  if (Array.isArray(existingLead?.occupations) && existingLead.occupations.length > 0) {
    leadOccsNew.push(...existingLead.occupations.filter((o: any) => typeof o === "string" && o.trim()));
  } else if (typeof existingLead?.occupations === "string" && (existingLead.occupations as string).trim()) {
    leadOccsNew.push((existingLead.occupations as string).trim());
  }
  if (existingLead?.jobApplied && !leadOccsNew.includes(existingLead.jobApplied)) {
    leadOccsNew.push(existingLead.jobApplied);
  }
  if (existingLead?.occupation && !leadOccsNew.includes(existingLead.occupation)) {
    leadOccsNew.push(existingLead.occupation);
  }

  const isExcludedNewLead =
    existingLead?.status &&
    ["meeting-scheduled", "follow-up", "sales", "payment-pending", "document-pending", "call-back"].includes(
      existingLead.status.toLowerCase().trim()
    );

  // Check if an active meeting slot exists for this phone number
  const activeSlotNew = await db.collection("meetingSlots").findOne({
    status: "scheduled",
    $or: [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
      ...(cleanLast10.length === 10 ? [{ phone: cleanLast10 }, { phone: `+91${cleanLast10}` }, { phone: { $regex: `${cleanLast10}$` } }] : []),
    ],
  });

  let bookedSlotNew: WhatsAppSession["bookedSlot"] = undefined;
  if (activeSlotNew) {
    const candSlotStart = activeSlotNew.candidateLocalTime
      ? { candidateTime: activeSlotNew.candidateLocalTime, display12h: format12hTime(activeSlotNew.candidateLocalTime) }
      : convertIstSlotToCandidateTime(activeSlotNew.meetingDate, activeSlotNew.startTime, country.timeZone);
    const candSlotEnd = activeSlotNew.candidateLocalEndTime
      ? { candidateTime: activeSlotNew.candidateLocalEndTime, display12h: format12hTime(activeSlotNew.candidateLocalEndTime) }
      : convertIstSlotToCandidateTime(activeSlotNew.meetingDate, activeSlotNew.endTime, country.timeZone);
    const slotTzShort = extractShortTimezone(country.label);
    const isIndia = country.countryCode === "IN";
    const candLabel = isIndia
      ? `${format12hTime(activeSlotNew.startTime)} - ${format12hTime(activeSlotNew.endTime)} IST`
      : `${candSlotStart.display12h} - ${candSlotEnd.display12h} (${slotTzShort})`;

    bookedSlotNew = {
      date: activeSlotNew.meetingDate,
      candidateTime: candSlotStart.candidateTime,
      candidateTimeLabel: activeSlotNew.candidateDisplayLabel || candLabel,
      istTime: activeSlotNew.startTime,
      istTimeLabel: `${format12hTime(activeSlotNew.startTime)} - ${format12hTime(activeSlotNew.endTime)} IST`,
      meetingUserId: activeSlotNew.meetingUserId || 0,
      meetingUserName: activeSlotNew.meetingUserName || "TMS Senior Ireland Expert",
    };
  }

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: resolvedName,
    email: existingLead?.email,
    countryCode: country.countryCode,
    countryName: country.countryName,
    interestedCountry: "Ireland",
    timeZone: country.timeZone,
    timeZoneLabel: country.label,
    currentStep: bookedSlotNew ? "BOOKED" : "WELCOME",
    leadId: existingLead?.id,
    followupCount: 0,
    nextFollowupAt: isExcludedNewLead || bookedSlotNew ? undefined : undefined,
    crmStatus: existingLead?.status,
    crmAssignedTo: existingLead?.assignedTo,
    crmAssignedToName: existingLead?.assignedToName,
    crmCallbackDate: existingLead?.callbackDate,
    crmMeetingDetails: existingLead?.meetingDetails,
    crmNotes: Array.isArray(existingLead?.notes)
      ? existingLead.notes.map((n: any) => (typeof n === "string" ? n : n.note || "")).filter(Boolean)
      : undefined,
    occupations: leadOccsNew.length > 0 ? leadOccsNew : undefined,
    occupation: leadOccsNew[0] || existingLead?.occupation,
    yearsExperience: existingLead?.experience,
    meetingCompleted: existingLead?.meetingStatus === "completed" || existingLead?.status === "follow-up",
    paymentPending: existingLead?.status === "payment-pending",
    documentPending: existingLead?.status === "document-pending",
    meetingStatus: bookedSlotNew ? "booked" : (existingLead?.meetingStatus as any) || "none",
    bookedSlot: bookedSlotNew,
    meetingHistory: [],
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
  const setObj: Record<string, any> = { updatedAt: new Date() };
  const unsetObj: Record<string, any> = {};

  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) {
      unsetObj[k] = "";
    } else {
      setObj[k] = v;
    }
  }

  const updateDoc: Record<string, any> = { $set: setObj };
  if (Object.keys(unsetObj).length > 0) {
    updateDoc.$unset = unsetObj;
  }

  await db
    .collection(SESSIONS_COLLECTION)
    .updateOne({ phone: cleanPhone }, updateDoc);
}

/**
 * Append an entry to meeting history in whatsapp_ireland_sessions
 */
export async function appendMeetingHistory(
  db: Db,
  phone: string,
  historyItem: MeetingHistoryItem,
): Promise<void> {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  await db.collection(SESSIONS_COLLECTION).updateOne(
    { phone: cleanPhone },
    {
      $push: { meetingHistory: historyItem } as any,
      $set: { updatedAt: new Date() },
    },
  );
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

/**
 * Parses user message text to detect whether candidate mentioned a specific upcoming weekend date.
 * Matches ISO dates, formatted dates (e.g. "27 sep", "28th september"), slash dates ("27/9"),
 * or single day numbers if candidate is actively in the SELECTING_DAY step.
 */
export function matchWeekendDateFromText(
  text: string,
  upcomingWeekends: WeekdayOption[],
  isSelectingDayStep: boolean = false
): string | null {
  const clean = text.toLowerCase().trim();

  // 1. Direct ISO match (e.g. "2026-09-27")
  for (const w of upcomingWeekends) {
    if (clean.includes(w.date)) return w.date;
  }

  // 2. Day number + month match (e.g. "27 sep", "27th september", "sep 27", "27/9")
  for (const w of upcomingWeekends) {
    const parts = w.date.split("-");
    const month = parts[1];
    const day = parts[2];
    const dayNum = parseInt(day, 10).toString();
    const monthNum = parseInt(month, 10).toString();

    const shortMonths = Object.keys(MONTH_MAP).filter((k) => k.length === 3 && MONTH_MAP[k] === month);
    const longMonths = Object.keys(MONTH_MAP).filter((k) => k.length > 3 && MONTH_MAP[k] === month);
    const monthVariants = [...shortMonths, ...longMonths];

    for (const mName of monthVariants) {
      const rx1 = new RegExp(`\\b${dayNum}(?:st|nd|rd|th)?\\s*(?:of\\s*)?${mName}\\b`, "i");
      const rx2 = new RegExp(`\\b${mName}\\s*${dayNum}(?:st|nd|rd|th)?\\b`, "i");
      if (rx1.test(clean) || rx2.test(clean)) {
        return w.date;
      }
    }

    const rxDateSlash = new RegExp(`\\b${dayNum}[/-]0?${monthNum}\\b`);
    if (rxDateSlash.test(clean)) {
      return w.date;
    }
  }

  // 3. If candidate is actively in SELECTING_DAY step and typed just the day of month (e.g. "27" or "28")
  if (isSelectingDayStep) {
    const dayOnlyMatch = clean.match(/\b(0?[1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)?\b/);
    if (dayOnlyMatch) {
      const dayVal = parseInt(dayOnlyMatch[1], 10);
      const matched = upcomingWeekends.find((w) => {
        const d = parseInt(w.date.split("-")[2], 10);
        return d === dayVal;
      });
      if (matched) return matched.date;
    }
  }

  return null;
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
    const updateFields: Record<string, unknown> = {
      ...additionalData,
      updatedAt: new Date(),
    };
    if (!existing.interestedCountry) {
      updateFields.interestedCountry = "Ireland";
    }
    await db.collection("leads").updateOne(
      { id: existing.id },
      {
        $set: updateFields,
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

  const ACTIVE_CRM_STATUSES = [
    "meeting-scheduled",
    "follow-up",
    "sales",
    "payment-pending",
    "document-pending",
    "call-back",
  ];
  if (
    (session.crmStatus && ACTIVE_CRM_STATUSES.includes(session.crmStatus.toLowerCase().trim())) ||
    session.meetingCompleted ||
    session.bookedSlot
  ) {
    // Already an active CRM lead — do not prompt to book!
    return;
  }

  const weekdays = getUpcomingWeekdays(5);
  const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);

  const sections = [
    {
      title: "Available Consultation Dates",
      rows: weekdays.slice(0, 5).map((w) => ({
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
    `Please select a convenient weekday (Mon–Fri) below:`,
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

  let cleanActionId = selectedId?.trim() || "";
  const rawText = (textBody || "").trim();
  const lowerText = rawText.toLowerCase();

  // =========================================================================
  // --- EXISTING LEAD DUPLICATE CHECK (IRELAND) ---
  // When an incoming message arrives, first check if this number / lead exists in the database.
  // If the candidate's phone number exists in CRM `leads`:
  // 1. If not yet notified, send: "We already have your details in our system. Our team will shortly call you..."
  // 2. Treat as an existing candidate (never ask for email, never prompt to book meeting).
  // If they DO NOT exist in the database, proceed with the existing process for new leads.
  // =========================================================================
  const last10 = cleanPhone.slice(-10);
  const phoneQueries: any[] = [
    { phone: cleanPhone },
    { phone: `+${cleanPhone}` },
  ];
  if (cleanPhone.length >= 8 && !isNaN(Number(cleanPhone))) {
    phoneQueries.push({ phone: Number(cleanPhone) });
  }
  if (last10.length === 10) {
    phoneQueries.push(
      { phone: last10 },
      { phone: `+91${last10}` },
      { phone: { $regex: `${last10}$` } }
    );
    if (!isNaN(Number(last10))) {
      phoneQueries.push({ phone: Number(last10) });
    }
  }
  if (session.leadId) {
    phoneQueries.push({ id: session.leadId });
  }

  const existingCrmLead = await db.collection("leads").findOne({ $or: phoneQueries });

  if (existingCrmLead) {
    // Keep session leadId and crmStatus in sync
    if (!session.leadId || session.crmStatus !== existingCrmLead.status) {
      session.leadId = existingCrmLead.id;
      session.crmStatus = existingCrmLead.status;
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        { $set: { leadId: existingCrmLead.id, crmStatus: existingCrmLead.status, updatedAt: new Date() } }
      );
    }

    // If not yet notified that they already exist in CRM, notify them immediately
    if (!session.existingLeadNotified) {
      const candidateDisplayName =
        session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
          ? session.name
          : existingCrmLead.name && existingCrmLead.name !== "Candidate" && !existingCrmLead.name.toLowerCase().includes("test")
            ? existingCrmLead.name
            : "there";

      const duplicateMsg =
        `Hi ${candidateDisplayName}! 👋\n\n` +
        `We already have your details in our system. 📋\n\n` +
        `Our team will shortly call you to assist with your Ireland work visa enquiry. 🇮🇪\n\n` +
        `If you have any urgent questions or updates in the meantime, please feel free to message us right here!`;

      session.existingLeadNotified = true;
      session.notifiedExistingLeadAt = new Date();
      session.crmStatus = existingCrmLead.status;
      session.leadId = existingCrmLead.id;

      await updateSession(db, cleanPhone, {
        existingLeadNotified: true,
        notifiedExistingLeadAt: new Date(),
        crmStatus: existingCrmLead.status,
        leadId: existingCrmLead.id,
      });

      await sendTextMessage(cleanPhone, duplicateMsg);
      return;
    }
  }

  // =========================================================================
  // --- PRIORITY CANDIDATE PROFILE UPDATES / REQUESTS (IRELAND) ---
  // Must execute BEFORE isCrmCandidate and conversational AI:
  // 1) Phone numbers are strictly frozen (CANNOT be changed via chat).
  // 2) Name and Email updates are 100% permitted and welcomed.
  // =========================================================================

  // Update state interceptor: AWAITING_NAME_UPDATE
  if (session.currentStep === "AWAITING_NAME_UPDATE" && rawText && !cleanActionId) {
    const prevStep = session.meetingCompleted
      ? "MEETING_COMPLETED"
      : session.bookedSlot
        ? "BOOKED"
        : ("AWAITING_CONSULTATION_DECISION" as any);

    const nameRegex = /^[A-Za-z\s'\-]{2,50}$/;
    const candidate = rawText.trim();
    const wordCount = candidate.split(/\s+/).length;

    if (nameRegex.test(candidate) && wordCount >= 1 && wordCount <= 5) {
      session.name = candidate;
      await updateSession(db, cleanPhone, { name: candidate, currentStep: prevStep });
      await db.collection("leads").updateMany(
        { $or: phoneQueries },
        { $set: { name: candidate, updatedAt: new Date() } }
      );
      const confirm = `✅ Got it! Your registered name has been updated to **${candidate}** in your official CRM profile. 📝\n\nIf anything else needs updating, just let me know! 😊🇮🇪`;
      await sendTextMessage(cleanPhone, confirm);
      return;
    } else {
      const retry = `⚠️ Please reply with your correct full name (e.g. "Rahul Sharma" or "Maria Santos") to update your profile.`;
      await sendTextMessage(cleanPhone, retry);
      return;
    }
  }

  // Update state interceptor: AWAITING_EMAIL_UPDATE
  if (session.currentStep === "AWAITING_EMAIL_UPDATE" && rawText && !cleanActionId) {
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const candidate = emailMatch ? emailMatch[0].toLowerCase() : rawText.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const prevStep = session.meetingCompleted
      ? "MEETING_COMPLETED"
      : session.bookedSlot
        ? "BOOKED"
        : ("AWAITING_CONSULTATION_DECISION" as any);

    if (emailRegex.test(candidate)) {
      session.email = candidate;
      await updateSession(db, cleanPhone, { email: candidate, currentStep: prevStep });
      await db.collection("leads").updateMany(
        { $or: phoneQueries },
        { $set: { email: candidate, updatedAt: new Date() } }
      );

      // Dispatch Ireland info email
      let emailDispatched = false;
      try {
        const { sendWhatsAppIrelandInfoEmail } = await import("./infoEmail");
        const sendRes = await sendWhatsAppIrelandInfoEmail({
          phone: cleanPhone,
          name: getSafeCandidateDisplayName(session.name) || "Applicant",
          email: candidate,
          leadId: session.leadId,
        });
        emailDispatched = sendRes.success === true;
      } catch (err) {
        console.error("[WhatsApp Ireland] Error sending info email after update:", err);
      }

      const confirm = emailDispatched
        ? `✅ Done! Your registered email has been updated to **${candidate}**.\n\nWe have immediately dispatched your official Ireland Work Visa Information Pack to your new email! 📩 Please check your inbox and spam folder.`
        : `✅ Done! Your registered email has been updated to **${candidate}** in your official CRM profile. 📝\n\nAll future official correspondence and visa documentation will be sent to this address. 🇮🇪`;

      await sendTextMessage(cleanPhone, confirm);
      return;
    } else {
      const retry = `⚠️ That doesn't look like a valid email address.\n\nPlease reply with your correct email (e.g. yourname@gmail.com) to update your profile.`;
      await sendTextMessage(cleanPhone, retry);
      return;
    }
  }

  // Priority Phone Change Refusal
  const digitsOnly = rawText.replace(/\D/g, "");
  const wantsPhoneChange =
    (lowerText.includes("change") && (lowerText.includes("phone") || lowerText.includes("number") || lowerText.includes("mobile") || lowerText.includes("contact") || lowerText.includes("whatsapp"))) ||
    (lowerText.includes("update") && (lowerText.includes("phone") || lowerText.includes("number") || lowerText.includes("mobile") || lowerText.includes("contact") || lowerText.includes("whatsapp"))) ||
    lowerText === "change number" ||
    lowerText === "change phone" ||
    lowerText === "change my number" ||
    lowerText === "change phone number" ||
    lowerText === "update number" ||
    lowerText.includes("different number") ||
    lowerText.includes("new number");

  const isBarePhoneNumber =
    digitsOnly.length >= 8 &&
    digitsOnly.length <= 15 &&
    /^\+?[\d\s\-()]+$/.test(rawText.trim()) &&
    session.currentStep !== "SELECTING_SLOT" &&
    session.currentStep !== "AWAITING_EMAIL" &&
    session.currentStep !== "AWAITING_EMAIL_UPDATE" &&
    session.currentStep !== "AWAITING_NAME_UPDATE";

  if (wantsPhoneChange || isBarePhoneNumber) {
    const safeName = getSafeCandidateDisplayName(session.name);
    const salutation = safeName ? `Hello ${safeName}! 👋\n\n` : `Hello! 👋\n\n`;
    const phoneNoChangeMsg =
      `${salutation}` +
      `Under our verification and compliance protocol, **your registered phone number cannot be changed** through this chat. 🔒\n\n` +
      `Your candidate dossier, consultation booking, and official CRM records are permanently linked to your verified WhatsApp account (+${cleanPhone}).\n\n` +
      `If you have switched to a new phone number:\n` +
      `• Please initiate a new message directly from your **new WhatsApp number** to connect your profile, OR\n` +
      `• Contact our administrative desk at **info@tmsvisa.com** for assistance.\n\n` +
      `💡 You can freely update your **Full Name** or **Email Address** anytime right here! How else may I assist you today? 🇮🇪`;

    await sendTextMessage(cleanPhone, phoneNoChangeMsg);
    return;
  }

  // Priority Name Change
  const explicitNamePatterns = [
    /^(?:(?:please\s+)?(?:change|update|correct|set)\s+(?:my\s+)?name\s+to|please\s+call\s+me|call\s+me)\s+([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){0,3})/i,
    /^(?:my\s+name\s+is|i\s+am|i'm|im|this\s+is)\s+([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){1,3})/i,
    /^(?:full\s+)?name\s*[:=\-]\s*([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){0,3})/i,
    /^([A-Za-z]{2,25}\s+[A-Za-z]{2,25})\s+(?:here|speaking)\b/i,
  ];
  let detectedName: string | undefined;
  for (const pat of explicitNamePatterns) {
    const match = rawText.match(pat);
    if (match && match[1]) {
      const pName = match[1].trim();
      const pLower = pName.toLowerCase();
      if (!pLower.includes("interested") && !pLower.includes("ireland") && !pLower.includes("applying") && !pLower.includes("eligible")) {
        detectedName = pName;
        break;
      }
    }
  }

  const wantsNameChange =
    (lowerText.includes("change") && (lowerText.includes("name") || lowerText.includes("naam"))) ||
    (lowerText.includes("update") && lowerText.includes("name")) ||
    (lowerText.includes("correct") && lowerText.includes("name")) ||
    (lowerText.includes("edit") && lowerText.includes("name")) ||
    lowerText === "i want to change my name" ||
    lowerText === "can i change my name" ||
    lowerText === "change name" ||
    lowerText === "name change" ||
    lowerText.includes("my name is not") ||
    lowerText.includes("my name is wrong") ||
    (lowerText.includes("wrong") && lowerText.includes("name"));

  if (detectedName && (wantsNameChange || lowerText.startsWith("my name is") || lowerText.startsWith("change name to") || lowerText.startsWith("update name to") || lowerText.startsWith("name:"))) {
    session.name = detectedName;
    await updateSession(db, cleanPhone, { name: detectedName });
    await db.collection("leads").updateMany(
      { $or: phoneQueries },
      { $set: { name: detectedName, updatedAt: new Date() } }
    );
    const confirmNameMsg =
      `✅ Thank you! I have updated your name to **${detectedName}** in your official CRM profile. 📝\n\n` +
      `How else can our team assist you with your Ireland Employer Sponsored Work Visa today? 🇮🇪`;
    await sendTextMessage(cleanPhone, confirmNameMsg);
    return;
  }

  if (wantsNameChange && !detectedName) {
    await updateSession(db, cleanPhone, { currentStep: "AWAITING_NAME_UPDATE" });
    const nameChangePrompt =
      `Certainly! You can update your name anytime right here in this chat. ✍️\n\n` +
      `Please reply with your **correct Full Name** (for example: *"My name is Rajesh Sharma"* or *"Name: Priya Patel"*), and I will update your official CRM profile immediately!`;
    await sendTextMessage(cleanPhone, nameChangePrompt);
    return;
  }

  // Priority Email Change
  const wantsEmailChange =
    (lowerText.includes("change") && (lowerText.includes("email") || lowerText.includes("mail"))) ||
    (lowerText.includes("update") && (lowerText.includes("email") || lowerText.includes("mail"))) ||
    (lowerText.includes("correct") && (lowerText.includes("email") || lowerText.includes("mail"))) ||
    (lowerText.includes("edit") && (lowerText.includes("email") || lowerText.includes("mail"))) ||
    lowerText === "i want to change my email" ||
    lowerText === "can i change my email" ||
    lowerText === "change email" ||
    lowerText === "email change" ||
    lowerText.includes("my email is not") ||
    lowerText.includes("my email is wrong") ||
    (lowerText.includes("wrong") && lowerText.includes("email")) ||
    (lowerText.includes("new") && lowerText.includes("email"));

  const directEmailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (directEmailMatch && (wantsEmailChange || lowerText.includes("email") || lowerText.includes("mail"))) {
    const newEmail = directEmailMatch[0].toLowerCase();
    session.email = newEmail;
    await updateSession(db, cleanPhone, { email: newEmail });
    await db.collection("leads").updateMany(
      { $or: phoneQueries },
      { $set: { email: newEmail, updatedAt: new Date() } }
    );

    let emailDispatched = false;
    try {
      const { sendWhatsAppIrelandInfoEmail } = await import("./infoEmail");
      const sendRes = await sendWhatsAppIrelandInfoEmail({
        phone: cleanPhone,
        name: getSafeCandidateDisplayName(session.name) || "Applicant",
        email: newEmail,
        leadId: session.leadId,
      });
      emailDispatched = sendRes.success === true;
    } catch (err) {
      console.error("[WhatsApp Ireland] Error sending info email after update:", err);
    }

    const confirmEmailMsg = emailDispatched
      ? `✅ Thank you! I have updated your registered email address to **${newEmail}** in our CRM profile and immediately dispatched your official **Ireland Work Visa Information Pack** to your inbox! 📩\n\n` +
        `📬 Please check both your **Inbox** and **Spam/Junk folder**.\n\n` +
        `Let us know if you need anything else! 🇮🇪`
      : `✅ Thank you! I have updated your registered email address to **${newEmail}** in our CRM profile. 📝\n\n` +
        `All official visa documentation will be sent to this address. Let us know if you need anything else! 🇮🇪`;

    await sendTextMessage(cleanPhone, confirmEmailMsg);
    return;
  }

  if (wantsEmailChange && !directEmailMatch) {
    await updateSession(db, cleanPhone, { currentStep: "AWAITING_EMAIL_UPDATE" });
    const emailChangePrompt =
      `Certainly! You can update your email address anytime right here. 📧\n\n` +
      `Please reply with your **new Email Address** (for example: *"My email is yourname@gmail.com"*), and I will update your official CRM profile and dispatch your visa information pack immediately!`;
    await sendTextMessage(cleanPhone, emailChangePrompt);
    return;
  }

  // --- Meeting Cancellation Request Check ---
  const isCancelRequest =
    cleanActionId === "CANCEL_MEETING" ||
    cleanActionId === "BTN_CANCEL_MEETING" ||
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

    // Release slot in meetingSlots collection
    try {
      await db.collection("meetingSlots").updateMany(
        {
          phone: session.phone,
          channel: "WhatsApp Ireland",
          status: "scheduled",
        },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
    } catch (slotErr) {
      console.warn("[WhatsApp Ireland] Could not release slot on cancel:", slotErr);
    }

    // Append to Meeting History
    const historyItem: MeetingHistoryItem = {
      action: "canceled",
      date: canceledSlot.date,
      candidateTime: canceledSlot.candidateTimeLabel,
      istTime: canceledSlot.istTimeLabel,
      timestamp: new Date(),
      reason: rawText || "Candidate requested cancellation via WhatsApp",
    };
    await appendMeetingHistory(db, session.phone, historyItem);

    // Update session in whatsapp_ireland_sessions
    await updateSession(db, session.phone, {
      meetingStatus: "canceled",
      meetingCanceledAt: new Date(),
      meetingCancellationReason: rawText || "Requested by candidate via WhatsApp",
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
              action: "meeting_cancelled_via_whatsapp_ireland",
              performedByName: "WhatsApp Ireland Bot",
              timestamp: new Date(),
              details: `Consultation on ${canceledSlot.date} at ${canceledSlot.istTimeLabel} cancelled by candidate`,
            } as any,
          },
        }
      );
    }

    const cancelMsg =
      `Hello ${session.name || "there"}! 👋\n\n` +
      `Your Ireland consultation meeting has been cancelled. ℹ️\n\n` +
      `Please reschedule your 1-on-1 session for an upcoming weekday so our senior expert can assess your Ireland Employer Sponsored Work Visa profile.\n\n` +
      `👉 Tap below to choose an available time slot:`;

    await sendQuickReplyButtons(session.phone, cancelMsg, [
      { id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" },
    ]);
    return;
  }

  // --- Reschedule Intent Check ---
  const isRescheduleIntent =
    cleanActionId === "BTN_RESCHEDULE" ||
    cleanActionId === "BTN_RESCHEDULE_MEETING" ||
    cleanActionId === "BTN_CHANGE_DATE" ||
    cleanActionId === "BTN_CHANGE_TIME" ||
    cleanActionId === "BTN_CHANGE_DAY" ||
    lowerText === "reschedule" ||
    lowerText === "reschedule meeting" ||
    lowerText === "reschedule consultation" ||
    lowerText === "change time" ||
    lowerText === "change date" ||
    lowerText === "change meeting" ||
    lowerText === "change my meeting" ||
    lowerText === "reschedule my meeting" ||
    lowerText === "change slot" ||
    (lowerText.includes("reschedule") &&
      (lowerText.includes("meeting") || lowerText.includes("consultation") || lowerText.includes("slot") || lowerText.includes("call")));

  if (isRescheduleIntent) {
    await sendConsultationBookingPrompt(cleanPhone);
    return;
  }

  // --- Text Weekday Date Matching ---
  const upcomingWeekdays = getUpcomingWeekdays(5);
  const matchedWeekendDate = matchWeekendDateFromText(
    rawText,
    upcomingWeekdays,
    session.currentStep === "SELECTING_DAY" || session.currentStep === "SELECTING_SLOT"
  );
  if (matchedWeekendDate) {
    cleanActionId = `SELECT_DAY_${matchedWeekendDate}`;
  }

  // --- Master Guard: Active CRM Candidates ---
  // If candidate is already in active CRM stages, do NOT run new lead intake flows (asking email, booking consultation)
  const ACTIVE_CRM_STATUSES = [
    "meeting-scheduled",
    "follow-up",
    "sales",
    "payment-pending",
    "document-pending",
    "call-back",
  ];
  const isCrmCandidate =
    (session.crmStatus && ACTIVE_CRM_STATUSES.includes(session.crmStatus.toLowerCase().trim())) ||
    (existingCrmLead && existingCrmLead.status && ACTIVE_CRM_STATUSES.includes(existingCrmLead.status.toLowerCase().trim())) ||
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.currentStep === "MEETING_COMPLETED";

  if (isCrmCandidate) {
    const safeDisplayName = getSafeCandidateDisplayName(session.name);
    const salutation = safeDisplayName ? `Hi ${safeDisplayName}! 👋` : "Hi! 👋";

    // If candidate clicks intake or booking buttons
    if (
      cleanActionId === "BTN_IRELAND_YES" ||
      cleanActionId === "BTN_CONSULT_YES" ||
      cleanActionId === "BTN_BOOK_MEETING" ||
      lowerText === "book" ||
      lowerText.includes("book consultation") ||
      lowerText.includes("book meeting")
    ) {
      let statusMsg = "";
      if (session.crmStatus === "meeting-scheduled") {
        const slotText = session.bookedSlot
          ? `scheduled for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**`
          : "already confirmed with our Senior Ireland Visa Expert";
        statusMsg =
          `${salutation}\n\n` +
          `Your Ireland 1-on-1 consultation session is ${slotText}! 📅🇮🇪\n\n` +
          `Our expert will discuss your eligibility across Critical Skills (CSEP) and General Permits (GEP). If you have any questions before then, feel free to ask right here!`;
      } else if (session.crmStatus === "sales") {
        statusMsg =
          `${salutation}\n\n` +
          `You are an enrolled client with TMS Visa! Your file is active with your dedicated Case Manager for Irish employer marketing. 💼🇮🇪\n\n` +
          `Feel free to message us right here if you have any questions!`;
      } else if (session.crmStatus === "payment-pending") {
        statusMsg =
          `${salutation}\n\n` +
          `Your Ireland consultation has been completed, and your onboarding is pending. 📄\n\n` +
          `If you have any questions about your agreement or payment, reply right here! 🇮🇪`;
      } else if (session.crmStatus === "document-pending") {
        statusMsg =
          `${salutation}\n\n` +
          `Your consultation is complete, and your file is in document verification. 📂\n\n` +
          `You can upload your documents (CV, passport, reference letters, educational certs) right here on WhatsApp!`;
      } else if (session.crmStatus === "call-back") {
        statusMsg =
          `${salutation}\n\n` +
          `Our Ireland counseling team already has a callback scheduled for you. 📞\n\n` +
          `Feel free to ask any question right here in chat! 🇮🇪`;
      } else {
        statusMsg =
          `${salutation}\n\n` +
          `Your Ireland consultation has already been completed! ✅\n\n` +
          `Our advisory team is following up on your application. How can we assist you today? 🇮🇪`;
      }

      await sendTextMessage(cleanPhone, statusMsg);
      return;
    }

    // Voice Note / Audio handling
    if (rawText === "[Voice Note / Audio]") {
      const voiceReply =
        `${salutation}\n\n` +
        `Thank you for your voice note! 🎙️ Our Ireland counseling desk has received it and our team will listen to it shortly.\n\n` +
        `If you have any urgent details, preferred callback timing, or documents (CV/passport) to share, please feel free to send them right here! 🇮🇪`;
      await sendTextMessage(cleanPhone, voiceReply);
      return;
    }

    // Callback timing preference (e.g. "Call me after 5 PM", "I am at work", "Call tomorrow", "WhatsApp only")
    const isCallbackPreference =
      (lowerText.includes("call me") ||
        lowerText.includes("call at") ||
        lowerText.includes("call after") ||
        lowerText.includes("call tomorrow") ||
        lowerText.includes("dont call") ||
        lowerText.includes("don't call") ||
        lowerText.includes("busy now") ||
        lowerText.includes("at work") ||
        lowerText.includes("message only") ||
        lowerText.includes("chat only") ||
        lowerText.includes("whatsapp only")) &&
      !lowerText.includes("video") &&
      !lowerText.includes("link");

    if (isCallbackPreference) {
      const noteText = `WhatsApp Ireland candidate callback preference: "${rawText.slice(0, 150)}"`;
      if (session.leadId) {
        await db.collection("leads").updateOne(
          { id: session.leadId },
          {
            $push: { notes: { note: noteText, createdAt: new Date(), createdBy: "WhatsApp Ireland Bot" } as any },
            $set: { callbackDate: rawText.slice(0, 80), updatedAt: new Date() },
          }
        );
      }
      await updateSession(db, cleanPhone, {
        crmCallbackDate: rawText.slice(0, 80),
        candidateNotes: [...(session.candidateNotes || []), noteText],
      });

      const callbackAck =
        `${salutation}\n\n` +
        `Thank you for letting us know! 📝 Our Ireland counseling desk has noted your preference: *"${rawText.slice(0, 100)}"*. Our team will respect your timing and reach out accordingly.\n\n` +
        `You can continue chatting with me here anytime if you have any questions! 🇮🇪`;

      await sendTextMessage(cleanPhone, callbackAck);
      return;
    }

    // Meeting schedule inquiry (e.g. "When is my meeting?", "What time is my call?", "When will team call?")
    const isAskingMeetingSchedule =
      (lowerText.includes("when is my meeting") ||
        lowerText.includes("what time is my meeting") ||
        lowerText.includes("meeting timing") ||
        lowerText.includes("meeting time") ||
        lowerText.includes("meeting date") ||
        lowerText.includes("when is my call") ||
        lowerText.includes("when will you call") ||
        lowerText.includes("when will team call") ||
        lowerText.includes("what time will you call")) &&
      !lowerText.includes("book") &&
      !lowerText.includes("reschedule");

    if (isAskingMeetingSchedule) {
      if (session.bookedSlot) {
        const meetTimeMsg =
          `${salutation}\n\n` +
          `📅 Your 1-on-1 Ireland consultation is scheduled for:\n\n` +
          `🗓️ **Date:** ${session.bookedSlot.date}\n` +
          `⏰ **Your Time:** ${session.bookedSlot.candidateTimeLabel || session.bookedSlot.istTimeLabel}\n` +
          `👨‍💼 **Expert:** Senior Ireland Migration Counselor\n` +
          `🔗 **Meet Link:** ${getStaticGoogleMeetLink()}\n\n` +
          `Please have your CV ready. See you then! 🇮🇪`;
        await sendTextMessage(cleanPhone, meetTimeMsg);
        return;
      } else if (session.crmMeetingDetails?.meetingDate) {
        const m = session.crmMeetingDetails;
        const meetTimeMsg =
          `${salutation}\n\n` +
          `📅 Your Ireland consultation is confirmed for:\n\n` +
          `🗓️ **Date:** ${m.meetingDate}\n` +
          `⏰ **Time:** ${m.candidateTime || `${m.startTime || ""} - ${m.endTime || ""}`}\n` +
          `🔗 **Link:** ${m.meetingLink || getStaticGoogleMeetLink()}\n\n` +
          `Our senior Ireland migration expert will connect with you then! 🇮🇪`;
        await sendTextMessage(cleanPhone, meetTimeMsg);
        return;
      } else {
        const callingSoonMsg =
          `${salutation}\n\n` +
          `Our Ireland counseling team typically calls during office hours (10:00 AM – 7:00 PM) in your timezone (${session.timeZoneLabel}).\n\n` +
          `If you have a preferred time to connect, simply reply with your convenient timing (e.g. "Call me after 5 PM") and we will arrange it! 🇮🇪`;
        await sendTextMessage(cleanPhone, callingSoonMsg);
        return;
      }
    }

    // Greeting handling for existing CRM candidate in Ireland
    const normalizedGreeting = lowerText.replace(/[^a-z]/g, "");
    const isGreeting =
      ["hi", "hello", "hey", "hell", "helo", "hlw", "heya", "start", "restart", "menu", "namaste", "hlo", "hii", "goodmorning", "goodevening", "goodafternoon"].includes(normalizedGreeting) ||
      lowerText.startsWith("hi ") ||
      lowerText.startsWith("hello ") ||
      lowerText.startsWith("hey ");

    if (isGreeting) {
      let stageDetail = "Your Ireland consultation has already been completed and your file is in progress.";
      if (session.crmStatus === "sales") {
        stageDetail = "Your file is active with your dedicated Case Manager for Irish employer marketing.";
      } else if (session.crmStatus === "document-pending") {
        stageDetail = "Your consultation is complete and your file is currently in document collection & verification.";
      } else if (session.crmStatus === "payment-pending") {
        stageDetail = "Your consultation is complete and your onboarding fee is currently pending.";
      } else if (session.crmStatus === "follow-up") {
        stageDetail = "Your consultation has been completed and our senior advisory team is following up on your application.";
      } else if (session.crmStatus === "call-back") {
        stageDetail = "Our Ireland counseling team already has a callback scheduled for you.";
      } else if (session.crmStatus === "meeting-scheduled") {
        stageDetail = "Your Ireland 1-on-1 consultation session is already scheduled in our system.";
      }

      const alreadyDoneGreeting =
        `${salutation}\n\n` +
        `Welcome back to The Migration School (TMS Visa) 🇮🇪.\n\n` +
        `${stageDetail} How can our team assist you today? Feel free to ask any question!`;

      await sendTextMessage(cleanPhone, alreadyDoneGreeting);
      return;
    }

    // Document checklist inquiry (e.g. "what documents", "what can I send", "send more")
    const isAskingDocsOrWhatToSend =
      lowerText.includes("send more") ||
      lowerText.includes("what more") ||
      lowerText.includes("what can i send") ||
      lowerText.includes("what else can i send") ||
      lowerText.includes("what documents") ||
      lowerText.includes("which documents") ||
      lowerText.includes("documents needed") ||
      lowerText.includes("what to send");

    if (isAskingDocsOrWhatToSend) {
      const docsHelpMsg =
        `${salutation}\n\n` +
        `Here are the essential documents you can share with our Ireland review team:\n\n` +
        `1️⃣ **Updated CV / Resume** (Word or PDF format)\n` +
        `2️⃣ **Valid Passport Copy** (Photo & address pages)\n` +
        `3️⃣ **Work Experience Proof** (Minimum 2 years of relevant experience via reference letters, relieving letters, or payslips)\n` +
        `4️⃣ **Educational Certificates** (Degree or Diploma transcripts)\n` +
        `5️⃣ **English Scorecard** (PTE/IELTS) if already taken (otherwise our free weekly coaching begins upon enrollment!)\n\n` +
        `You can upload any of these files right here in WhatsApp, and our team will review them! 🇮🇪`;

      await sendTextMessage(cleanPhone, docsHelpMsg);
      return;
    }

    // CV review status check
    if (session.cvReceivedAt) {
      const isCvStatusInquiry =
        lowerText.includes("cv status") ||
        lowerText.includes("resume status") ||
        lowerText.includes("checked my cv") ||
        lowerText.includes("check my cv") ||
        lowerText.includes("reviewed my cv") ||
        lowerText.includes("review my cv") ||
        lowerText.includes("did you see my cv");

      if (isCvStatusInquiry) {
        const cvUnderReviewMsg =
          `${salutation}\n\n` +
          `Thank you for checking in! Our Ireland review team is currently assessing your qualifications and work experience against the Ireland Critical Skills (CSEP) and General Employment (GEP) lists.\n\n` +
          `Once the review is completed, our team will reach out with the evaluation. 🇮🇪📞`;
        await sendTextMessage(cleanPhone, cvUnderReviewMsg);
        return;
      }
    }

    // Email Resend, "Send Me Email", Brochure, PDF, or "Did Not Receive" Email
    const isAskingIrelandEmail =
      lowerText.includes("send me email") ||
      lowerText.includes("send email") ||
      lowerText.includes("send me mail") ||
      lowerText.includes("send mail") ||
      lowerText.includes("resend") ||
      lowerText.includes("email me") ||
      lowerText.includes("mail me") ||
      lowerText.includes("email send") ||
      lowerText.includes("mail send") ||
      lowerText.includes("email bhejo") ||
      lowerText.includes("mail bhejo") ||
      lowerText.includes("send on email") ||
      lowerText.includes("did not receive") ||
      lowerText.includes("didn't receive") ||
      lowerText.includes("did not recieved") ||
      lowerText.includes("didn't recieved") ||
      lowerText.includes("not received") ||
      lowerText.includes("not recieved") ||
      lowerText.includes("not receive") ||
      lowerText.includes("haven't received") ||
      lowerText.includes("have not received") ||
      lowerText.includes("havent received") ||
      lowerText.includes("no mail") ||
      lowerText.includes("no email") ||
      lowerText.includes("mail nahi") ||
      lowerText.includes("email nahi") ||
      lowerText.includes("brochure") ||
      lowerText.includes("information pack") ||
      lowerText.includes("info pack") ||
      lowerText.includes("occupation list") ||
      lowerText.includes("critical skills list") ||
      (lowerText.includes("pdf") && (lowerText.includes("send") || lowerText.includes("give") || lowerText.includes("share") || lowerText.includes("email") || lowerText.includes("mail"))) ||
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(rawText.trim());

    if (isAskingIrelandEmail) {
      const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const targetEmail = emailMatch ? emailMatch[0].toLowerCase() : (session.email || existingCrmLead?.email);

      if (targetEmail) {
        if (emailMatch && session.email !== targetEmail) {
          session.email = targetEmail;
          await updateSession(db, cleanPhone, { email: targetEmail });
          if (existingCrmLead) {
            await db.collection("leads").updateOne(
              { id: existingCrmLead.id },
              { $set: { email: targetEmail, updatedAt: new Date() } }
            );
          }
        }

        const sendRes = await sendWhatsAppIrelandInfoEmail({
          phone: cleanPhone,
          name: session.name || existingCrmLead?.name || "Applicant",
          email: targetEmail,
          leadId: existingCrmLead?.id,
        });

        if (sendRes.success) {
          const successMsg =
            `✅ We have immediately sent the official **Ireland Work Visa Information Pack** to **${targetEmail}**! 📩🇮🇪\n\n` +
            `It includes:\n` +
            `• 2-stage milestone fees (€300 to start / €700 only after visa approval)\n` +
            `• 3-Way eligibility check (Critical Skills CSOL & General GEP)\n` +
            `• Irish employer sponsorship process & Occupation Lists\n` +
            `• FREE Interview Preparation & English communication coaching\n` +
            `• Stamp 4 PR roadmap & CSEP benefits\n\n` +
            `📬 *Please check both your Inbox and Spam/Junk folder.*\n\n` +
            `Need it sent to another email address? Just reply with your email! 📧`;
          await sendTextMessage(cleanPhone, successMsg);
          return;
        }
      } else {
        const askEmailMsg =
          `I would be delighted to send you the official Ireland Work Visa Information Pack! 📄🇮🇪\n\n` +
          `Please reply with your **Email Address** (e.g. name@gmail.com) so I can dispatch it to your inbox immediately. 📧`;
        await sendTextMessage(cleanPhone, askEmailMsg);
        return;
      }
    }

    // For ANY other inquiry or message from an active Ireland CRM candidate:
    // Pass directly to Context-Aware AI with Directive 0 (strictly forbidding asking for email or consultation booking)
    let aiAnswer = await generateAiResponse({
      message: rawText,
      session,
    });

    if (!aiAnswer || !aiAnswer.trim()) {
      aiAnswer =
        `${salutation}\n\n` +
        `Thank you for messaging The Migration School (TMS Visa) 🇮🇪.\n\n` +
        `Our Ireland advisory team has your details on file. How can we assist you with your Ireland Employer Sponsored Work Visa today? Feel free to ask any question about your profile, eligibility, or application!`;
    }

    await sendTextMessage(cleanPhone, aiAnswer);
    return;
  }

  // Greeting for new candidate: Send Welcome with Quick Reply Buttons
  const normalizedGreeting = lowerText.replace(/[^a-z]/g, "");
  const isCandidateGreeting =
    ["hi", "hello", "hey", "start", "restart", "menu", "namaste", "hlo", "hii", "goodmorning", "goodevening", "goodafternoon"].includes(normalizedGreeting) ||
    lowerText.startsWith("hi ") ||
    lowerText.startsWith("hello ") ||
    lowerText.startsWith("hey ");

  if (isCandidateGreeting && (session.currentStep === "WELCOME" || !session.videoSentAt)) {
    await sendInitialWelcome(cleanPhone, session.name);
    return;
  }

  // 1. Interactive Button Handling
  if (
    cleanActionId === "BTN_IRELAND_YES" ||
    lowerText === "yes" ||
    lowerText === "yes, interested" ||
    lowerText === "interested"
  ) {
    const videoUrl = getVideoIrelandUrl();
    const isDirectVideoFile = Boolean(videoUrl && videoUrl.match(/\.(mp4|mov|3gp|mkv)($|\?)/i));

    if (isDirectVideoFile) {
      await sendVideoMessage(
        cleanPhone,
        videoUrl,
        `Here is our quick 2-minute explainer video on how the **Ireland Employer Sponsored Work Visa** works! 🎬🇮🇪\n\n` +
        `Watch how approved Irish employers sponsor candidates, cover €1,000 permit fees, and pave the way to Stamp 4 PR.`
      );
    } else {
      const videoIntro =
        `🎥 *Ireland Work Visa — Process Guide Video* 🇮🇪\n\n` +
        `Here is our video explaining how approved Irish employers sponsor candidates, cover €1,000 permit fees, and pave the way to Stamp 4 PR:\n\n` +
        `▶️ *Watch the Video Here:*\n${videoUrl}\n\n` +
        `*(Tap the link above to watch the video anytime)*`;
      await sendTextMessage(cleanPhone, videoIntro);
    }

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
    const availableSlots = await getAvailableWeekdaySlots({
      db,
      meetingDate: dateStr,
      candidateTimeZone: session.timeZone,
      candidateTimeLabel: session.timeZoneLabel,
    });

    if (availableSlots.length === 0) {
      await sendTextMessage(
        cleanPhone,
        `All slots for ${dateStr} are currently booked. Please select another weekday date: `
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
    const istHour = parseInt(istStart.split(":")[0], 10);
    const istEnd = `${String(istHour + 1).padStart(2, "0")}:00`;

    // Double-booking collision check against meetingSlots (checks full 1-hour interval overlap)
    const existingSlot = await db.collection("meetingSlots").findOne({
      meetingDate,
      status: { $in: ["scheduled", "completed"] },
      $or: [
        { startTime: istStart },
        {
          startTime: { $lt: istEnd },
          endTime: { $gt: istStart },
        },
      ],
    });

    const isSameCandidateSameChannel =
      existingSlot &&
      existingSlot.phone === session.phone &&
      existingSlot.channel === "WhatsApp Ireland";

    if (existingSlot && !isSameCandidateSameChannel) {
      console.log(`[WhatsApp Ireland] Collision: slot ${meetingDate} ${istStart} is already booked by ${existingSlot.phone} (${existingSlot.channel || "WhatsApp"})`);

      const remainingSlots = await getAvailableWeekdaySlots({
        db,
        meetingDate,
        candidateTimeZone: session.timeZone,
        candidateTimeLabel: session.timeZoneLabel,
      });
      const availableRemaining = remainingSlots.filter((s) => s.available);

      if (availableRemaining.length > 0) {
        const isIndia = session.countryCode === "IN";
        const dayLabel = remainingSlots[0]?.dayLabel || meetingDate;
        const candObj = convertIstSlotToCandidateTime(meetingDate, istStart, session.timeZone);
        const bookedLabel = `${candObj.display12h} (${session.timeZoneLabel})`;

        const collisionMsg =
          `⚠️ That slot (**${bookedLabel}**) was just booked by another candidate!\n\n` +
          `All consultation slots are locked once reserved to avoid overlap. Please choose another available time:\n\n` +
          formatSlotsOverview({
            slots: availableRemaining,
            dayLabel,
            candidateTimeZoneLabel: session.timeZoneLabel,
            isIndia,
          });

        await sendTextMessage(session.phone, collisionMsg);
        return;
      } else {
        const nextWeekend = await findNextAvailableWeekday({
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
            `Here are all available consultation slots for the next available day on **${nextLabel}**:\n\n` +
            formatSlotsOverview({
              slots: nextWeekend.availableSlots,
              dayLabel: nextLabel,
              candidateTimeZoneLabel: session.timeZoneLabel,
              isIndia,
            });

          await sendTextMessage(session.phone, collisionMsg);
          return;
        } else {
          const fullText =
            `⚠️ That slot was just booked and upcoming weekday dates are currently full.\n\n` +
            `Would you like to review all upcoming dates across the month?`;
          await sendQuickReplyButtons(session.phone, fullText, [
            { id: "BTN_RESCHEDULE", title: "View All Dates" },
          ]);
          return;
        }
      }
    }

    // Cand times (1-hour interval computed earlier)

    const candEndObj = convertIstSlotToCandidateTime(meetingDate, istEnd, session.timeZone);
    const candStartObj = convertIstSlotToCandidateTime(meetingDate, istStart, session.timeZone);

    const isIndia = session.countryCode === "IN";
    const candidateTimeLabel = isIndia
      ? `${format12hTime(istStart)} - ${format12hTime(istEnd)} IST`
      : `${candStartObj.display12h} - ${candEndObj.display12h} (${session.timeZoneLabel})`;
    const istTimeLabel = `${format12hTime(istStart)} - ${format12hTime(istEnd)} IST`;

    // Look up Pearl (WM role) as the Ireland consultation meeting user
    const pearlUser = await db.collection("users").findOne({
      username: { $regex: /^pearl$/i },
    });
    const consultantId = pearlUser ? pearlUser.id : 1;
    const consultantName = pearlUser ? pearlUser.name : "Pearl";

    // Check if this candidate ALREADY had a scheduled slot for Ireland (rescheduling flow)
    const previousScheduledSlot = await db.collection("meetingSlots").findOne({
      phone: session.phone,
      channel: "WhatsApp Ireland",
      status: "scheduled",
    });
    const isReschedule = Boolean(previousScheduledSlot);
    let previousSlotDetails = "";

    if (previousScheduledSlot) {
      previousSlotDetails = `${previousScheduledSlot.meetingDate} at ${previousScheduledSlot.startTime} IST`;
      await db.collection("meetingSlots").deleteMany({
        phone: session.phone,
        channel: "WhatsApp Ireland",
        status: "scheduled",
      });
    }

    const meetLink = getStaticGoogleMeetLink();

    // Ensure lead exists
    const leadId = session.leadId || await ensureLeadExists(db, session, {
      status: "meeting-scheduled",
      meetingStatus: "scheduled",
      assignedTo: consultantId,
      assignedToName: consultantName,
      meetingDetails: {
        meetingDate,
        startTime: istStart,
        endTime: istEnd,
        meetingLink: meetLink,
        googleMeetLink: meetLink,
        status: "scheduled",
        candidateTime: candidateTimeLabel,
        channel: "WhatsApp Ireland",
      },
    });

    // Insert new slot in meetingSlots
    const slotId = await getNextId(db, "meetingSlots");
    const slotDoc = {
      id: slotId,
      leadId,
      meetingDate,
      startTime: istStart,
      endTime: istEnd,
      status: "scheduled",
      phone: session.phone,
      email: session.email || "",
      meetingUserId: consultantId,
      meetingUserName: consultantName,
      bookedBy: "WhatsApp Ireland Bot",
      bookedByName: "WhatsApp Ireland Bot",
      candidateTimezone: session.timeZone,
      candidateLocalTime: candStart,
      candidateLocalEndTime: candEndObj.candidateTime,
      candidateDisplayLabel: candidateTimeLabel,
      googleMeetLink: meetLink,
      channel: "WhatsApp Ireland",
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("meetingSlots").insertOne(slotDoc);

    // Update CRM lead
    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          status: "meeting-scheduled",
          meetingStatus: "scheduled",
          assignedTo: consultantId,
          assignedToName: consultantName,
          assignedToRole: (pearlUser?.role as string) || "wm",
          assignedBy: "WhatsApp Ireland Bot",
          assignedByName: "WhatsApp Ireland Bot",
          meetingDetails: {
            meetingUserId: consultantId,
            meetingUserName: consultantName,
            meetingDate,
            startTime: istStart,
            endTime: istEnd,
            candidateTimezone: session.timeZone,
            candidateLocalStartTime: candStart,
            candidateLocalEndTime: candEndObj.candidateTime,
            candidateTime: candidateTimeLabel,
            bookedBy: "WhatsApp Ireland Bot",
            bookedByName: "WhatsApp Ireland Bot",
            googleMeetLink: meetLink,
            meetingLink: meetLink,
            status: "scheduled",
            channel: "WhatsApp Ireland",
          },
          updatedAt: now,
        },
        $addToSet: {
          visibleTo: consultantId,
          participants: consultantId,
        } as any,
        $push: {
          history: {
            action: isReschedule ? "meeting_rescheduled_via_whatsapp_ireland" : "meeting_booked_via_whatsapp_ireland",
            performedByName: "WhatsApp Ireland Bot",
            timestamp: now,
            details: isReschedule
              ? `Rescheduled from ${previousSlotDetails} to ${meetingDate} at ${candidateTimeLabel}. Room: ${meetLink}`
              : `Booked Ireland consultation for ${meetingDate} at ${candidateTimeLabel}. Room: ${meetLink}`,
          } as any,
        },
      }
    );

    // Update session
    const historyItem: MeetingHistoryItem = {
      action: isReschedule ? "rescheduled" : "booked",
      date: meetingDate,
      candidateTime: candidateTimeLabel,
      istTime: istTimeLabel,
      timestamp: now,
      previousSlot: isReschedule && session.bookedSlot ? {
        date: session.bookedSlot.date,
        candidateTime: session.bookedSlot.candidateTimeLabel,
        istTime: session.bookedSlot.istTimeLabel,
      } : undefined,
    };

    const bookedSlotInfo = {
      date: meetingDate,
      candidateTime: candStart,
      candidateTimeLabel,
      istTime: istStart,
      istTimeLabel,
      meetingUserId: consultantId,
      meetingUserName: "TMS Senior Ireland Expert",
    };

    await updateSession(db, session.phone, {
      currentStep: "BOOKED",
      meetingStatus: isReschedule ? "rescheduled" : "booked",
      meetingBookedAt: !isReschedule ? now : session.meetingBookedAt || now,
      meetingRescheduledAt: isReschedule ? now : session.meetingRescheduledAt,
      meetingRescheduledCount: (session.meetingRescheduledCount || 0) + (isReschedule ? 1 : 0),
      activeSlotsDate: undefined,
      bookedSlot: bookedSlotInfo,
      leadId,
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
    });

    await appendMeetingHistory(db, session.phone, historyItem);

    // In-App Notification for Pearl & Admins in CRM
    try {
      const { createNotification } = await import("@/lib/notifications");
      const candName = session.name || "Ireland WhatsApp Candidate";
      if (pearlUser) {
        await createNotification({
          userId: pearlUser.id,
          title: isReschedule ? "Ireland WhatsApp Meeting Rescheduled 🇮🇪" : "New Ireland WhatsApp Meeting Booked 🇮🇪",
          message: isReschedule
            ? `Ireland consultation with ${candName} was RESCHEDULED to ${meetingDate} at ${candidateTimeLabel}.`
            : `1-on-1 Ireland Work Visa consultation booked with ${candName} on ${meetingDate} at ${candidateTimeLabel}.`,
          type: "meeting_scheduled",
          link: `/dashboard/leads/${leadId}`,
        });
      }
    } catch (notifErr) {
      console.warn("[WhatsApp Ireland] Failed to create notification:", notifErr);
    }

    const candidateDisplayName = session.name && session.name !== "Candidate" ? session.name : "Candidate";
    const dateObj = new Date(`${meetingDate}T12:00:00+05:30`);
    const formattedDate = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dateObj);

    const confirmMessage = isReschedule
      ? `Dear ${candidateDisplayName},\n\n` +
        `Your *Ireland Employer Sponsored Work Visa* consultation has been **successfully rescheduled**! ✅🇮🇪\n\n` +
        `📅 *New Date:* ${formattedDate}\n` +
        `⏰ *New Time:* ${candidateTimeLabel}\n` +
        `👨‍💼 *Expert:* Senior Ireland Migration Counselor\n` +
        `💻 *Google Meet:* ${meetLink}\n\n` +
        `Please make sure to *join the meeting on time*.\n\n` +
        `We look forward to speaking with you.\n\n` +
        `*Best regards,*\n` +
        `*TMS Visa — Ireland Division*`
      : `Dear ${candidateDisplayName},\n\n` +
        `Thank you for showing your interest in the *Ireland Employer Sponsored Work Visa*! 🇮🇪\n\n` +
        `We are pleased to confirm your *1-on-1 Google Meet consultation* to assess your eligibility across Critical Skills (CSEP) and General Permits (GEP), employer sponsorship, and Stamp 4 PR.\n\n` +
        `📅 *Date:* ${formattedDate}\n` +
        `⏰ *Time:* ${candidateTimeLabel}\n` +
        `👨‍💼 *Expert:* Senior Ireland Migration Counselor\n` +
        `💻 *Google Meet:* ${meetLink}\n\n` +
        `Please make sure to *join the meeting on time*.\n\n` +
        `In the meantime, feel free to upload your CV here for prior review! 📄\n\n` +
        `*Best regards,*\n` +
        `*TMS Visa — Ireland Division*`;

    await sendTextMessage(session.phone, confirmMessage);

    // Send Quick Reply Button: Change Date & Time
    await delay(300);
    const changePrompt =
      `ℹ️ *Need to change your date or time?*\n` +
      `If you mistakenly selected the wrong slot or need to change it later, tap below anytime:`;

    await sendQuickReplyButtons(session.phone, changePrompt, [
      { id: "BTN_RESCHEDULE", title: "Change Date & Time" },
    ]);
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
