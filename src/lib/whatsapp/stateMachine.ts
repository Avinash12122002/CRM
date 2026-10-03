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
import { findEligibleOccupation } from "./occupations";
import {
  getUpcomingWeekendDays,
  getAvailableWeekendSlots,
  findNextAvailableWeekendDay,
  formatSlotsOverview,
  WeekendDayOption,
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
    "https://meet.google.com/hgu-yxat-nwy"
  );
}

export function getVideo482Url(): string {
  return (
    process.env.VIDEO_482_URL ||
    "https://tmsvisa.com/australia-work-visa-process/"
  );
}

/**
 * Builds rows for Meta WhatsApp interactive list (max 10 rows per Meta API limit).
 * If > 10 slots (e.g. 16 continuous slots), rows 1-9 are direct slots and row 10 opens slots 10 to N.
 */
function buildSlotRows(
  availableSlots: WeekendSlot[],
  meetingDate: string,
  timeZoneLabel: string,
) {
  const tzShort = extractShortTimezone(timeZoneLabel);
  if (availableSlots.length <= 10) {
    return availableSlots.map((s, idx) => ({
      id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
      title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
      description: `Slot #${idx + 1} (${tzShort})`.slice(0, 72),
    }));
  }

  const rows = availableSlots.slice(0, 9).map((s, idx) => ({
    id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
    title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
    description: `Slot #${idx + 1} (${tzShort})`.slice(0, 72),
  }));

  rows.push({
    id: `SHOW_AFTERNOON_SLOTS_${meetingDate}`,
    title: `Slots 10 to ${availableSlots.length} ➡️`.slice(0, 24),
    description: `Tap to view remaining slots`.slice(0, 72),
  });

  return rows;
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
    lower.includes("@") ||
    lower.includes("candidate") ||
    lower.includes("whatsapp") ||
    lower.includes("applicant") ||
    lower.includes("client") ||
    lower === "there"
  ) {
    return "";
  }
  return trimmed;
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
    // If current name is missing, generic "Candidate", "at", or test placeholder, try to resolve real name
    if (!existing.name || existing.name === "Candidate" || existing.name === "at" || existing.name.trim().length <= 2 || existing.name.toLowerCase().includes("test")) {
      const realCandidateName =
        candidateName && candidateName !== "Candidate" && candidateName !== "at" && candidateName.trim().length > 2 && !candidateName.toLowerCase().includes("test")
          ? candidateName.trim()
          : undefined;

      let foundName = realCandidateName;
      if (!foundName) {
        const lastLog = await db.collection("whatsapp_incoming_logs").findOne({
          phone: cleanPhone,
          senderName: { $exists: true, $nin: ["Candidate", "candidate", "at", ""] },
        });
        if (lastLog?.senderName && lastLog.senderName !== "at" && lastLog.senderName.trim().length > 2) {
          foundName = lastLog.senderName.trim();
        }
      }

      if (foundName) {
        existing.name = foundName;
        await db.collection(SESSIONS_COLLECTION).updateOne({ phone: cleanPhone }, { $set: { name: foundName } });
      }
    }

    // Sync live CRM data (meeting completion, payment, documents, occupations, experience, callback, notes) if lead exists
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
      if (!existing.leadId) existing.leadId = lead.id;
      const safeLeadName = getSafeCandidateDisplayName(lead.name);
      const safeExistingName = getSafeCandidateDisplayName(existing.name);
      if (safeLeadName && !safeExistingName) {
        existing.name = safeLeadName;
        await db.collection(SESSIONS_COLLECTION).updateOne({ phone: cleanPhone }, { $set: { name: safeLeadName } });
      } else if (!safeExistingName && existing.name) {
        existing.name = undefined;
        await db.collection(SESSIONS_COLLECTION).updateOne({ phone: cleanPhone }, { $unset: { name: "" } });
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

      // Sync CRM status and stages
      existing.crmStatus = lead.status;
      existing.meetingCompleted = lead.meetingStatus === "completed" || lead.status === "follow-up";
      existing.paymentPending = lead.status === "payment-pending";
      existing.documentPending = lead.status === "document-pending";
      if (lead.meetingStatus) existing.meetingStatus = lead.meetingStatus;
      if (lead.status === "meeting-scheduled" && !existing.meetingStatus) existing.meetingStatus = "booked";
      if (lead.interestedCountry) existing.interestedCountry = lead.interestedCountry;

      // Extract all possible occupations from CRM lead (strictly filter out marketing campaign names)
      const isMarketingTitle = (title?: string): boolean => {
        if (!title) return false;
        const lower = title.toLowerCase();
        return (
          lower.includes("australia work visa") ||
          lower.includes("ireland work visa") ||
          lower.includes("skills in demand") ||
          lower.includes("employer sponsored work visa") ||
          lower.includes("work visa") ||
          lower.includes("visa program")
        );
      };

      const leadOccs: string[] = [];
      if (Array.isArray(lead.occupations) && lead.occupations.length > 0) {
        leadOccs.push(...lead.occupations.filter((o: any) => typeof o === "string" && o.trim() && !isMarketingTitle(o)));
      } else if (typeof lead.occupations === "string" && (lead.occupations as string).trim() && !isMarketingTitle(lead.occupations as string)) {
        leadOccs.push((lead.occupations as string).trim());
      }
      if (lead.jobApplied && !leadOccs.includes(lead.jobApplied) && !isMarketingTitle(lead.jobApplied)) {
        leadOccs.push(lead.jobApplied);
      }
      if (lead.occupation && !leadOccs.includes(lead.occupation) && !isMarketingTitle(lead.occupation)) {
        leadOccs.push(lead.occupation);
      }
      if (leadOccs.length > 0) {
        existing.occupations = leadOccs;
        if (!existing.occupation || isMarketingTitle(existing.occupation)) {
          existing.occupation = leadOccs[0];
        }
      } else if (existing.occupation && isMarketingTitle(existing.occupation)) {
        existing.occupation = undefined;
        await db.collection(SESSIONS_COLLECTION).updateOne({ phone: cleanPhone }, { $unset: { occupation: "" } });
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
        channel: { $ne: "WhatsApp Ireland" },
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
        const slotTzShort = extractShortTimezone(existing.timeZoneLabel || country.label).replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
        const isIndia = (existing.countryCode || country.countryCode) === "IN";
        const candLabel = isIndia
          ? `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)}`
          : `${candSlotStart.display12h} - ${candSlotEnd.display12h}${slotTzShort ? ` (${slotTzShort})` : ""}`;

        existing.bookedSlot = {
          date: activeSlot.meetingDate,
          candidateTime: candSlotStart.candidateTime,
          candidateTimeLabel: activeSlot.candidateDisplayLabel || candLabel,
          istTime: activeSlot.startTime,
          istTimeLabel: `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)} IST`,
          meetingUserId: activeSlot.meetingUserId,
          meetingUserName: activeSlot.meetingUserName,
        };
        existing.meetingStatus = "booked";
        if (existing.currentStep === "WELCOME" || existing.currentStep === "AWAITING_EMAIL") {
          existing.currentStep = "BOOKED";
        }
      }
    }

    if (!existing.timeZone || !existing.timeZoneLabel) {
      existing.countryCode = country.countryCode;
      existing.countryName = country.countryName;
      existing.timeZone = country.timeZone;
      existing.timeZoneLabel = country.label;
    }

    if (!existing.interestedCountry) existing.interestedCountry = "Australia";
    if (!existing.meetingStatus) existing.meetingStatus = existing.bookedSlot ? "booked" : "none";
    if (!existing.meetingHistory) existing.meetingHistory = [];
    return existing;
  }

  // Check if lead or meeting already exists in CRM for this phone
  const last10 = cleanPhone.slice(-10);
  const phoneQueries = [
    { phone: cleanPhone },
    { phone: `+${cleanPhone}` },
    ...(last10.length === 10 ? [{ phone: last10 }, { phone: `+91${last10}` }, { phone: { $regex: `${last10}$` } }] : []),
  ];
  const existingLead = await db.collection("leads").findOne({ $or: phoneQueries });
  const activeSlot = await db.collection("meetingSlots").findOne({
    status: "scheduled",
    channel: { $ne: "WhatsApp Ireland" },
    $or: phoneQueries,
  });

  let initialStep: WhatsAppStep = "WELCOME";
  let initialBookedSlot = undefined;
  let initialMeetingStatus: "none" | "booked" | "rescheduled" | "canceled" | "completed" = "none";

  if (activeSlot) {
    initialStep = "BOOKED";
    initialMeetingStatus = "booked";
    const candSlotStart = activeSlot.candidateLocalTime
      ? { candidateTime: activeSlot.candidateLocalTime, display12h: format12hTime(activeSlot.candidateLocalTime) }
      : convertIstSlotToCandidateTime(activeSlot.meetingDate, activeSlot.startTime, country.timeZone);
    const candSlotEnd = activeSlot.candidateLocalEndTime
      ? { candidateTime: activeSlot.candidateLocalEndTime, display12h: format12hTime(activeSlot.candidateLocalEndTime) }
      : convertIstSlotToCandidateTime(activeSlot.meetingDate, activeSlot.endTime, country.timeZone);
    const slotTzShort = extractShortTimezone(country.label).replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
    const isIndia = country.countryCode === "IN";
    const candLabel = isIndia
      ? `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)}`
      : `${candSlotStart.display12h} - ${candSlotEnd.display12h}${slotTzShort ? ` (${slotTzShort})` : ""}`;

    initialBookedSlot = {
      date: activeSlot.meetingDate,
      candidateTime: candSlotStart.candidateTime,
      candidateTimeLabel: activeSlot.candidateDisplayLabel || candLabel,
      istTime: activeSlot.startTime,
      istTimeLabel: `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)} IST`,
      meetingUserId: activeSlot.meetingUserId,
      meetingUserName: activeSlot.meetingUserName,
    };
  }

  const isMarketingCampaign = (str: string) =>
    /visa|employer sponsored|482|subclass|tss|skills in demand|migration|work permit/i.test(str);

  const leadOccsNew: string[] = [];
  if (Array.isArray(existingLead?.occupations) && existingLead.occupations.length > 0) {
    leadOccsNew.push(...existingLead.occupations.filter((o: any) => typeof o === "string" && o.trim() && !isMarketingCampaign(o)));
  } else if (typeof existingLead?.occupations === "string" && (existingLead.occupations as string).trim() && !isMarketingCampaign(existingLead.occupations as string)) {
    leadOccsNew.push((existingLead.occupations as string).trim());
  }
  if (existingLead?.occupation && !isMarketingCampaign(existingLead.occupation) && !leadOccsNew.includes(existingLead.occupation)) {
    leadOccsNew.push(existingLead.occupation);
  }
  if (existingLead?.jobApplied && !isMarketingCampaign(existingLead.jobApplied) && !leadOccsNew.includes(existingLead.jobApplied)) {
    leadOccsNew.push(existingLead.jobApplied);
  }

  const isExcludedNewLead =
    existingLead?.status &&
    ["meeting-scheduled", "follow-up", "sales", "payment-pending", "document-pending", "call-back"].includes(
      existingLead.status.toLowerCase().trim()
    );

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: candidateName && !candidateName.toLowerCase().includes("test") && !candidateName.includes("@") && candidateName.length > 1 ? candidateName : (existingLead?.name && !existingLead.name.includes("@") ? existingLead.name : "Candidate"),
    email: existingLead?.email,
    leadId: existingLead?.id,
    countryCode: country.countryCode,
    countryName: country.countryName,
    interestedCountry: existingLead?.interestedCountry || "Australia",
    timeZone: country.timeZone,
    timeZoneLabel: country.label,
    currentStep: initialStep,
    bookedSlot: initialBookedSlot,
    followupCount: 0,
    nextFollowupAt: isExcludedNewLead ? undefined : undefined,
    meetingStatus: initialMeetingStatus,
    meetingHistory: [],
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

  await db.collection(SESSIONS_COLLECTION).updateOne(
    { $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }] },
    updateDoc,
    { upsert: true }
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
    const updatedLeadFields: Record<string, unknown> = {
      email: session.email || existingLead.email,
      country: session.countryName || existingLead.country,
      interestedCountry: existingLead.interestedCountry || "Australia",
      jobApplied: session.occupation || existingLead.jobApplied || "Australia Employer Sponsored Work Visa",
      leadSource: existingLead.leadSource || "WhatsApp Ad Automation",
      updatedAt: now,
    };
    if (session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")) {
      updatedLeadFields.name = session.name;
    }
    if (session.yearsExperience) {
      updatedLeadFields.experience = session.yearsExperience;
    }
    if (session.occupation) {
      updatedLeadFields.occupation = session.occupation;
    }

    await db.collection("leads").updateOne(
      { id: existingLead.id },
      {
        $set: updatedLeadFields,
        ...(session.occupation ? { $addToSet: { occupations: session.occupation } as any } : {}),
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
    jobApplied: "Australia Employer Sponsored Work Visa",
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
 * Sends consultation booking prompt with quick reply buttons
 */
export async function sendConsultationBookingPrompt(phone: string) {
  const cleanDigits = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  try {
    const { connectToDatabase } = await import("@/lib/mongodb");
    const { db } = await connectToDatabase();
    const session = await db.collection("whatsapp_sessions").findOne({ phone: cleanDigits });
    const lead = session?.leadId
      ? await db.collection("leads").findOne({ id: session.leadId })
      : await db.collection("leads").findOne({
          $or: [
            { phone: cleanDigits },
            { phone: `+${cleanDigits}` },
            { phone: { $regex: `${cleanDigits.slice(-10)}$` } },
          ],
        });

    const ACTIVE_CRM_STATUSES = [
      "meeting-scheduled",
      "follow-up",
      "sales",
      "payment-pending",
      "document-pending",
      "call-back",
    ];

    const effectiveStatus = (lead?.status || session?.crmStatus || "").toLowerCase().trim();
    if (ACTIVE_CRM_STATUSES.includes(effectiveStatus) || session?.meetingCompleted || session?.bookedSlot) {
      // Candidate is already an active CRM candidate — do not prompt to book!
      return;
    }
  } catch (err) {
    console.warn("[sendConsultationBookingPrompt] check failed:", err);
  }

  const consultationPrompt =
    `*Ready to take the next step towards Australia? 🇦🇺*\n\n` +
    `Book a 1-on-1 consultation meeting with our Australian Visa Expert to check your job eligibility and visa pathway.`;

  const res = await sendQuickReplyButtons(phone, consultationPrompt, [
    { id: "BTN_CONSULT_YES", title: "Book Consultation" },
    { id: "BTN_CONSULT_NO", title: "Maybe Later" },
  ]);
  if (!res.success) {
    await sendTextMessage(phone, consultationPrompt);
  }
}

/**
 * Dispatches Step 3 video link, skips old complete process text, and schedules consultation prompt 10 minutes later
 */
export async function sendTimedVideoAndProcessGuide(
  phone: string,
  email: string,
  videoUrl?: string,
) {
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  const actualVideoUrl = videoUrl || getVideo482Url();

  // 1. Send the 482 explainer video guide
  if (actualVideoUrl) {
    const videoIntro =
      `🎥 *Australia Work Visa — Process Guide Video* 🇦🇺\n\n` +
      `Here is our video explaining employer sponsorship requirements, eligible occupations, and relocation pathways:\n\n` +
      `▶️ *Watch the Video Here:*\n${actualVideoUrl}\n\n` +
      `*(Tap the link above to watch the video anytime)*`;
    await sendTextMessage(cleanPhone, videoIntro);
  }

  // 2. Schedule the consultation booking prompt after 10 minutes (skipping the old long complete process text).
  // Uses an atomic findOneAndUpdate with consultationPromptSent guard to prevent
  // duplicate sends when multiple serverless invocations (webhook retries) each
  // register their own setTimeout.
  setTimeout(async () => {
    try {
      const { connectToDatabase } = await import("@/lib/mongodb");
      const { db } = await connectToDatabase();

      // Atomically claim the "send slot" — only the first timer to reach this wins.
      // If consultationPromptSent is already true, this returns null and we skip.
      const claimed = await db.collection("whatsapp_sessions").findOneAndUpdate(
        {
          $and: [
            { $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }] },
            { $or: [
              { currentStep: "AWAITING_CONSULTATION_DECISION" },
              { currentStep: "VIDEO_SENT_AWAITING_INTEREST" },
            ]},
          ],
          bookedSlot: { $exists: false },
          consultationPromptSent: { $ne: true },
        },
        { $set: { consultationPromptSent: true, updatedAt: new Date() } },
        { returnDocument: "after" }
      );

      if (!claimed) {
        // Another timer already claimed it or session state changed — do nothing.
        return;
      }

      await sendConsultationBookingPrompt(cleanPhone);
      const { logWhatsAppMessage } = await import("@/lib/whatsapp/messageLogger");
      await logWhatsAppMessage({
        db,
        phone: cleanPhone,
        sender: "bot",
        senderName: "Aria (TMS Visa)",
        text: `*Ready to take the next step towards Australia? 🇦🇺*\n\nBook a 1-on-1 consultation meeting with our Australian Visa Expert to check your job eligibility and visa pathway.`,
        msgType: "interactive_button",
        buttons: [
          { id: "BTN_CONSULT_YES", title: "Book Consultation" },
          { id: "BTN_CONSULT_NO", title: "Maybe Later" },
        ],
        createdAt: new Date(),
      });
      await db.collection("whatsapp_sessions").updateOne(
        { $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }] },
        { $unset: { consultationPromptDueAt: "" }, $set: { updatedAt: new Date() } }
      );
    } catch (err) {
      console.error("[WhatsApp] Error sending 10-minute consultation prompt:", err);
    }
  }, 10 * 60 * 1000);
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
  upcomingWeekends: WeekendDayOption[],
  isSelectingDayStep: boolean = false
): string | null {
  const clean = text.toLowerCase().trim();

  // If text looks like a time or slot choice (e.g. "07:00 PM - 08:00 PM", "slot #8"), do NOT match as a date!
  if (/^\d{1,2}:\d{2}\s*(?:am|pm)?/i.test(clean) || /^slot\s*#?\d+/i.test(clean)) {
    return null;
  }

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
    // Strip out times and slot tokens before matching day number so "07:00 PM" or "Slot #8" is never matched as the 7th or 8th!
    const cleanedOfTimes = clean
      .replace(/\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?/gi, "")
      .replace(/\b(?:slot|no|#)\s*\d+\b/gi, "")
      .replace(/\b\d+\s*(?:am|pm)\b/gi, "");
    const dayOnlyMatch = cleanedOfTimes.match(/\b(0?[1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)?\b/);
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
 * Dispatches the interactive "Select Date" list for 8 upcoming weekend consultation dates (Sat, Sun, Sat, Sun...).
 * Shows all 8 dates directly in one interactive list.
 */
export async function sendConsultationDateSelection(params: {
  db: Db;
  session: WhatsAppSession;
  introText?: string;
  filterDay?: "Saturday" | "Sunday";
}): Promise<{ replyText: string; step: WhatsAppStep }> {
  const { db, session, introText } = params;
  const weekends = getUpcomingWeekendDays(8);

  const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);
  const cleanTz = candWindow.tzShort.replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
  const tzSuffix = cleanTz ? ` (${cleanTz})` : "";

  const sections = [
    {
      title: "8 Weekend Dates".slice(0, 24),
      rows: weekends.slice(0, 8).map((w) => ({
        id: `DAY_DATE_${w.date}`,
        title: w.displayLabel.slice(0, 24), // e.g. "Sat, 26 Sep"
        description: `${w.dayName} · 1-Hour Slots`.slice(0, 72),
      })),
    },
  ];

  const candidateDisplayName =
    session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
      ? session.name
      : "";

  const isRescheduling = Boolean(session.bookedSlot);
  let dayText = introText;

  if (!dayText) {
    if (isRescheduling) {
      dayText =
        `📅 *Change Consultation Date & Time*\n\n` +
        `Your current meeting is on **${session.bookedSlot?.date}** at **${session.bookedSlot?.candidateTimeLabel || session.bookedSlot?.candidateTime}**.\n\n` +
        `Please select your new preferred date from the 8 upcoming weekend dates:`;
    } else {
      dayText =
        `Our 1-on-1 consultations with our senior visa experts are held on **Saturdays and Sundays**.\n` +
        `All 1-on-1 sessions run in 1-hour intervals between **${candWindow.displayWindow}**${tzSuffix}.\n\n` +
        `Please select your preferred date from the 8 upcoming weekend days below:`;
    }
  }

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

/**
 * Renders available 1-hour consultation slots for a chosen weekend date.
 * If slots are open, sends the interactive "Select Slot" list.
 * If slots are full, automatically finds and shows next weekend with open slots.
 */
export async function renderSlotSelectionForDate(params: {
  db: Db;
  session: WhatsAppSession;
  meetingDate: string;
}): Promise<{ replyText: string; step: WhatsAppStep }> {
  const { db, session, meetingDate } = params;
  const isIndia = session.countryCode === "IN";

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

      await updateSession(db, session.phone, {
        currentStep: "SELECTING_SLOT",
        activeSlotsDate: nextDate,
      });

      const overviewText =
        `All consultation slots for **${selectedLabel}** are currently fully booked! 🔒\n\n` +
        `Here are all available consultation slots for the next weekend on **${nextLabel}**:\n\n` +
        formatSlotsOverview({
          slots: nextWeekend.availableSlots,
          dayLabel: nextLabel,
          candidateTimeZoneLabel: session.timeZoneLabel,
          isIndia,
        });

      const sections = [
        {
          title: `Available Slots (${extractShortTimezone(session.timeZoneLabel)})`.slice(0, 24),
          rows: nextWeekend.availableSlots.map((s, idx) => ({
            id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
            title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
            description: `Slot #${idx + 1} (${extractShortTimezone(session.timeZoneLabel)})`.slice(0, 72),
          })),
        },
      ];

      await sendInteractiveList(
        session.phone,
        "Choose Your Slot",
        overviewText,
        "Select Slot",
        sections,
      );

      return { replyText: overviewText, step: "SELECTING_SLOT" };
    } else {
      const fullText =
        `All consultation slots for **${selectedLabel}** are currently fully booked! 🔒\n\n` +
        `Would you like to review all upcoming dates across the month?`;
      await sendQuickReplyButtons(session.phone, fullText, [
        { id: "BTN_CHANGE_DAY", title: "View All 8 Dates" },
      ]);
      return { replyText: fullText, step: "SELECTING_DAY" };
    }
  }

  // Slots are available for this date!
  const allWeekends = getUpcomingWeekendDays(8);
  const dayObj = allWeekends.find((w) => w.date === meetingDate);
  const dayLabel = dayObj ? dayObj.displayLabel : meetingDate;

  await updateSession(db, session.phone, {
    currentStep: "SELECTING_SLOT",
    activeSlotsDate: meetingDate,
  });

  const overviewText = formatSlotsOverview({
    slots: availableSlots,
    dayLabel,
    candidateTimeZoneLabel: session.timeZoneLabel,
    isIndia,
  });

  const rawTzShort = extractShortTimezone(session.timeZoneLabel);
  const tzShort = rawTzShort.replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
  const tzSuffix = tzShort ? ` (${tzShort})` : "";

  const sections = [
    {
      title: `8 Slots${tzSuffix}`.slice(0, 24),
      rows: availableSlots.slice(0, 8).map((s, idx) => ({
        id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
        title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
        description: `Slot #${idx + 1}${tzSuffix}`.slice(0, 72),
      })),
    },
  ];

  await sendInteractiveList(
    session.phone,
    "Choose Your Slot",
    overviewText,
    "Select Slot",
    sections,
  );

  return { replyText: overviewText, step: "SELECTING_SLOT" };
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
  const lowerClean = cleanText.toLowerCase();

  // =========================================================================
  // --- EXISTING LEAD DUPLICATE CHECK (AUSTRALIA) ---
  // When an incoming message arrives, first check if this number / lead exists in the database.
  // If the candidate's phone number exists in CRM `leads`:
  // 1. If not yet notified, send: "We already have your details in our system. Our team will shortly call you..."
  // 2. Treat as an existing candidate (never ask for email, never prompt to book meeting).
  // If they DO NOT exist in the database, proceed with the existing process for new leads.
  // =========================================================================
  const cleanPhone = params.phone.replace(/[^\d]/g, "").replace(/^00/, "");
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

  let existingLead = await db.collection("leads").findOne({ $or: phoneQueries });

  if (!existingLead) {
    try {
      const { syncOrCreateCrmLead } = await import("@/lib/whatsapp/leadLookup");
      existingLead = (await syncOrCreateCrmLead(db, cleanPhone, session, {
        destination: "Australia",
        sessionsCollection: SESSIONS_COLLECTION,
      })) as any;
      if (existingLead?.id) {
        session.leadId = existingLead.id;
        session.crmStatus = existingLead.status || "new-lead";
      }
    } catch (e) {
      console.warn("[WhatsApp] Could not auto-create lead in stateMachine:", e);
    }
  }

  if (existingLead) {
    // Keep session leadId and crmStatus in sync
    if (!session.leadId || session.crmStatus !== existingLead.status) {
      session.leadId = existingLead.id;
      session.crmStatus = existingLead.status;
      await db.collection(SESSIONS_COLLECTION).updateOne(
        { phone: session.phone },
        { $set: { leadId: existingLead.id, crmStatus: existingLead.status, updatedAt: new Date() } }
      );
    }

    const isLeadMeetingCompleted = Boolean(
      existingLead.meetingStatus === "completed" ||
      existingLead.status === "follow-up" ||
      existingLead.meetingDetails?.status === "completed" ||
      existingLead.meetingCompletedAt
    );

    if (isLeadMeetingCompleted && (!session.meetingCompleted || session.meetingStatus !== "completed" || session.bookedSlot)) {
      session.meetingCompleted = true;
      session.meetingStatus = "completed";
      session.crmStatus = existingLead.status || "follow-up";
      session.bookedSlot = undefined;
      if (session.currentStep !== "AWAITING_CV") {
        session.currentStep = "MEETING_COMPLETED";
      }
      await db.collection(SESSIONS_COLLECTION).updateOne(
        { phone: session.phone },
        {
          $set: {
            meetingCompleted: true,
            meetingStatus: "completed",
            crmStatus: existingLead.status || "follow-up",
            meetingCompletedAt: existingLead.meetingCompletedAt || new Date(),
            currentStep: session.currentStep,
            updatedAt: new Date(),
          },
          $unset: { bookedSlot: 1 },
        }
      );
    }

    // Only trigger pre-existing lead notification for pre-existing CRM leads who just messaged in WELCOME
    // Do NOT block leads created by this WhatsApp automation funnel itself!
    const isSelfAutomationLead =
      existingLead.id === session.leadId ||
      existingLead.leadSource === "WhatsApp Ad Automation" ||
      existingLead.leadSource === "WhatsApp Ireland Automation" ||
      existingLead.leadSource === "WhatsApp Ireland" ||
      session.currentStep !== "WELCOME";

    if (!session.existingLeadNotified && !isSelfAutomationLead) {
      const candidateDisplayName =
        session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
          ? session.name
          : existingLead.name && existingLead.name !== "Candidate" && !existingLead.name.toLowerCase().includes("test") && !existingLead.name.includes("@")
            ? existingLead.name
            : "there";

      const duplicateMsg =
        `Hi ${candidateDisplayName}! 👋\n\n` +
        `We already have your details in our system. 📋\n\n` +
        `Our team will shortly call you to assist with your Australia work visa enquiry. 🇦🇺\n\n` +
        `If you have any urgent questions or updates in the meantime, please feel free to message us right here!`;

      session.existingLeadNotified = true;
      session.notifiedExistingLeadAt = new Date();
      session.crmStatus = existingLead.status;
      session.leadId = existingLead.id;

      await updateSession(db, session.phone, {
        existingLeadNotified: true,
        notifiedExistingLeadAt: new Date(),
        crmStatus: existingLead.status,
        leadId: existingLead.id,
      });

      await sendTextMessage(params.phone, duplicateMsg);
      return { replyText: duplicateMsg, step: session.currentStep };
    }
  }

  // =========================================================================
  // --- SAVE EVERY CANDIDATE MESSAGE TO conversationHistory (for AI training) ---
  // =========================================================================
  if (cleanText && !actionId) {
    // Only save real typed text messages (not button clicks — those are stored as actions)
    try {
      await db.collection("whatsapp_sessions").updateOne(
        { phone: session.phone },
        {
          $push: {
            conversationHistory: {
              role: "candidate",
              message: cleanText.slice(0, 1000), // cap at 1000 chars
              timestamp: new Date(),
              step: session.currentStep,
            } as any,
          },
          $set: { lastInteractionAt: new Date(), updatedAt: new Date() },
        }
      );
    } catch (histErr) {
      console.warn("[WhatsApp] Could not save conversation history:", histErr);
    }
  }

  // =========================================================================
  // --- UPDATE INTERCEPTORS (email/name change requested by candidate) ---
  // These fire BEFORE profile extraction so the candidate's reply is treated
  // as the new value, not as general conversation.
  // =========================================================================

  // EMAIL UPDATE: Candidate was asked to reply with their new email address
  if (session.currentStep === "AWAITING_EMAIL_UPDATE" && cleanText && !actionId) {
    const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const candidate = emailMatch ? emailMatch[0].toLowerCase() : cleanText.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const prevStep = session.meetingCompleted
      ? "MEETING_COMPLETED"
      : session.bookedSlot
        ? "BOOKED"
        : (session.currentStep as string).replace("AWAITING_EMAIL_UPDATE", "AWAITING_CONSULTATION_DECISION") as import("./types").WhatsAppStep;

    if (emailRegex.test(candidate)) {
      // Save to session
      session.email = candidate;
      await updateSession(db, session.phone, {
        email: candidate,
        currentStep: prevStep as import("./types").WhatsAppStep,
      });
      // Save to CRM lead across all phone variations
      const cleanPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");
      const phoneQueries = [
        ...(session.leadId ? [{ id: session.leadId }] : []),
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
      ];
      await db.collection("leads").updateMany(
        { $or: phoneQueries },
        { $set: { email: candidate, updatedAt: new Date() } }
      );

      // Automatically dispatch info email to new address
      let emailDispatched = false;
      try {
        const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
        const sendRes = await sendWhatsAppInfoEmail({
          phone: session.phone,
          name: session.name,
          email: candidate,
          leadId: session.leadId,
        });
        emailDispatched = sendRes.success === true;
      } catch (err) {
        console.error("[WhatsApp] Error sending info email after update:", err);
      }

      const confirm = emailDispatched
        ? `✅ Done! Your registered email has been updated to **${candidate}**.\n\nWe have immediately dispatched your official Australia Employer Sponsored Work Visa Information Pack (including the 691 Eligible Occupation List & PTE Guide) to your new email! 📩 Please check your inbox and spam folder.`
        : `✅ Done! Your registered email has been updated to **${candidate}**.\n\nAll future official correspondence and visa documentation will be sent to this address. If you have any other questions, feel free to ask! 🇦🇺`;

      await sendTextMessage(session.phone, confirm);
      return { replyText: confirm, step: prevStep as import("./types").WhatsAppStep };
    } else {
      const retry = `⚠️ That doesn't look like a valid email address.\n\nPlease reply with your correct email (e.g. yourname@gmail.com) to update your profile.`;
      await sendTextMessage(session.phone, retry);
      return { replyText: retry, step: "AWAITING_EMAIL_UPDATE" };
    }
  }

  // NAME UPDATE: Candidate was asked to reply with their correct name
  if (session.currentStep === "AWAITING_NAME_UPDATE" && cleanText && !actionId) {
    const prevStep = session.meetingCompleted
      ? "MEETING_COMPLETED"
      : session.bookedSlot
        ? "BOOKED"
        : ("AWAITING_CONSULTATION_DECISION" as import("./types").WhatsAppStep);

    // Accept any 2-50 character name (letters, spaces, hyphens, apostrophes)
    const nameRegex = /^[A-Za-z\s'\-]{2,50}$/;
    const candidate = cleanText.trim();
    const wordCount = candidate.split(/\s+/).length;

    if (nameRegex.test(candidate) && wordCount >= 1 && wordCount <= 5) {
      // Save to session
      session.name = candidate;
      await updateSession(db, session.phone, {
        name: candidate,
        currentStep: prevStep,
      });
      // Save to CRM lead across all matching phone variations
      const cleanPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");
      const phoneQueries = [
        ...(session.leadId ? [{ id: session.leadId }] : []),
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
      ];
      await db.collection("leads").updateMany(
        { $or: phoneQueries },
        { $set: { name: candidate, updatedAt: new Date() } }
      );
      const confirm = `✅ Got it! Your registered name has been updated to **${candidate}**.\n\nIf anything else needs updating, just let me know! 😊🇦🇺`;
      await sendTextMessage(session.phone, confirm);
      return { replyText: confirm, step: prevStep };
    } else {
      const retry = `⚠️ Please reply with your correct full name (e.g. "Rahul Sharma" or "Maria Santos") to update your profile.`;
      await sendTextMessage(session.phone, retry);
      return { replyText: retry, step: "AWAITING_NAME_UPDATE" };
    }
  }

  // =========================================================================
  // --- AUTO-EXTRACT & PERSIST CANDIDATE PROFILE DETAILS FROM EVERY MESSAGE ---
  // =========================================================================
  const profileUpdates: Record<string, unknown> = {};


  // 0. Candidate Name extraction & explicit updates (e.g. "My name is John Doe", "Change my name to John Doe", "I am Rohit Sharma", "Name: Sunil")
  const explicitNamePatterns = [
    /^(?:(?:please\s+)?(?:change|update|correct|set)\s+(?:my\s+)?name\s+to|please\s+call\s+me|call\s+me)\s+([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){0,3})/i,
    /^(?:my\s+name\s+is|i\s+am|i'm|im|this\s+is)\s+([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){1,3})/i,
    /^name\s*[:=\-]\s*([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){0,3})/i,
    /^([A-Za-z]{2,25}\s+[A-Za-z]{2,25})\s+(?:here|speaking)\b/i,
  ];

  let detectedName: string | undefined;
  for (const pat of explicitNamePatterns) {
    const match = cleanText.match(pat);
    if (match && match[1]) {
      const potentialName = match[1].trim();
      const lower = potentialName.toLowerCase();
      if (
        !lower.includes("interested") &&
        !lower.includes("looking") &&
        !lower.includes("applying") &&
        !lower.includes("australia") &&
        !lower.includes("eligible") &&
        !lower.includes("mechanical") &&
        !lower.includes("engineer") &&
        !lower.includes("not")
      ) {
        detectedName = potentialName;
        break;
      }
    }
  }

  if (
    detectedName &&
    (detectedName !== session.name || !session.name || session.name === "Candidate" || session.name.toLowerCase().includes("test"))
  ) {
    session.name = detectedName;
    profileUpdates.name = detectedName;
  }

  // 0b. Candidate Email Address extraction (e.g. "my email is ak2805034@gmail.com", "ak2805034@gmail.com")
  const emailInMsgMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailInMsgMatch) {
    const foundEmail = emailInMsgMatch[0].toLowerCase();
    if (!session.email || session.email !== foundEmail) {
      session.email = foundEmail;
      profileUpdates.email = foundEmail;
    }
  }

  // 1. Occupation & Sector from official 691 list
  const occMatch = findEligibleOccupation(cleanText);
  if (occMatch && (!session.occupation || session.occupation !== occMatch.role)) {
    session.occupation = occMatch.role;
    session.occupationSector = occMatch.category;
    profileUpdates.occupation = occMatch.role;
    profileUpdates.occupationSector = occMatch.category;
  }

  // 2. Years of Experience (e.g. "5 years experience", "8+ yrs")
  const expRegex = /\b(\d{1,2})\s*(?:\+|\s*plus)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?\b/i;
  const expMatch = cleanText.match(expRegex);
  if (expMatch && (!session.yearsExperience || session.yearsExperience !== `${expMatch[1]} years`)) {
    const expStr = `${expMatch[1]} years`;
    session.yearsExperience = expStr;
    profileUpdates.yearsExperience = expStr;
  }

  // 2b. Candidate Country / Location update (e.g. "I am in UAE", "living in Dubai", "from Kenya", "country is Qatar")
  const countryPatterns = [
    /(?:(?:i\s+am\s+|currently\s+)?(?:living\s+in|based\s+in|located\s+in|staying\s+in)|country\s+is|change\s+country\s+to)\s+([A-Za-z\s]{3,30})/i,
    /^(?:in|from)\s+([A-Za-z\s]{3,25})$/i,
  ];
  for (const cPat of countryPatterns) {
    const cMatch = cleanText.match(cPat);
    if (cMatch && cMatch[1]) {
      const detectedCountry = findCountryByNameOrCode(cMatch[1].trim());
      if (detectedCountry && detectedCountry.countryName !== session.countryName) {
        session.countryCode = detectedCountry.countryCode;
        session.countryName = detectedCountry.countryName;
        session.timeZone = detectedCountry.timeZone;
        session.timeZoneLabel = detectedCountry.label;
        profileUpdates.countryCode = detectedCountry.countryCode;
        profileUpdates.countryName = detectedCountry.countryName;
        profileUpdates.timeZone = detectedCountry.timeZone;
        profileUpdates.timeZoneLabel = detectedCountry.label;
        break;
      }
    }
  }

  // 3. English Language Test & Score (IELTS, PTE, TOEFL, OET, CELPIP)
  const englishRegex = /\b(ielts|pte|toefl|celpip|oet)\s*(?:overall\s*)?(\d+(?:\.\d+)?)\b/i;
  const engMatch = cleanText.match(englishRegex);
  if (engMatch) {
    const engStr = `${engMatch[1].toUpperCase()} ${engMatch[2]}`;
    session.englishTestStatus = engStr;
    profileUpdates.englishTestStatus = engStr;
  }

  // 4. Highest Qualification
  const qualRegex = /\b(master'?s?|bachelor'?s?|b\.?tech|m\.?tech|degree|diploma|phd|mba|bsc|msc|bca|mca|b\.?e\.?|m\.?e\.?|b\.?sc|m\.?sc)\b/i;
  const qualMatch = cleanText.match(qualRegex);
  if (qualMatch) {
    session.highestQualification = qualMatch[0].toUpperCase();
    profileUpdates.highestQualification = qualMatch[0].toUpperCase();
  }

  // 5. Age / Age Range (e.g. "I am 28 years old", "age 32", "28 yrs old")
  const ageRegex = /\b(?:i\s*am\s*|age\s*|aged?\s*|i'm\s*)?(\d{2})\s*(?:years?\s*old|yrs?\s*old|yo\b)/i;
  const ageMatch = cleanText.match(ageRegex);
  if (ageMatch) {
    session.ageRange = ageMatch[1];
    profileUpdates.ageRange = ageMatch[1];
  }

  // 6. Marital Status
  const maritalRegex = /\b(married|single|divorced|widowed|unmarried|engaged)\b/i;
  const maritalMatch = cleanText.match(maritalRegex);
  if (maritalMatch) {
    session.maritalStatus = maritalMatch[1].charAt(0).toUpperCase() + maritalMatch[1].slice(1).toLowerCase();
    profileUpdates.maritalStatus = session.maritalStatus;
  }

  // 7. Family / Dependents (e.g. "wife and 2 kids", "1 child", "my family of 4")
  const familyRegex = /\b(?:(?:wife|husband|spouse|partner)\s*(?:and\s*)?)?(\d+)?\s*(?:child(?:ren)?|kids?|son|daughter|dependents?)\b/i;
  const familyMatch = cleanText.match(familyRegex);
  if (familyMatch) {
    session.familySize = familyMatch[0].trim();
    profileUpdates.familySize = session.familySize;
  }

  // 8. Passport Status
  const passportRegex = /\b(i\s*have\s*(?:a\s*)?passport|passport\s*ready|valid\s*passport|no\s*passport|don'?t\s*have\s*passport|passport\s*not\s*ready)\b/i;
  const passportMatch = cleanText.match(passportRegex);
  if (passportMatch) {
    const hasIt = !/no|don'?t|not ready/.test(passportMatch[0].toLowerCase());
    session.hasPassport = hasIt;
    profileUpdates.hasPassport = hasIt;
  }

  // 9. Current Job Title (e.g. "I work as a Software Engineer", "I am a Nurse")
  const jobTitleRegex = /\b(?:i\s*(?:am\s*(?:a\s*|an\s*)?|work\s*as\s*(?:a\s*|an\s*)?|am\s*working\s*as\s*(?:a\s*|an\s*)?))([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,3})/;
  const jobTitleMatch = cleanText.match(jobTitleRegex);
  if (jobTitleMatch && jobTitleMatch[1].length > 3) {
    session.currentJobTitle = jobTitleMatch[1].trim();
    profileUpdates.currentJobTitle = session.currentJobTitle;
  }

  // 10. Current Employer (e.g. "I work at Infosys", "working in TCS", "employed with Apollo")
  const employerRegex = /\b(?:work(?:ing)?\s*(?:at|in|with|for)|employed\s*(?:at|with|by)|company\s*(?:is|name)?)\s*([A-Z][A-Za-z\s&.]{2,30})/;
  const employerMatch = cleanText.match(employerRegex);
  if (employerMatch) {
    session.currentEmployer = employerMatch[1].trim();
    profileUpdates.currentEmployer = session.currentEmployer;
  }

  // 11. Current Salary (e.g. "8 LPA", "INR 60000", "salary is 1.2 LPA")
  const salaryRegex = /\b(?:(?:INR|₹|Rs\.?)\s*)?(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac|l\.?p\.?a|per\s*annum|per\s*month|pm|k\s*pm)/i;
  const salaryMatch = cleanText.match(salaryRegex);
  if (salaryMatch) {
    session.currentSalary = salaryMatch[0].trim();
    profileUpdates.currentSalary = session.currentSalary;
  }

  // 12. Goals / Intent (e.g. "I want PR", "looking for better salary", "want to settle in Australia")
  const goalRegex = /\b((?:want|looking)\s*(?:to|for)\s*(?:PR|permanent\s*residency|settle|better\s*salary|immigrate|migrate|work\s*abroad|move\s*to\s*australia))\b/i;
  const goalMatch = cleanText.match(goalRegex);
  if (goalMatch) {
    session.candidateGoals = goalMatch[0].trim();
    profileUpdates.candidateGoals = session.candidateGoals;
  }

  // 13. Destination of Interest (default Australia)
  if (!session.interestedCountry) {
    session.interestedCountry = "Australia";
    profileUpdates.interestedCountry = "Australia";
  }

  // Persist all extracted profile fields in one DB write (if any were extracted)
  if (Object.keys(profileUpdates).length > 0) {
    await updateSession(db, session.phone, profileUpdates as Partial<WhatsAppSession>);

    // Synchronize matching CRM leads so CRM and WhatsApp always stay 100% in sync
    const cleanLeadPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");
    const leadUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (profileUpdates.name) leadUpdates.name = profileUpdates.name;
    if (profileUpdates.email) leadUpdates.email = profileUpdates.email;
    if (profileUpdates.yearsExperience) leadUpdates.experience = profileUpdates.yearsExperience;
    if (profileUpdates.occupation) {
      leadUpdates.jobApplied = profileUpdates.occupation;
      leadUpdates.occupation = profileUpdates.occupation;
    }
    if (profileUpdates.countryName) leadUpdates.country = profileUpdates.countryName;

    if (Object.keys(leadUpdates).length > 1) {
      const phoneQueries = [
        ...(session.leadId ? [{ id: session.leadId }] : []),
        { phone: cleanLeadPhone },
        { phone: `+${cleanLeadPhone}` },
        { phone: { $regex: `${cleanLeadPhone.slice(-10)}$` } },
      ];
      await db.collection("leads").updateMany(
        { $or: phoneQueries },
        {
          $set: leadUpdates,
          ...(profileUpdates.occupation ? { $addToSet: { occupations: profileUpdates.occupation } as any } : {}),
        }
      );
    }
  }

  // =========================================================================
  // --- PRIORITY CANDIDATE PROFILE UPDATES / REQUESTS ---
  // Must execute BEFORE isCrmCandidate and conversational AI so that:
  // 1) Phone numbers are strictly frozen (CANNOT be changed via chat).
  // 2) Name and Email updates are 100% permitted and welcomed.
  // =========================================================================

  // 1. Phone number change request — CANNOT be changed via chat (frozen for compliance)
  const digitsOnly = cleanText.replace(/\D/g, "");
  const wantsPhoneChange =
    (lowerClean.includes("change") && (lowerClean.includes("phone") || lowerClean.includes("number") || lowerClean.includes("mobile") || lowerClean.includes("contact") || lowerClean.includes("whatsapp"))) ||
    (lowerClean.includes("update") && (lowerClean.includes("phone") || lowerClean.includes("number") || lowerClean.includes("mobile") || lowerClean.includes("contact") || lowerClean.includes("whatsapp"))) ||
    lowerClean === "change number" ||
    lowerClean === "change phone" ||
    lowerClean === "change my number" ||
    lowerClean === "change phone number" ||
    lowerClean === "update number" ||
    lowerClean.includes("different number") ||
    lowerClean.includes("new number");

  const isBarePhoneNumber =
    digitsOnly.length >= 8 &&
    digitsOnly.length <= 15 &&
    /^\+?[\d\s\-()]+$/.test(cleanText.trim()) &&
    session.currentStep !== "SELECTING_SLOT" &&
    (session.currentStep as string) !== "AWAITING_EMAIL" &&
    session.currentStep !== "AWAITING_EMAIL_UPDATE" &&
    session.currentStep !== "AWAITING_NAME_UPDATE";

  if (wantsPhoneChange || isBarePhoneNumber) {
    const safeName = getSafeCandidateDisplayName(session.name);
    const salutation = safeName ? `Hello ${safeName}! 👋\n\n` : `Hello! 👋\n\n`;
    const phoneNoChangeMsg =
      `${salutation}` +
      `Under our verification and compliance protocol, **your registered phone number cannot be changed** through this chat. 🔒\n\n` +
      `Your candidate dossier, consultation booking, and official CRM records are permanently linked to your verified WhatsApp account (+${session.phone}).\n\n` +
      `If you have switched to a new phone number:\n` +
      `• Please initiate a new message directly from your **new WhatsApp number** to connect your profile, OR\n` +
      `• Contact our administrative desk at **info@tmsvisa.com** for assistance.\n\n` +
      `💡 You can freely update your **Full Name** or **Email Address** anytime right here! How else may I assist you today? 🇦🇺`;

    await sendTextMessage(session.phone, phoneNoChangeMsg);
    return { replyText: phoneNoChangeMsg, step: session.currentStep };
  }

  // 2. Name Change Request (100% permitted in chat)
  const wantsNameChange =
    (lowerClean.includes("change") && (lowerClean.includes("name") || lowerClean.includes("naam"))) ||
    (lowerClean.includes("update") && lowerClean.includes("name")) ||
    (lowerClean.includes("correct") && lowerClean.includes("name")) ||
    (lowerClean.includes("edit") && lowerClean.includes("name")) ||
    lowerClean === "i want to change my name" ||
    lowerClean === "can i change my name" ||
    lowerClean === "change name" ||
    lowerClean === "name change" ||
    lowerClean.includes("my name is not") ||
    lowerClean.includes("my name is wrong") ||
    (lowerClean.includes("wrong") && lowerClean.includes("name"));

  // 2a. If candidate explicitly provided their name (or requested to change to a specific name)
  if (detectedName && (wantsNameChange || cleanText.toLowerCase().startsWith("my name is") || cleanText.toLowerCase().startsWith("change name to") || cleanText.toLowerCase().startsWith("update name to") || cleanText.toLowerCase().startsWith("name:"))) {
    const safeName = detectedName;
    const confirmNameMsg =
      `✅ Thank you! I have updated your name to **${safeName}** in your official CRM profile. 📝\n\n` +
      `How else can our team assist you with your Australia Employer Sponsored Work Visa today? 🇦🇺`;
    await sendTextMessage(session.phone, confirmNameMsg);
    return { replyText: confirmNameMsg, step: session.currentStep };
  }

  // 2b. Candidate wants to change name but hasn't provided the new name yet
  if (wantsNameChange && !detectedName) {
    await updateSession(db, session.phone, { currentStep: "AWAITING_NAME_UPDATE" });
    const nameChangePrompt =
      `Certainly! You can update your name anytime right here in this chat. ✍️\n\n` +
      `Please reply with your **correct Full Name** (for example: *"My name is Rajesh Sharma"* or *"Name: Priya Patel"*), and I will update your official CRM profile immediately!`;
    await sendTextMessage(session.phone, nameChangePrompt);
    return { replyText: nameChangePrompt, step: "AWAITING_NAME_UPDATE" };
  }

  // 3. Email Change Request (100% permitted in chat)
  const wantsEmailChange =
    (lowerClean.includes("change") && (lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    (lowerClean.includes("update") && (lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    (lowerClean.includes("correct") && (lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    (lowerClean.includes("edit") && (lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    lowerClean === "i want to change my email" ||
    lowerClean === "can i change my email" ||
    lowerClean === "change email" ||
    lowerClean === "email change" ||
    lowerClean.includes("my email is not") ||
    lowerClean.includes("my email is wrong") ||
    (lowerClean.includes("wrong") && lowerClean.includes("email")) ||
    (lowerClean.includes("new") && lowerClean.includes("email"));

  // 3a. If candidate explicitly provided an email during an email change request or email inquiry
  const directEmailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (
    directEmailMatch &&
    (session.currentStep as string) !== "AWAITING_EMAIL" &&
    (wantsEmailChange || cleanText.toLowerCase().startsWith("my email is") || cleanText.toLowerCase().startsWith("new email is") || session.currentStep === "AWAITING_EMAIL_UPDATE")
  ) {
    const newEmail = directEmailMatch[0].toLowerCase();
    session.email = newEmail;
    await updateSession(db, session.phone, { email: newEmail });
    // Update CRM lead
    const cleanLeadPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");
    await db.collection("leads").updateMany(
      {
        $or: [
          ...(session.leadId ? [{ id: session.leadId }] : []),
          { phone: cleanLeadPhone },
          { phone: `+${cleanLeadPhone}` },
          { phone: { $regex: `${cleanLeadPhone.slice(-10)}$` } },
        ],
      },
      { $set: { email: newEmail, updatedAt: new Date() } }
    );

    // Automatically dispatch info email with PDF to new address
    let emailDispatched = false;
    try {
      const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
      const sendRes = await sendWhatsAppInfoEmail({
        phone: session.phone,
        name: getSafeCandidateDisplayName(session.name) || "Candidate",
        email: newEmail,
        leadId: session.leadId,
      });
      emailDispatched = sendRes.success === true;
    } catch (err) {
      console.error("[WhatsApp] Error sending info email after update:", err);
    }

    const confirmEmailMsg = emailDispatched
      ? `✅ Thank you! I have updated your registered email address to **${newEmail}** in your official CRM profile and immediately dispatched your **Australia Work Visa Information Pack** & **691 Eligible Occupation List (PDF)** to your inbox! 📩\n\n` +
        `📬 Please check both your **Inbox** and **Spam/Junk folder**.\n\n` +
        `Let us know if you need anything else! 🇦🇺`
      : `✅ Thank you! I have updated your registered email address to **${newEmail}** in your official CRM profile. 📝\n\n` +
        `All official visa documentation will be sent to this address. Let us know if you need anything else! 🇦🇺`;

    await sendTextMessage(session.phone, confirmEmailMsg);
    return { replyText: confirmEmailMsg, step: session.currentStep };
  }

  // 3b. Candidate wants to change email but hasn't provided the new email address yet
  if (wantsEmailChange && !directEmailMatch) {
    await updateSession(db, session.phone, { currentStep: "AWAITING_EMAIL_UPDATE" });
    const emailChangePrompt =
      `Certainly! You can update your email address anytime right here. 📧\n\n` +
      `Please reply with your **new Email Address** (for example: *"My email is yourname@gmail.com"*), and I will update your official CRM profile and dispatch your visa information pack immediately!`;
    await sendTextMessage(session.phone, emailChangePrompt);
    return { replyText: emailChangePrompt, step: "AWAITING_EMAIL_UPDATE" };
  }

  // =========================================================================
  // --- INTAKE FUNNEL INTENT DETECTION (Step 1, Step 2, Step 3) ---
  // Must execute BEFORE any active CRM conversational routing so that candidates
  // actively going through the funnel or providing their email are NEVER intercepted!
  // =========================================================================

  const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const isDirectEmail = EMAIL_PATTERN.test(cleanText);

  // Affirmative check (handles button clicks or typed equivalents like "yes, interested", "sure", "yep")
  const isAffirmative =
    actionId === "BTN_482_YES" ||
    actionId === "BTN_YES_AUSTRALIA" ||
    (session.currentStep === "WELCOME" &&
      ["yes", "yep", "yeah", "interested", "sure", "ok", "okay"].some((w) =>
        lowerText === w || (w === "ok" ? /\bok\b/.test(lowerText) : lowerText.includes(w))
      ));

  // Negative check (handles button clicks or typed equivalents like "not right now", "no", "maybe later")
  const NEGATIVE_EXACT_OR_PREFIXES = [
    "not right now",
    "not now",
    "not interested",
    "maybe later",
    "later",
    "no thanks",
    "no thank you",
    "dont want",
    "don't want",
  ];
  const isNegative =
    actionId === "BTN_482_NO" ||
    actionId === "BTN_CONSULT_NO" ||
    lowerText === "no" ||
    lowerText === "nope" ||
    lowerText === "nah" ||
    lowerText.startsWith("no ") ||
    lowerText.startsWith("no,") ||
    lowerText.startsWith("no.") ||
    NEGATIVE_EXACT_OR_PREFIXES.some(
      (w) => lowerText === w || lowerText.startsWith(w + " ") || lowerText.endsWith(" " + w)
    );

  // 1. Post-Meeting CV Status Check (Guard 7.3)
  const isCvStatusInquiry =
    lowerClean.includes("check my cv") ||
    lowerClean.includes("checked my cv") ||
    lowerClean.includes("cv status") ||
    lowerClean.includes("resume status") ||
    lowerClean.includes("cv check") ||
    lowerClean.includes("resume check") ||
    lowerClean.includes("did you check");
  if (isCvStatusInquiry && (session.hasUploadedCv || session.cvReceivedAt || session.currentStep === "MEETING_COMPLETED")) {
    const cvStatusMsg =
      `Thank you for checking in! Please be patient while our review team is still assessing your qualifications and job experience based on Employers requirements.\n\n` +
      `Once the review is completed, please expect a call from an Australian number.. 🇦🇺📞`;
    await sendTextMessage(session.phone, cvStatusMsg);
    return { replyText: cvStatusMsg, step: session.currentStep };
  }

  // 2. STEP 2: Email Intake & Information Delivery (AWAITING_EMAIL or direct email shared)
  if (
    session.currentStep === "AWAITING_EMAIL" ||
    (isDirectEmail && session.currentStep !== "BOOKED" && session.currentStep !== "MEETING_COMPLETED" && session.currentStep !== "AWAITING_EMAIL_UPDATE")
  ) {
    const emailMatch = cleanText.match(EMAIL_PATTERN);
    const extractedEmail = emailMatch ? emailMatch[0].toLowerCase() : cleanText.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const isValidFormat = emailRegex.test(extractedEmail);
    const domain = extractedEmail.includes("@") ? extractedEmail.split("@")[1] : "";
    const isValidDomain = domain.includes(".") && domain.length >= 4;

    const ACCEPTED_DOMAINS = [
      "gmail.com", "googlemail.com",
      "yahoo.com", "yahoo.in", "yahoo.co.in", "yahoo.co.uk", "yahoo.com.au",
      "outlook.com", "outlook.in", "hotmail.com", "hotmail.in", "live.com",
      "icloud.com", "me.com",
      "rediffmail.com", "protonmail.com", "proton.me",
      "aol.com", "mail.com", "zoho.com", "ymail.com",
    ];
    const isWhitelistedDomain = ACCEPTED_DOMAINS.includes(domain) || (domain.includes(".") && !domain.startsWith(".") && domain.split(".").every(part => part.length >= 2));

    if (!isValidFormat || !isValidDomain || !isWhitelistedDomain) {
      const isQuestionOrInquiry =
        cleanText.includes("?") ||
        !cleanText.includes("@") ||
        cleanText.split(/\s+/).length > 2;

      if (isQuestionOrInquiry) {
        const aiAnswer = await generateAiResponse({
          message: cleanText,
          session,
        });

        const replyWithEmailPrompt =
          `${aiAnswer}\n\n` +
          `Whenever you're ready, *please reply with your Email Address* so our team can officially register your profile and email your full visa roadmap:`;

        await sendTextMessage(session.phone, replyWithEmailPrompt);
        return { replyText: replyWithEmailPrompt, step: "AWAITING_EMAIL" };
      }

      const invalidEmailMsg =
        `⚠️ Please enter a valid email address (e.g. yourname@gmail.com or yourname@yahoo.com) so we can send you the official visa details.`;
      await sendTextMessage(session.phone, invalidEmailMsg);
      return { replyText: invalidEmailMsg, step: "AWAITING_EMAIL" };
    }

    // Valid Email: create/update CRM lead
    const updatedSession = {
      ...session,
      email: extractedEmail,
      currentStep: "AWAITING_CONSULTATION_DECISION" as WhatsAppStep,
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
      followupCount: 0,
    };
    const leadId = await syncCrmLead(db, updatedSession, "new-lead");

    // 1. Instant WhatsApp confirmation message
    const emailSentNotice = `We have sent an email about the whole process to your email address (**${extractedEmail}**)! Please check your inbox (and spam/junk folder) as well. 📩`;
    await sendTextMessage(session.phone, emailSentNotice);

    const now = new Date();
    await updateSession(db, session.phone, {
      email: extractedEmail,
      leadId,
      currentStep: "AWAITING_CONSULTATION_DECISION",
      infoEmailSentAt: now,
      videoSentAt: now,
      consultationPromptDueAt: new Date(Date.now() + 10 * 60 * 1000),
      consultationPromptSent: false,  // Reset dedup flag so the 10-min timer can fire exactly once
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
      followupCount: 0,
    });
    session.currentStep = "AWAITING_CONSULTATION_DECISION";
    session.email = extractedEmail;
    session.leadId = leadId;
    session.consultationPromptDueAt = new Date(Date.now() + 10 * 60 * 1000);

    // 2. Dispatch info email asynchronously so SMTP does not block the WhatsApp webhook or delay video delivery
    (async () => {
      try {
        const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
        await sendWhatsAppInfoEmail({
          phone: session.phone,
          name: session.name,
          email: extractedEmail,
          leadId,
        });
      } catch (emailErr) {
        console.error("[WhatsApp] Error sending info email in background:", emailErr);
      }
    })();

    // 3. Send Step 3 video link after 2 seconds
    try {
      await delay(2000);
      const actualVideoUrl = videoUrl || getVideo482Url();
      await sendTimedVideoAndProcessGuide(session.phone, extractedEmail, actualVideoUrl);
    } catch (delayErr) {
      console.error("[WhatsApp] Error in video delivery delay:", delayErr);
    }

    return {
      replyText: emailSentNotice,
      step: "AWAITING_CONSULTATION_DECISION",
    };
  }

  // 3. STEP 1: Candidate clicked YES to explore Australia Employer Sponsored Work Visa -> Request Email
  if (
    actionId === "BTN_482_YES" ||
    actionId === "BTN_YES_AUSTRALIA" ||
    (session.currentStep === "WELCOME" && isAffirmative && !isDirectEmail)
  ) {
    const emailPrompt = `Great! Now we will  Share All The Details over your email , *please reply with your Email Address:*`;

    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    await updateSession(db, session.phone, {
      currentStep: "AWAITING_EMAIL",
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });
    session.currentStep = "AWAITING_EMAIL";
    await sendTextMessage(session.phone, emailPrompt);
    return { replyText: emailPrompt, step: "AWAITING_EMAIL" };
  }

  // 4. STEP 1: Candidate clicked NOT RIGHT NOW at Welcome -> Re-engagement buttons + 7-day follow-up
  if (
    actionId === "BTN_482_NO" ||
    (session.currentStep === "WELCOME" && isNegative)
  ) {
    const noReply =
      `No problem at all! 😊 Take your time.\n\n` +
      `Whenever you are ready, we are here to help you explore the Australia Employer Sponsored Work Visa! 🇦🇺 Remember — it is a fully employer-sponsored work visa where Australian employers pay for your sponsorship.\n\n` +
      `Tap below if you change your mind:`;
    const btnRes = await sendQuickReplyButtons(session.phone, noReply, [
      { id: "BTN_482_YES", title: "Yes, Interested" },
      { id: "BTN_482_NO", title: "Maybe Later" },
    ]);
    if (!btnRes.success) {
      await sendTextMessage(session.phone, noReply);
    }
    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    await updateSession(db, session.phone, {
      currentStep: "WELCOME",
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });
    session.currentStep = "WELCOME";
    return { replyText: noReply, step: "WELCOME" };
  }

  // 5. STEP 3: Consultation Decision
  if (
    actionId === "BTN_CONSULT_YES" ||
    (session.currentStep === "AWAITING_CONSULTATION_DECISION" && (lowerText === "book" || lowerText === "book consultation" || lowerText === "book meeting" || isAffirmative))
  ) {
    return await sendConsultationDateSelection({
      db,
      session,
    });
  }

  if (
    actionId === "BTN_CONSULT_NO" ||
    (session.currentStep === "AWAITING_CONSULTATION_DECISION" && isNegative)
  ) {
    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    await updateSession(db, session.phone, {
      currentStep: "AWAITING_CONSULTATION_DECISION",
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });
    session.currentStep = "AWAITING_CONSULTATION_DECISION";

    const noReply =
      `No problem at all! 😊 Take your time.\n\n` +
      `Whenever you are ready, we are here to help you explore the Australia Employer Sponsored Work Visa — this is a fully employer-sponsored visa where the Australian employer covers your sponsorship charges! 🇦🇺\n\n` +
      `Tap below when you are ready to book your free consultation:`;
    const btnRes = await sendQuickReplyButtons(session.phone, noReply, [
      { id: "BTN_CONSULT_YES", title: "Book Consultation" },
    ]);
    if (!btnRes.success) {
      await sendTextMessage(session.phone, noReply);
    }
    return { replyText: noReply, step: "AWAITING_CONSULTATION_DECISION" };
  }

  // --- Master Guard: Active CRM Candidates ---
  // (meeting-scheduled, follow-up, sales, payment-pending, document-pending, call-back)
  // All intake steps (email collection, video guides, booking prompts, slot selection)
  // have ALREADY been done by the team! Do NOT ask them for emails or to book meetings.
  const ACTIVE_CRM_STATUSES = [
    "meeting-scheduled",
    "follow-up",
    "sales",
    "payment-pending",
    "document-pending",
    "call-back",
  ];

  const isCrmCandidate =
    Boolean(session.existingLeadNotified) ||
    (session.crmStatus && ACTIVE_CRM_STATUSES.includes(session.crmStatus.toLowerCase().trim())) ||
    (existingLead && existingLead.status && ACTIVE_CRM_STATUSES.includes(existingLead.status.toLowerCase().trim())) ||
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.crmStatus === "follow-up" ||
    Boolean(session.meetingCompletedAt) ||
    existingLead?.meetingStatus === "completed" ||
    existingLead?.status === "follow-up" ||
    Boolean(existingLead?.meetingCompletedAt) ||
    session.currentStep === "MEETING_COMPLETED";

  if (isCrmCandidate) {
    const candidateDisplayName = getSafeCandidateDisplayName(session.name) || (existingLead?.name ? getSafeCandidateDisplayName(existingLead.name) : "") || "there";

    const isRescheduleAction =
      actionId === "BTN_RESCHEDULE" ||
      actionId === "BTN_RESCHEDULE_MEETING" ||
      actionId === "BTN_CHANGE_DAY" ||
      session.currentStep === "RESCHEDULING_DATE" ||
      session.currentStep === "RESCHEDULING_SLOT";

    // 1. If candidate attempts to re-book or reschedule after consultation is already completed (Guard)
    const isMeetingDone = Boolean(
      session.meetingCompleted === true ||
      session.meetingStatus === "completed" ||
      session.currentStep === "MEETING_COMPLETED" ||
      session.crmStatus === "sales" ||
      session.crmStatus === "payment-pending" ||
      session.crmStatus === "document-pending" ||
      session.crmStatus === "follow-up" ||
      Boolean(session.meetingCompletedAt) ||
      existingLead?.meetingStatus === "completed" ||
      existingLead?.meetingDetails?.status === "completed" ||
      existingLead?.status === "follow-up" ||
      Boolean(existingLead?.meetingCompletedAt)
    );

    const isDateOrSlotAction =
      actionId.startsWith("DAY_DATE_") ||
      actionId.startsWith("DAY_SELECT_") ||
      actionId.startsWith("DAY_MORNING_") ||
      actionId.startsWith("DAY_EVENING_") ||
      actionId.startsWith("SELECT_DAY_") ||
      actionId.startsWith("RESCHEDULE_DAY_") ||
      actionId.startsWith("BTN_SLOTS_PART1_") ||
      actionId.startsWith("BTN_SLOTS_PART2_") ||
      actionId.startsWith("SHOW_MORNING_SLOTS_") ||
      actionId.startsWith("SHOW_AFTERNOON_SLOTS_") ||
      actionId.startsWith("SLOT_") ||
      session.currentStep === "SELECTING_DAY" ||
      session.currentStep === "SELECTING_SLOT" ||
      session.currentStep === "RESCHEDULING_DATE" ||
      session.currentStep === "RESCHEDULING_SLOT";

    const isRescheduleAttempt =
      isRescheduleAction ||
      lowerClean.includes("reschedule") ||
      lowerClean.includes("wrong time") ||
      lowerClean.includes("wrong date") ||
      lowerClean.includes("wrong slot") ||
      (lowerClean.includes("change") &&
        (lowerClean.includes("date") ||
          lowerClean.includes("time") ||
          lowerClean.includes("slot") ||
          lowerClean.includes("meeting") ||
          lowerClean.includes("day"))) ||
      (lowerClean.includes("different") &&
        (lowerClean.includes("date") ||
          lowerClean.includes("time") ||
          lowerClean.includes("slot") ||
          lowerClean.includes("meeting") ||
          lowerClean.includes("day")));

    const triesToBookAgain =
      (isMeetingDone && (isRescheduleAttempt || isDateOrSlotAction)) ||
      actionId === "BTN_CONSULT_YES" ||
      actionId === "BTN_YES_AUSTRALIA" ||
      actionId === "BTN_EMAIL_CONFIRM" ||
      actionId === "BTN_SELECT_SLOT" ||
      actionId === "BTN_BOOK_MEETING" ||
      actionId === "BTN_BOOK_CONSULTATION" ||
      (!session.bookedSlot && actionId.startsWith("DAY_DATE_")) ||
      lowerText === "book" ||
      lowerText === "book meeting" ||
      lowerText === "book consultation" ||
      (isMeetingDone && (lowerText === "schedule" || lowerText === "reschedule" || lowerText.includes("meeting")));

    if (triesToBookAgain) {
      let alreadyDoneMsg = "";
      if (session.crmStatus === "meeting-scheduled") {
        const slotText = session.bookedSlot
          ? `scheduled for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**`
          : "already confirmed in our system";
        alreadyDoneMsg =
          `Hello ${candidateDisplayName}! 👋\n\n` +
          `Your 1-on-1 consultation session with our senior visa expert is ${slotText}! 📅\n\n` +
          `Our expert will discuss your eligibility across the 691 occupations and your custom roadmap. If you have any questions before then, feel free to reply right here! 🇦🇺`;
      } else if (session.crmStatus === "sales") {
        alreadyDoneMsg =
          `Hello ${candidateDisplayName}! 👋\n\n` +
          `You are an enrolled candidate with TMS Visa! Your file is currently active with your dedicated Case Manager for employer marketing. 💼🇦🇺\n\n` +
          `Feel free to ask any question about your file, employer matching, or milestones right here!`;
      } else if (session.crmStatus === "payment-pending") {
        alreadyDoneMsg =
          `Hello ${candidateDisplayName}! 👋\n\n` +
          `Your consultation session has already been completed, and your file is in onboarding. 📄\n\n` +
          `If you have any questions about your agreement or payment, feel free to reply right here! 🇦🇺`;
      } else if (session.crmStatus === "document-pending") {
        alreadyDoneMsg =
          `Hello ${candidateDisplayName}! 👋\n\n` +
          `Your consultation has been completed, and our team is currently collecting your onboarding documentation. 📂\n\n` +
          `You can upload any required documents right here on WhatsApp!`;
      } else if (session.crmStatus === "call-back") {
        const cbDate = session.crmCallbackDate ? ` for ${session.crmCallbackDate}` : "";
        alreadyDoneMsg =
          `Hello ${candidateDisplayName}! 👋\n\n` +
          `Our counseling team already has a callback scheduled${cbDate} for you. 📞\n\n` +
          `If you have any questions in the meantime, feel free to reply right here! 🇦🇺`;
      } else {
        alreadyDoneMsg =
          `Hello ${candidateDisplayName}! 👋\n\n` +
          `Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅\n\n` +
          `Since your consultation is already complete, you cannot reschedule or book another meeting. Our review team is currently evaluating your profile to match the requirements of Australian Employers! 🇦🇺\n\n` +
          `📄 Please ensure your latest CV / Resume is uploaded here in PDF or Word document format.\n\n` +
          `If you have any questions regarding your Australia Employer Sponsored Work Visa file or next steps, feel free to reply right here!`;
      }

      await sendTextMessage(session.phone, alreadyDoneMsg);
      await db.collection(SESSIONS_COLLECTION).updateOne(
        { phone: session.phone },
        {
          $set: {
            meetingCompleted: true,
            meetingStatus: "completed",
            crmStatus: session.crmStatus || "follow-up",
            currentStep: "MEETING_COMPLETED",
            updatedAt: new Date(),
          },
          $unset: { bookedSlot: 1 },
        }
      );
      return { replyText: alreadyDoneMsg, step: "MEETING_COMPLETED" };
    }

    // 2. If candidate is awaiting CV submission and sending an acknowledgment or CV-related message
    if (session.currentStep === "AWAITING_CV") {
      const isCvRelatedOrAck =
        lowerClean === "ok" ||
        lowerClean === "okay" ||
        lowerClean === "sure" ||
        lowerClean === "done" ||
        lowerClean === "yes" ||
        lowerClean === "will do" ||
        lowerClean.includes("sending") ||
        lowerClean.includes("will send") ||
        lowerClean.includes("send cv") ||
        lowerClean.includes("upload cv") ||
        lowerClean.includes("how to send") ||
        lowerClean.includes("where to send");

      if (isCvRelatedOrAck) {
        const askCvMsg =
          `Thank you ${candidateDisplayName}! 📄 Please send your updated CV / Resume directly here in PDF or Word document format.\n\n` +
          `Our review team will evaluate your profile against Australian Employer requirements and contact you! 🇦🇺`;
        await sendTextMessage(session.phone, askCvMsg);
        return { replyText: askCvMsg, step: "AWAITING_CV" };
      }
    }

    // 3. If CV was already received and candidate explicitly asks about review status
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
          `Thank you for checking in! Please be patient while our review team is still assessing your qualifications and job experience based on Employers requirements.\n\n` +
          `Once the review is completed, please expect a call from an Australian number.. 🇦🇺📞`;
        await sendTextMessage(session.phone, cvUnderReviewMsg);
        return { replyText: cvUnderReviewMsg, step: "MEETING_COMPLETED" };
      }
    }

    // 4. If candidate asks what more they can send or which documents to provide
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
        `Hello ${candidateDisplayName}! 🇦🇺📄 Here are the essential documents you can share with our review team:\n\n` +
        `1️⃣ **Updated CV / Resume** (Word or PDF format)\n` +
        `2️⃣ **Valid Passport Copy** (Photo & address pages)\n` +
        `3️⃣ **Work Experience Proof** (Relieving letters, reference letters, or recent payslips)\n` +
        `4️⃣ **Educational Certificates** (Degree or Diploma transcripts)\n` +
        `5️⃣ **English Scorecard** (PTE/IELTS) if already taken (otherwise our free weekly PTE classes begin right away!)\n\n` +
        `You can upload any of these files right here in WhatsApp, and our team will review them!`;

      await sendTextMessage(session.phone, docsHelpMsg);
      return { replyText: docsHelpMsg, step: session.currentStep };
    }

    // 4b. Voice Note / Audio handling
    if (cleanText === "[Voice Note / Audio]") {
      const voiceReply =
        `Hello ${candidateDisplayName}! 🎙️\n\n` +
        `Thank you for your voice note! Our counseling desk has received it and our team will listen to it shortly.\n\n` +
        `If you have any urgent details, preferred callback timing, or documents (CV/passport) to share, please feel free to send them right here! 🇦🇺`;
      await sendTextMessage(session.phone, voiceReply);
      return { replyText: voiceReply, step: session.currentStep };
    }

    // 4c. Callback timing preference (e.g. "Call me after 5 PM", "I am at work", "Call tomorrow", "WhatsApp only")
    const isCallbackPreference =
      (lowerClean.includes("call me") ||
        lowerClean.includes("call at") ||
        lowerClean.includes("call after") ||
        lowerClean.includes("call tomorrow") ||
        lowerClean.includes("dont call") ||
        lowerClean.includes("don't call") ||
        lowerClean.includes("busy now") ||
        lowerClean.includes("at work") ||
        lowerClean.includes("message only") ||
        lowerClean.includes("chat only") ||
        lowerClean.includes("whatsapp only")) &&
      !lowerClean.includes("video") &&
      !lowerClean.includes("link");

    if (isCallbackPreference) {
      const noteText = `WhatsApp candidate callback preference: "${cleanText.slice(0, 150)}"`;
      if (session.leadId) {
        await db.collection("leads").updateOne(
          { id: session.leadId },
          {
            $push: { notes: { note: noteText, createdAt: new Date(), createdBy: "WhatsApp Bot" } as any },
            $set: { callbackDate: cleanText.slice(0, 80), updatedAt: new Date() },
          }
        );
      }
      await updateSession(db, session.phone, {
        crmCallbackDate: cleanText.slice(0, 80),
        candidateNotes: [...(session.candidateNotes || []), noteText],
      });

      const callbackAck =
        `Thank you for letting us know, ${candidateDisplayName}! 📝\n\n` +
        `I have updated our counseling desk with your preference: *"${cleanText.slice(0, 100)}"*. Our team will respect your timing and reach out accordingly.\n\n` +
        `You can also continue chatting with me here anytime if you have any questions! 🇦🇺`;

      await sendTextMessage(session.phone, callbackAck);
      return { replyText: callbackAck, step: session.currentStep };
    }

    // 4d. Meeting schedule inquiry (e.g. "When is my meeting?", "What time is my call?", "When will team call?")
    const isAskingMeetingSchedule =
      (lowerClean.includes("when is my meeting") ||
        lowerClean.includes("what time is my meeting") ||
        lowerClean.includes("meeting timing") ||
        lowerClean.includes("meeting time") ||
        lowerClean.includes("meeting date") ||
        lowerClean.includes("when is my call") ||
        lowerClean.includes("when will you call") ||
        lowerClean.includes("when will team call") ||
        lowerClean.includes("what time will you call")) &&
      !lowerClean.includes("book") &&
      !lowerClean.includes("reschedule");

    if (isAskingMeetingSchedule) {
      if (session.bookedSlot) {
        const meetTimeMsg =
          `Hi ${candidateDisplayName}! 📅 Your 1-on-1 consultation session is scheduled for:\n\n` +
          `🗓️ **Date:** ${session.bookedSlot.date}\n` +
          `⏰ **Your Time:** ${session.bookedSlot.candidateTimeLabel || session.bookedSlot.istTimeLabel}\n` +
          `👨‍💼 **Expert:** Senior Visa Migration Counselor\n` +
          `🔗 **Meet Room Link:** ${getStaticGoogleMeetLink()}\n\n` +
          `Please have your CV ready for the discussion. See you then! 🇦🇺`;
        await sendTextMessage(session.phone, meetTimeMsg);
        return { replyText: meetTimeMsg, step: session.currentStep };
      } else if (session.crmMeetingDetails?.meetingDate) {
        const m = session.crmMeetingDetails;
        const meetTimeMsg =
          `Hi ${candidateDisplayName}! 📅 According to our records, your consultation is scheduled for:\n\n` +
          `🗓️ **Date:** ${m.meetingDate}\n` +
          `⏰ **Time:** ${m.candidateTime || `${m.startTime || ""} - ${m.endTime || ""}`}\n` +
          `🔗 **Link:** ${m.meetingLink || getStaticGoogleMeetLink()}\n\n` +
          `Our senior migration expert will connect with you then! 🇦🇺`;
        await sendTextMessage(session.phone, meetTimeMsg);
        return { replyText: meetTimeMsg, step: session.currentStep };
      } else {
        const callingSoonMsg =
          `Hi ${candidateDisplayName}! 👋 Our counseling team typically calls during office hours (10:00 AM – 7:00 PM) in your timezone (${session.timeZoneLabel}).\n\n` +
          `If you have a preferred time to connect, simply reply with your convenient timing (e.g. "Call me after 5 PM") and we will arrange it! 🇦🇺`;
        await sendTextMessage(session.phone, callingSoonMsg);
        return { replyText: callingSoonMsg, step: session.currentStep };
      }
    }

    // 5. If candidate sends a greeting ("hi", "hello", "he'll", etc.) or restart
    const normalizedGreeting = lowerText.replace(/[^a-z]/g, "");
    const isGreeting =
      actionId === "RESTART_FLOW" ||
      ["hi", "hello", "hey", "hell", "helo", "hlw", "heya", "start", "restart", "menu", "namaste", "hlo", "hii", "goodmorning", "goodevening", "goodafternoon"].includes(normalizedGreeting) ||
      lowerText.startsWith("hi ") ||
      lowerText.startsWith("hello ") ||
      lowerText.startsWith("hey ");

    if (isGreeting) {
      let stageDetail = "Your consultation has already been completed and your file is in progress.";
      if (session.crmStatus === "sales") {
        stageDetail = "Your file is active with your dedicated Case Manager for CV marketing and employer matching.";
      } else if (session.crmStatus === "document-pending") {
        stageDetail = "Your consultation is complete and your file is currently in document collection & verification.";
      } else if (session.crmStatus === "payment-pending") {
        stageDetail = "Your consultation is complete and your onboarding fee is currently pending.";
      } else if (session.crmStatus === "follow-up") {
        stageDetail = "Your consultation has been completed and our senior advisory team is following up on your application.";
      }

      const alreadyDoneGreeting =
        `Hello ${candidateDisplayName}! Welcome back to The Migration School (TMS Visa) 🇦🇺.\n\n` +
        `${stageDetail} How can our team assist you today? Feel free to ask any question!`;

      await sendTextMessage(session.phone, alreadyDoneGreeting);
      return { replyText: alreadyDoneGreeting, step: "MEETING_COMPLETED" };
    }

    // 5b. Email Resend, "Send Me Email", 691 List, Brochure, PDF, or Email Delivery Inquiry
    const isAsking691List =
      lowerClean.includes("691") ||
      lowerClean.includes("occupation list") ||
      lowerClean.includes("occupations list") ||
      lowerClean.includes("eligible list") ||
      lowerClean.includes("eligible role") ||
      lowerClean.includes("eligible job") ||
      lowerClean.includes("all list") ||
      lowerClean.includes("full list") ||
      lowerClean.includes("complete list") ||
      lowerClean.includes("roles list") ||
      lowerClean.includes("jobs list") ||
      lowerClean.includes("list of occupation") ||
      lowerClean.includes("list of job") ||
      lowerClean.includes("list of role") ||
      (lowerClean.includes("list") &&
        (lowerClean.includes("give") ||
          lowerClean.includes("send") ||
          lowerClean.includes("share") ||
          lowerClean.includes("show") ||
          lowerClean.includes("bhejo") ||
          lowerClean.includes("do") ||
          lowerClean.includes("all") ||
          lowerClean.includes("where")));

    const isResendOrSendEmailRequest =
      // Asking to send again or resend (handles typos like "give mer again")
      lowerClean.includes("resend") ||
      lowerClean.includes("again") ||
      lowerClean.includes("send me email") ||
      lowerClean.includes("send email") ||
      lowerClean.includes("send me mail") ||
      lowerClean.includes("send mail") ||
      lowerClean.includes("give me email") ||
      lowerClean.includes("give email") ||
      lowerClean.includes("give mail") ||
      lowerClean.includes("email me") ||
      lowerClean.includes("mail me") ||
      lowerClean.includes("email send") ||
      lowerClean.includes("mail send") ||
      lowerClean.includes("email bhejo") ||
      lowerClean.includes("mail bhejo") ||
      lowerClean.includes("send on email") ||
      lowerClean.includes("share on email") ||
      lowerClean.includes("forward to my email") ||
      lowerClean.includes("send to my email") ||
      lowerClean.includes("send to email") ||
      lowerClean.includes("email pe bhejo") ||
      lowerClean.includes("mail pe bhejo") ||
      // Delivery issues / not received (including typos like "recieved")
      lowerClean.includes("did not receive") ||
      lowerClean.includes("didn't receive") ||
      lowerClean.includes("did not recieved") ||
      lowerClean.includes("didn't recieved") ||
      lowerClean.includes("not received") ||
      lowerClean.includes("not recieved") ||
      lowerClean.includes("not receive") ||
      lowerClean.includes("not recieve") ||
      lowerClean.includes("haven't received") ||
      lowerClean.includes("have not received") ||
      lowerClean.includes("havent received") ||
      lowerClean.includes("haven't recieved") ||
      lowerClean.includes("have not recieved") ||
      lowerClean.includes("havent recieved") ||
      lowerClean.includes("did not get") ||
      lowerClean.includes("didn't get") ||
      lowerClean.includes("not get") ||
      lowerClean.includes("no mail") ||
      lowerClean.includes("no email") ||
      lowerClean.includes("mail nahi") ||
      lowerClean.includes("email nahi") ||
      lowerClean.includes("mail aaya nahi") ||
      lowerClean.includes("email aaya nahi") ||
      // Documents, brochure, PDF, guides
      lowerClean.includes("brochure") ||
      lowerClean.includes("information pack") ||
      lowerClean.includes("info pack") ||
      lowerClean.includes("visa guide") ||
      lowerClean.includes("process guide") ||
      (lowerClean.includes("pdf") &&
        (lowerClean.includes("send") ||
          lowerClean.includes("give") ||
          lowerClean.includes("share") ||
          lowerClean.includes("email") ||
          lowerClean.includes("mail") ||
          lowerClean.includes("bhejo"))) ||
      (lowerClean.includes("document") &&
        (lowerClean.includes("send") ||
          lowerClean.includes("give") ||
          lowerClean.includes("email") ||
          lowerClean.includes("mail") ||
          lowerClean.includes("bhejo")));

    if (isAsking691List || isResendOrSendEmailRequest) {
      const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const targetEmail = emailMatch ? emailMatch[0].toLowerCase() : (session.email || existingLead?.email);

      if (targetEmail) {
        if (emailMatch && session.email !== targetEmail) {
          session.email = targetEmail;
          await updateSession(db, session.phone, { email: targetEmail });
          const cleanLeadPhone = session.phone.replace(/[^\d]/g, "").replace(/^00/, "");
          const phoneQueries = [
            ...(session.leadId ? [{ id: session.leadId }] : []),
            ...(existingLead ? [{ id: existingLead.id }] : []),
            { phone: cleanLeadPhone },
            { phone: `+${cleanLeadPhone}` },
            { phone: { $regex: `${cleanLeadPhone.slice(-10)}$` } },
          ];
          await db.collection("leads").updateMany(
            { $or: phoneQueries },
            { $set: { email: targetEmail, updatedAt: new Date() } }
          );
        }

        const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
        const sendRes = await sendWhatsAppInfoEmail({
          phone: session.phone,
          name: session.name || existingLead?.name || "Applicant",
          email: targetEmail,
          leadId: session.leadId || existingLead?.id,
        });

        if (sendRes.success) {
          await updateSession(db, session.phone, {
            infoEmailSentAt: new Date(),
            email: targetEmail,
          });

          const successMsg = isAsking691List
            ? `✅ I have immediately dispatched the complete **691 Eligible Occupation List (PDF)** & **Australia Work Visa Information Pack** to **${targetEmail}**! 📩\n\n` +
              `📎 **Attached in your email:**\n` +
              `• 🇦🇺 **Official 691 Eligible Occupation List (PDF)**\n` +
              `• 📋 **Full Subclass 482 Work Visa Process & Sponsorship Details**\n\n` +
              `📬 *Important:* Please check both your **Inbox** and **Spam/Junk folder** right now.\n\n` +
              `💡 *Quick Check:* Reply with your **Job Title** and **Years of Experience** right here for a free instant eligibility check! 🇦🇺\n\n` +
              `Need it sent to a different email address? Just reply: *"My email is yourname@example.com"*. 📧`
            : `✅ We have immediately sent the official **Australia Employer Sponsored Work Visa Information Pack** & **691 Eligible Occupation List (PDF)** to **${targetEmail}**! 📩\n\n` +
              `📎 **Attached in your email:**\n` +
              `• 🇦🇺 **Official 691 Eligible Occupation List (PDF)**\n` +
              `• 📋 **Full Subclass 482 Work Visa Process & Sponsorship Details**\n\n` +
              `📬 *Important:* Please check both your **Inbox** and **Spam/Junk folder** (emails with PDF attachments from new corporate domains can sometimes be filtered there).\n\n` +
              `Need it sent to a different email address? Just reply: *"My email is yourname@example.com"*. 📧`;

          await sendTextMessage(session.phone, successMsg);
          return { replyText: successMsg, step: session.currentStep };
        } else {
          const failMsg =
            `⚠️ We attempted to dispatch your visa information pack to **${targetEmail}**, but encountered a delivery error.\n\n` +
            `Please verify if your email address is spelled correctly or reply with an alternate email address (e.g. *"My email is yourname@gmail.com"*). You can also write to **info@tmsvisa.com** directly for urgent assistance.`;

          await sendTextMessage(session.phone, failMsg);
          return { replyText: failMsg, step: session.currentStep };
        }
      } else {
        const askEmailMsg =
          `I would be delighted to send you the official Australia Employer Sponsored Work Visa Information Pack & Complete 691 Eligible Occupation List (PDF)! 📄🇦🇺\n\n` +
          `Please reply with your **Email Address** (e.g. name@gmail.com) so I can dispatch it to your inbox immediately. 📧`;

        await sendTextMessage(session.phone, askEmailMsg);
        return { replyText: askEmailMsg, step: session.currentStep };
      }
    }

    // 6. For ANY other inquiry or conversational message from an existing CRM candidate:
    // Answer directly using Context-Aware AI with Directive 0 (strictly forbidding asking for email or consultation booking)
    let aiAnswer = "";
    try {
      aiAnswer = await generateAiResponse({
        message: cleanText,
        session,
      });
    } catch (err) {
      console.error("[WhatsApp AI] generateAiResponse threw error for existing candidate:", err);
    }

    const finalAnswer =
      aiAnswer && aiAnswer.trim()
        ? aiAnswer
        : `Hello ${candidateDisplayName}! 👋\n\nThank you for reaching out to The Migration School (TMS Visa) 🇦🇺.\n\nOur counseling desk has your details on file. How can our team assist you with your Australia Employer Sponsored Work Visa today? Feel free to ask any question regarding requirements, occupations, or your application status!`;

    await sendTextMessage(session.phone, finalAnswer);
    return { replyText: finalAnswer, step: session.currentStep };
  }

  // --- Check: Email Resend, "Send Me Email", 691 List, Brochure, PDF, or Email Delivery Inquiry ---
  const isAsking691List =
    lowerClean.includes("691") ||
    lowerClean.includes("occupation list") ||
    lowerClean.includes("occupations list") ||
    lowerClean.includes("eligible list") ||
    lowerClean.includes("eligible role") ||
    lowerClean.includes("eligible job") ||
    lowerClean.includes("all list") ||
    lowerClean.includes("full list") ||
    lowerClean.includes("complete list") ||
    lowerClean.includes("roles list") ||
    lowerClean.includes("jobs list") ||
    lowerClean.includes("list of occupation") ||
    lowerClean.includes("list of job") ||
    lowerClean.includes("list of role") ||
    (lowerClean.includes("list") && (lowerClean.includes("give") || lowerClean.includes("send") || lowerClean.includes("share") || lowerClean.includes("show") || lowerClean.includes("bhejo") || lowerClean.includes("do") || lowerClean.includes("all") || lowerClean.includes("where")));

  const isResendOrSendEmailRequest =
    // Asking to send again or resend (handles typos like "give mer again")
    lowerClean.includes("resend") ||
    lowerClean === "again" ||
    lowerClean.startsWith("send again") ||
    lowerClean.includes("send it again") ||
    lowerClean.includes("send me again") ||
    lowerClean.includes("bhejo phir") ||
    lowerClean.includes("dobara bhejo") ||
    lowerClean.includes("resend it") ||
    lowerClean.includes("send me email") ||
    lowerClean.includes("send email") ||
    lowerClean.includes("send mail") ||
    lowerClean.includes("give me email") ||
    lowerClean.includes("give email") ||
    lowerClean.includes("email me") ||
    lowerClean.includes("mail me") ||
    lowerClean.includes("email send") ||
    lowerClean.includes("mail send") ||
    lowerClean.includes("email bhejo") ||
    lowerClean.includes("mail bhejo") ||
    lowerClean.includes("send on email") ||
    lowerClean.includes("share on email") ||
    lowerClean.includes("forward to my email") ||
    lowerClean.includes("send to my email") ||
    lowerClean.includes("send to email") ||
    lowerClean.includes("email pe bhejo") ||
    lowerClean.includes("mail pe bhejo") ||
    // Delivery issues / not received
    lowerClean.includes("did not receive") ||
    lowerClean.includes("didn't receive") ||
    lowerClean.includes("not received") ||
    lowerClean.includes("not receive") ||
    lowerClean.includes("haven't received") ||
    lowerClean.includes("have not received") ||
    lowerClean.includes("havent received") ||
    lowerClean.includes("did not get") ||
    lowerClean.includes("didn't get") ||
    lowerClean.includes("not get") ||
    lowerClean.includes("email nahi") ||
    lowerClean.includes("mail nahi") ||
    // Documents, brochure, PDF, guides
    lowerClean.includes("brochure") ||
    lowerClean.includes("pte guide") ||
    lowerClean.includes("information pack") ||
    lowerClean.includes("info pack") ||
    lowerClean.includes("visa guide") ||
    lowerClean.includes("process guide") ||
    (lowerClean.includes("pdf") && (lowerClean.includes("send") || lowerClean.includes("give") || lowerClean.includes("share") || lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    (lowerClean.includes("document") && (lowerClean.includes("send") || lowerClean.includes("give") || lowerClean.includes("email") || lowerClean.includes("mail")));

  const isEmailOrListRequest = isAsking691List || isResendOrSendEmailRequest;

  if (isEmailOrListRequest) {
    const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const targetEmail = emailMatch ? emailMatch[0].toLowerCase() : (session.email || existingLead?.email);

    if (targetEmail) {
      if (emailMatch && session.email !== targetEmail) {
        session.email = targetEmail;
        await updateSession(db, session.phone, { email: targetEmail });
        if (session.leadId) {
          await db.collection("leads").updateOne(
            { id: session.leadId },
            { $set: { email: targetEmail, updatedAt: new Date() } }
          );
        }
      }

      const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
      const sendRes = await sendWhatsAppInfoEmail({
        phone: session.phone,
        name: session.name || existingLead?.name || "Applicant",
        email: targetEmail,
        leadId: session.leadId || existingLead?.id,
      });

      if (sendRes.success) {
        await updateSession(db, session.phone, {
          infoEmailSentAt: new Date(),
          email: targetEmail,
        });

        const successMsg = isAsking691List
          ? `✅ I have immediately dispatched the complete **691 Eligible Occupation List (PDF)** & **Australia Work Visa Information Pack** to **${targetEmail}**! 📩\n\n` +
          `📎 **Attached in your email:**\n` +
          `• 🇦🇺 **Official 691 Eligible Occupation List (PDF)**\n` +
          `• 📋 **Full Subclass 482 Work Visa Process & Sponsorship Details**\n\n` +
          `📬 *Important:* Please check both your **Inbox** and **Spam/Junk folder** right now.\n\n` +
          `💡 *Quick Check:* Listing all 691 occupations here is too long for WhatsApp, but you can reply with your **Job Title** and **Years of Experience** right here for a free instant eligibility check! 🇦🇺\n\n` +
          `Need it sent to a different email address? Just reply: *"My email is yourname@example.com"*. 📧`
          : `✅ We have immediately sent the official **Australia Employer Sponsored Work Visa Information Pack** to **${targetEmail}**! 📩\n\n` +
          `📎 **Attached in your email:**\n` +
          `• 🇦🇺 **Official 691 Eligible Occupation List (PDF)**\n` +
          `• 📋 **Full Subclass 482 Work Visa Process & Sponsorship Details**\n\n` +
          `📬 *Important:* Please check both your **Inbox** and **Spam/Junk folder** (emails with PDF attachments from new corporate domains can sometimes be filtered there).\n\n` +
          `Need it sent to a different email address? Just reply: *"My email is yourname@example.com"*. 📧`;

        await sendTextMessage(session.phone, successMsg);
        return { replyText: successMsg, step: session.currentStep };
      } else {
        const failMsg =
          `⚠️ We attempted to dispatch your visa information pack to **${targetEmail}**, but encountered a delivery error.\n\n` +
          `Please verify if your email address is spelled correctly or reply with an alternate email address (e.g. *"My email is yourname@gmail.com"*). You can also write to **info@tmsvisa.com** directly for urgent assistance.`;

        await sendTextMessage(session.phone, failMsg);
        return { replyText: failMsg, step: session.currentStep };
      }
    } else {
      const askEmailMsg =
        `I would be delighted to send you the official Australia Employer Sponsored Work Visa Information Pack & Complete 691 Eligible Occupation List (PDF)! 📄🇦🇺\n\n` +
        `Please reply with your **Email Address** (e.g. name@gmail.com) so I can dispatch it to your inbox immediately. 📧`;

      await sendTextMessage(session.phone, askEmailMsg);
      return { replyText: askEmailMsg, step: session.currentStep };
    }
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
      await db.collection("meetingSlots").updateMany(
        {
          phone: session.phone,
          channel: { $ne: "WhatsApp Ireland" },
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
    const nextFollowup = getNext10AmInTimezone(session.timeZone || "Asia/Kolkata");
    await updateSession(db, session.phone, {
      meetingStatus: "canceled",
      meetingCanceledAt: new Date(),
      meetingCancellationReason: cleanText || "Requested by candidate via WhatsApp",
      bookedSlot: undefined,
      currentStep: "RESCHEDULING_DATE",
      followupCount: 0,
      nextFollowupAt: nextFollowup,
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
      `Hello ${session.name || "there"}! 👋\n\n` +
      `Your consultation meeting has been cancelled. ℹ️\n\n` +
      `Please reschedule your 1-on-1 session for an upcoming weekend so our expert can assess your Australia Employer Sponsored Work Visa file.\n\n` +
      `👉 Tap below to choose an available time slot:`;

    await sendQuickReplyButtons(session.phone, cancelMsg, [
      { id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" },
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



  // Handle Watch 482 Video button click or text asking for video
  const isVideoRequest =
    actionId === "BTN_ASK_VIDEO" ||
    lowerText === "video" ||
    lowerText === "give me video" ||
    lowerText === "send video" ||
    lowerText === "send me video" ||
    lowerText === "watch video" ||
    lowerText === "video link" ||
    lowerText === "video bhejo" ||
    lowerText === "show me video" ||
    lowerText === "show video" ||
    lowerText.includes("watch video") ||
    lowerText.includes("give me video") ||
    lowerText.includes("send video") ||
    lowerText.includes("video link") ||
    lowerText.includes("explainer video");

  if (isVideoRequest) {
    const videoUrl = getVideo482Url();
    const videoReply =
      `Here is our Australia Employer Sponsored Work Visa explainer video! 🎥🇦🇺\n\n` +
      `▶️ **Watch the Video Here:**\n${videoUrl}\n\n` +
      `It explains employer sponsorship requirements, eligible occupations, salary benchmarks (AUD $76,500+), and relocation pathways.\n\n`;

    await sendTextMessage(session.phone, videoReply);
    return { replyText: videoReply, step: session.currentStep };
  }

  // =========================================================================
  // --- GLOBAL CONSULTATION BOOKING INTENT INTERCEPTOR (AUSTRALIA) ---
  // If the candidate says ANY variation of wanting to book a meeting
  // (e.g. "want to book a meeting", "i wnt to book a meering", "book meeting",
  // "schedule meeting", "book consultation", "book a call", "appointment", etc.):
  // 1. Check if they already booked a meeting:
  //    - If YES (active booked slot): Remind them of their confirmed meeting details
  //      and provide [Change Date & Time] button.
  //    - If COMPLETED: Remind them consultation is complete and prompt for CV.
  //    - If NO: IMMEDIATELY send the interactive 8-weekend date selection list ("Select Date")!
  // =========================================================================
  const BOOKING_ACTION_IDS_GLOBAL = [
    "BTN_CONSULT_YES",
    "BTN_BOOK_MEETING",
    "BTN_SELECT_SLOT",
    "BTN_BOOK_CONSULTATION",
  ];

  const hasExplicitBookingPhraseGlobal =
    lowerText === "book" ||
    lowerText === "book meeting" ||
    lowerText === "book a meeting" ||
    lowerText === "booking" ||
    lowerText === "book consultation" ||
    lowerText === "schedule meeting" ||
    lowerText === "schedule a meeting" ||
    lowerText === "schedule consultation" ||
    lowerText === "book slot" ||
    lowerText === "select slot" ||
    lowerText === "book a call" ||
    lowerText === "schedule a call" ||
    lowerText.includes("book a meeting") ||
    lowerText.includes("book meeting") ||
    lowerText.includes("book consultation") ||
    lowerText.includes("schedule meeting") ||
    lowerText.includes("schedule consultation") ||
    lowerText.includes("book a call") ||
    lowerText.includes("schedule a call") ||
    lowerText.includes("book slot") ||
    lowerText.includes("select slot") ||
    lowerText.includes("want to book") ||
    lowerText.includes("wnt to book") ||
    lowerText.includes("want meeting") ||
    lowerText.includes("need meeting") ||
    lowerText.includes("want consultation") ||
    lowerText.includes("need consultation") ||
    lowerText.includes("appointment chahiye") ||
    lowerText.includes("meeting karni") ||
    lowerText.includes("baat karni") ||
    /(?:i\s+)?(?:want|wnt|need|like)\s+(?:to\s+)?(?:book|take|schedule|have)\s+(?:a\s+)?(?:meeting|meering|meting|consultation|call|slot|appointment)/i.test(lowerText) ||
    /^(?:book|schedule)\s+(?:a\s+)?(?:meeting|meering|meting|consultation|call|slot|appointment)$/i.test(lowerText);

  const isGlobalBookingRequest = BOOKING_ACTION_IDS_GLOBAL.includes(actionId) || hasExplicitBookingPhraseGlobal;

  if (isGlobalBookingRequest) {
    const isMeetingCompleted = Boolean(
      session.meetingCompleted ||
      session.meetingStatus === "completed" ||
      session.crmStatus === "follow-up" ||
      Boolean(session.meetingCompletedAt) ||
      existingLead?.meetingStatus === "completed" ||
      existingLead?.status === "follow-up" ||
      existingLead?.meetingDetails?.status === "completed" ||
      Boolean(existingLead?.meetingCompletedAt) ||
      session.currentStep === "MEETING_COMPLETED"
    );

    if (isMeetingCompleted) {
      const candidateDisplayName =
        session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
          ? session.name
          : (existingLead?.name ? getSafeCandidateDisplayName(existingLead.name) : "");
      const nameGreeting = candidateDisplayName ? ` ${candidateDisplayName}` : "";
      const completedMsg =
        `Hello${nameGreeting}! 👋 Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅\n\n` +
        `Since your consultation is already complete, you cannot reschedule or book another meeting. Our review team is currently evaluating your profile to match the requirements of Australian Employers! 🇦🇺\n\n` +
        `Please ensure your latest CV / Resume is uploaded here in PDF or Word document format! 📄\n\n` +
        `If you have any questions regarding your application or next steps, feel free to reply right here!`;
      await sendTextMessage(session.phone, completedMsg);
      await db.collection(SESSIONS_COLLECTION).updateOne(
        { phone: session.phone },
        {
          $set: {
            meetingCompleted: true,
            meetingStatus: "completed",
            crmStatus: session.crmStatus || "follow-up",
            currentStep: "MEETING_COMPLETED",
            updatedAt: new Date(),
          },
          $unset: { bookedSlot: 1 },
        }
      );
      return { replyText: completedMsg, step: "MEETING_COMPLETED" };
    }

    const hasActiveBooking = Boolean(session.bookedSlot || session.meetingStatus === "booked" || session.meetingStatus === "rescheduled" || session.crmStatus === "meeting-scheduled");

    if (hasActiveBooking && session.bookedSlot) {
      const meetLink = getStaticGoogleMeetLink();
      const candTimeDisplay = session.bookedSlot.candidateTimeLabel || session.bookedSlot.istTimeLabel;
      const candidateDisplayName =
        session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
          ? session.name
          : "";
      const nameGreeting = candidateDisplayName ? ` ${candidateDisplayName}` : "";
      const bookedReminder =
        `Hello${nameGreeting}! 👋 Your 1-on-1 consultation with our Senior Migration Expert is already confirmed:\n\n` +
        `📅 **Date:** ${session.bookedSlot.date}\n` +
        `⏰ **Time:** ${candTimeDisplay}\n` +
        `💻 **Google Meet Link:** ${meetLink}\n\n` +
        `Please make sure to join on time with your CV ready! 🇦🇺\n` +
        `Need to change your date or time? Tap below:`;
      await sendQuickReplyButtons(session.phone, bookedReminder, [
        { id: "BTN_RESCHEDULE", title: "Change Date & Time" },
        { id: "BTN_ASK_VIDEO", title: "Watch Visa Video" },
      ]);
      return { replyText: bookedReminder, step: "BOOKED" };
    }

    // Candidate has NOT booked a meeting -> Immediately send the Interactive 8-Weekend Selection List ("Select Date")!
    return sendConsultationDateSelection({ db, session });
  }

  // 1. Initial State: WELCOME (when starting or saying hi)
  const isFreshWelcome =
    session.currentStep === "WELCOME" &&
    !actionId &&
    !isGreeting &&
    !isAffirmative &&
    !isNegative &&
    !isDirectEmail &&
    !isGlobalBookingRequest &&
    !session.email;

  // 1a. If candidate already has a booked consultation and sends a greeting ("hi", "hello", etc.)
  if (isGreeting && (session.currentStep === "BOOKED" || session.bookedSlot) && !session.meetingCompleted && session.meetingStatus !== "completed" && session.crmStatus !== "follow-up") {
    const meetLink = getStaticGoogleMeetLink();
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
        ? session.name
        : "";
    const nameGreeting = candidateDisplayName ? ` ${candidateDisplayName}` : "";

    const dateStr = session.bookedSlot?.date || "";
    const timeStr = session.bookedSlot?.candidateTimeLabel || session.bookedSlot?.istTimeLabel || "";

    const welcomeBackMsg =
      `Hello${nameGreeting}! Welcome back to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `Your 1-on-1 consultation with our senior visa expert is confirmed:\n` +
      `📅 **Date:** ${dateStr}\n` +
      `⏰ **Time:** ${timeStr}\n` +
      `💻 **Google Meet Link:** ${meetLink}\n\n` +
      `How can I assist you today? You can ask any question, or choose an option below:`;

    await sendQuickReplyButtons(session.phone, welcomeBackMsg, [
      { id: "BTN_RESCHEDULE", title: "Change Date & Time" },
      { id: "BTN_ASK_VIDEO", title: "Watch Visa Video" },
    ]);
    return { replyText: welcomeBackMsg, step: "BOOKED" };
  }

  // 1b. If candidate's meeting was cancelled and sends a greeting ("hi", "hello", etc.)
  if (isGreeting && (session.meetingStatus === "canceled" || session.currentStep === "AWAITING_REENGAGEMENT") && !session.bookedSlot && session.email) {
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
        ? session.name
        : "";
    const nameGreeting = candidateDisplayName ? ` ${candidateDisplayName}` : "";

    const cancelledGreetingMsg =
      `Hello${nameGreeting}! Welcome back to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `Your consultation meeting was previously cancelled. ℹ️\n\n` +
      `Please reschedule your 1-on-1 session for an upcoming weekend so our expert can assess your Australia Employer Sponsored Work Visa file!\n\n` +
      `👉 Tap below to choose an available time slot:`;

    await sendQuickReplyButtons(session.phone, cancelledGreetingMsg, [
      { id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" },
      { id: "BTN_ASK_VIDEO", title: "Watch Visa Video" },
    ]);
    return { replyText: cancelledGreetingMsg, step: "AWAITING_REENGAGEMENT" };
  }

  // 1c. If candidate already registered their email and sends a greeting ("hi", "hello", etc.)
  if (isGreeting && session.email) {
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
        ? session.name
        : "";
    const nameGreeting = candidateDisplayName ? ` ${candidateDisplayName}` : "";

    const welcomeBackMsg =
      `Hello${nameGreeting}! Welcome back to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `Your profile is already registered with us (**${session.email}**).\n\n` +
      `Would you like to schedule your free 1-on-1 weekend consultation with our senior visa expert?`;

    await sendQuickReplyButtons(session.phone, welcomeBackMsg, [
      { id: "BTN_CONSULT_YES", title: "Book Consultation" },
      { id: "BTN_ASK_VIDEO", title: "Watch Visa Video" },
    ]);
    return { replyText: welcomeBackMsg, step: "VIDEO_SENT_AWAITING_INTEREST" };
  }

  // 1c. Brand-new candidate or explicit reset
  if (actionId === "RESTART_FLOW" || (isGreeting && !session.email && !session.bookedSlot) || isFreshWelcome) {
    // If the welcome message was already sent once (or candidate has active conversation history) and candidate is asking questions/conversing,
    // answer their question directly using AI without repeatedly spamming the welcome buttons!
    const alreadyWelcomed =
      Boolean(session.welcomeSentAt) ||
      Boolean(session.conversationHistory && session.conversationHistory.length > 1);

    if (alreadyWelcomed && cleanText.length > 0 && actionId !== "RESTART_FLOW") {
      const aiAnswer = await generateAiResponse({
        message: cleanText,
        session,
      });
      await sendTextMessage(session.phone, aiAnswer);
      await updateSession(db, session.phone, {
        lastInteractionAt: new Date(),
        welcomeSentAt: session.welcomeSentAt || new Date(),
      });
      return { replyText: aiAnswer, step: "WELCOME" };
    }

    if (isFreshWelcome && cleanText.length > 0 && !isGreeting) {
      // The candidate sent an actual question or background details at the start!
      const aiAnswer = await generateAiResponse({
        message: cleanText,
        session,
      });

      // Send the comprehensive human visa expert reply first via plain text (avoids Meta 1024-char interactive button limit)
      await sendTextMessage(session.phone, aiAnswer);

      const buttonPrompt = `*Would you like to explore your eligibility for the Australia Employer Sponsored Work Visa?*`;
      await sendQuickReplyButtons(session.phone, buttonPrompt, [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ]);

      const nextFollowup = getNext10AmInTimezone(session.timeZone);
      await updateSession(db, session.phone, {
        currentStep: "WELCOME",
        welcomeSentAt: new Date(),
        followupCount: 0,
        nextFollowupAt: nextFollowup,
      });
      return { replyText: `${aiAnswer}\n\n${buttonPrompt}`, step: "WELCOME" };
    }

    const welcomeText =
      `Hello ☺️! Welcome to The Migration School (TMS Visa) 🇦🇺.\n` +
      `We specialize in employer-sponsored work visas for Australia.\n` +
      `*We have received your enquiry for Australia Employer Sponsored Work Visa, to know all the details ,choose  Insterested*`;

    await sendQuickReplyButtons(session.phone, welcomeText, [
      { id: "BTN_482_YES", title: "Yes, Interested" },
      { id: "BTN_482_NO", title: "Not Right Now" },
    ]);

    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    await updateSession(db, session.phone, {
      currentStep: "WELCOME",
      welcomeSentAt: new Date(),
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });
    return { replyText: welcomeText, step: "WELCOME" };
  }

  // 2. Candidate said NO / Maybe Later at any stage -> Trigger 7-day reminder cycle for their current step
  if (isNegative) {
    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    const targetStep: WhatsAppStep =
      actionId === "BTN_CONSULT_NO" ||
        session.currentStep === "AWAITING_CONSULTATION_DECISION" ||
        session.currentStep === "VIDEO_SENT_AWAITING_INTEREST"
        ? "AWAITING_CONSULTATION_DECISION"
        : session.currentStep === "SELECTING_DAY" ||
          session.currentStep === "SELECTING_SLOT" ||
          session.currentStep === "AWAITING_CV" ||
          session.currentStep === "RESCHEDULING_DATE" ||
          session.currentStep === "RESCHEDULING_SLOT"
          ? session.currentStep
          : "WELCOME";

    await updateSession(db, session.phone, {
      currentStep: targetStep,
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });

    // If candidate said Maybe Later at consultation step — send re-engagement button so they can come back
    if (targetStep === "AWAITING_CONSULTATION_DECISION") {
      const noReply =
        `No problem at all! 😊 Take your time.\n\n` +
        `Whenever you are ready, we are here to help you explore the Australia Employer Sponsored Work Visa — this is a fully employer-sponsored visa where the Australian employer covers your sponsorship charges! 🇦🇺\n\n` +
        `Tap below when you are ready to book your free consultation:`;
      const btnRes = await sendQuickReplyButtons(session.phone, noReply, [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
      ]);
      if (!btnRes.success) {
        await sendTextMessage(session.phone, noReply);
      }
      return { replyText: noReply, step: targetStep };
    }

    // If candidate said Not Right Now at the welcome step — send re-engagement button
    if (targetStep === "WELCOME" || actionId === "BTN_482_NO") {
      const noReply =
        `No problem at all! 😊 Take your time.\n\n` +
        `Whenever you are ready, we are here to help you explore the Australia Employer Sponsored Work Visa! 🇦🇺 Remember — it is a fully employer-sponsored work visa where Australian employers pay for your sponsorship.\n\n` +
        `Tap below if you change your mind:`;
      const btnRes = await sendQuickReplyButtons(session.phone, noReply, [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Maybe Later" },
      ]);
      if (!btnRes.success) {
        await sendTextMessage(session.phone, noReply);
      }
      return { replyText: noReply, step: targetStep };
    }

    const noReply =
      `No problem at all! Feel free to review our updates anytime when you are ready to explore Australian migration with TMS Visa 🇦🇺.\n\n` +
      `We'll keep you posted with relevant visa updates. Have a wonderful day!`;
    await sendTextMessage(session.phone, noReply);
    return { replyText: noReply, step: targetStep };
  }



  // 5. Candidate wants Consultation, Mentions a Day/Date, or wants to Reschedule/Change Date
  if (actionId === "BTN_SELECT_SLOT" && session.activeSlotsDate) {
    actionId = `DAY_DATE_${session.activeSlotsDate}`;
  }

  const weekends = getUpcomingWeekendDays(10);
  const matchedWeekendDate =
    !actionId || actionId === "BTN_SELECT_SLOT"
      ? matchWeekendDateFromText(
          cleanText,
          weekends,
          session.currentStep === "SELECTING_DAY"
        )
      : null;

  const WEEKDAY_REGEX = /\b(monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri|weekdays?)\b/i;
  const isWeekdayMention = WEEKDAY_REGEX.test(lowerText);

  const isSaturdayMention = /\b(saturdays?|sat)\b/i.test(lowerText);
  const isSundayMention = /\b(sundays?|sun)\b/i.test(lowerText);
  const isWeekendMention = isSaturdayMention || isSundayMention || /\b(weekends?)\b/i.test(lowerText);

  const isRescheduleIntent =
    actionId === "BTN_RESCHEDULE" ||
    actionId === "BTN_RESCHEDULE_MEETING" ||
    actionId === "BTN_CHANGE_DAY" ||
    actionId === "BTN_SELECT_SLOT" ||
    session.currentStep === "RESCHEDULING_DATE" ||
    session.currentStep === "RESCHEDULING_SLOT" ||
    lowerText.includes("reschedule") ||
    lowerText.includes("wrong time") ||
    lowerText.includes("wrong date") ||
    lowerText.includes("wrong slot") ||
    (lowerText.includes("change") &&
      (lowerText.includes("date") ||
        lowerText.includes("time") ||
        lowerText.includes("slot") ||
        lowerText.includes("meeting") ||
        lowerText.includes("day"))) ||
    (lowerText.includes("different") &&
      (lowerText.includes("date") ||
        lowerText.includes("time") ||
        lowerText.includes("slot") ||
        lowerText.includes("day")));

  const BOOKING_KEYWORDS = [
    "meeting", "meet", "book", "booking", "schedule", "scheduling",
    "consult", "consultation", "appointment", "slot", "slots",
    "meering", "meting", "scheduale", "bok",
    "call with expert", "expert call", "talk to expert", "speak with expert",
    "video call", "google meet", "1 on 1", "1-on-1", "when can we talk",
    "when can we meet", "choose time", "select time", "select date",
    "available date", "available slot", "free slot", "lock slot",
    "baat karni", "meeting karni", "call karni", "appointment chahiye",
    "want to book", "wnt to book", "want meeting", "need meeting", "want consultation",
  ];
  const hasBookingKeyword =
    BOOKING_KEYWORDS.some((kw) => {
      if (kw.length <= 4) {
        const rx = new RegExp(`\\b${kw}\\b`, "i");
        return rx.test(lowerText);
      }
      return lowerText.includes(kw);
    }) ||
    /(?:i\s+)?(?:want|wnt|need|like)\s+(?:to\s+)?(?:book|take|schedule|have)\s+(?:a\s+)?(?:meeting|meering|meting|consultation|call|slot|appointment)/i.test(lowerText);

  const candidateDisplayName =
    session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
      ? session.name
      : "";
  const nameSalutation = candidateDisplayName ? ` ${candidateDisplayName}` : "";
  const isIndia = session.countryCode === "IN";

  const candWindowMsg = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);
  const weekdayExplanation =
    `Hello${nameSalutation}! 👋 Our free 1-on-1 consultations with our Senior Migration Experts are strictly scheduled for **Saturdays and Sundays** between **${candWindowMsg.displayWindow}** to accommodate dedicated evaluation sessions.\n\n` +
    `• **Format:** Dedicated 1-hour Google Meet session.\n` +
    `• **Agenda:** CV review, eligibility check across 691 occupations, and custom visa roadmap.\n` +
    `• **Cost:** 100% Free.\n\n` +
    `Please select your preferred upcoming weekend date from the menu below:`;

  // 5a. If candidate already has an active confirmed consultation
  const isMeetingDoneOverall = Boolean(
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.currentStep === "MEETING_COMPLETED" ||
    session.crmStatus === "follow-up" ||
    Boolean(session.meetingCompletedAt) ||
    existingLead?.meetingStatus === "completed" ||
    existingLead?.meetingDetails?.status === "completed" ||
    existingLead?.status === "follow-up" ||
    Boolean(existingLead?.meetingCompletedAt)
  );

  const getCompletedMessageText = () => {
    const candName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") && !session.name.includes("@")
        ? session.name
        : (existingLead?.name ? getSafeCandidateDisplayName(existingLead.name) : "");
    const nameGreeting = candName ? ` ${candName}` : "";
    return (
      `Hello${nameGreeting}! 👋 Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅\n\n` +
      `Since your consultation is already complete, you cannot reschedule or book another meeting. Our review team is currently evaluating your profile to match the requirements of Australian Employers! 🇦🇺\n\n` +
      `Please ensure your latest CV / Resume is uploaded here in PDF or Word document format! 📄\n\n` +
      `If you have any questions regarding your application or next steps, feel free to reply right here!`
    );
  };

  // 5b. If candidate already completed their consultation
  if (isMeetingDoneOverall) {
    const isTryingToBookOrReschedule =
      isRescheduleIntent ||
      hasBookingKeyword ||
      actionId.startsWith("DAY_DATE_") ||
      actionId.startsWith("DAY_SELECT_") ||
      actionId.startsWith("DAY_MORNING_") ||
      actionId.startsWith("DAY_EVENING_") ||
      actionId.startsWith("SLOT_") ||
      actionId.startsWith("BTN_SLOTS_PART1_") ||
      actionId.startsWith("BTN_SLOTS_PART2_") ||
      actionId.startsWith("SHOW_MORNING_SLOTS_") ||
      actionId.startsWith("SHOW_AFTERNOON_SLOTS_") ||
      session.currentStep === "SELECTING_DAY" ||
      session.currentStep === "SELECTING_SLOT" ||
      session.currentStep === "RESCHEDULING_DATE" ||
      session.currentStep === "RESCHEDULING_SLOT" ||
      actionId === "BTN_CONSULT_YES" ||
      actionId === "BTN_SELECT_SLOT" ||
      actionId === "BTN_RESCHEDULE" ||
      actionId === "BTN_RESCHEDULE_MEETING" ||
      actionId === "BTN_CHANGE_DAY" ||
      isWeekdayMention ||
      isWeekendMention ||
      Boolean(matchedWeekendDate);

    if (isTryingToBookOrReschedule) {
      const completedMsg = getCompletedMessageText();
      await sendTextMessage(session.phone, completedMsg);
      await db.collection(SESSIONS_COLLECTION).updateOne(
        { phone: session.phone },
        {
          $set: {
            meetingCompleted: true,
            meetingStatus: "completed",
            crmStatus: session.crmStatus || "follow-up",
            currentStep: "MEETING_COMPLETED",
            updatedAt: new Date(),
          },
          $unset: { bookedSlot: 1 },
        }
      );
      return { replyText: completedMsg, step: "MEETING_COMPLETED" };
    }
  }

  if (session.bookedSlot && !isMeetingDoneOverall) {
    if (isRescheduleIntent) {
      return sendConsultationDateSelection({ db, session });
    }
    if (hasBookingKeyword) {
      const meetLink = getStaticGoogleMeetLink();
      const candTimeDisplay = session.bookedSlot.candidateTimeLabel || session.bookedSlot.istTimeLabel;
      const bookedReminder =
        `Hello${nameSalutation}! 👋 Your 1-on-1 consultation with our Senior Migration Expert is already confirmed:\n\n` +
        `📅 **Date:** ${session.bookedSlot.date}\n` +
        `⏰ **Time:** ${candTimeDisplay}\n` +
        `💻 **Google Meet Link:** ${meetLink}\n\n` +
        `Please make sure to join on time with your CV ready! 🇦🇺\n` +
        `Need to change your date or time? Tap below:`;
      await sendQuickReplyButtons(session.phone, bookedReminder, [
        { id: "BTN_RESCHEDULE", title: "Change Date & Time" },
        { id: "BTN_ASK_VIDEO", title: "Watch Visa Video" },
      ]);
      return { replyText: bookedReminder, step: "BOOKED" };
    }
  }

  // 5c. If candidate is actively in the SELECTING_DAY step and replied via text
  if (
    session.currentStep === "SELECTING_DAY" &&
    !actionId.startsWith("DAY_DATE_") &&
    !actionId.startsWith("DAY_SELECT_") &&
    !actionId.startsWith("DAY_MORNING_") &&
    !actionId.startsWith("DAY_EVENING_")
  ) {
    if (matchedWeekendDate) {
      return renderSlotSelectionForDate({ db, session, meetingDate: matchedWeekendDate });
    }
    const num = parseInt(cleanText.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num >= 1 && num <= weekends.length) {
      return renderSlotSelectionForDate({ db, session, meetingDate: weekends[num - 1].date });
    }
    if (isWeekdayMention) {
      return sendConsultationDateSelection({ db, session, introText: weekdayExplanation });
    }
    if (isWeekendMention) {
      return sendConsultationDateSelection({ db, session });
    }
  }

  // 5d. Candidate wants Consultation, mentions Day/Date/Slots, or clicked Book Consultation -> Send Interactive Date List directly!
  const isExplicitSlotOrDayAction =
    actionId.startsWith("SLOT_") ||
    actionId.startsWith("DAY_DATE_") ||
    actionId.startsWith("DAY_SELECT_") ||
    actionId.startsWith("DAY_MORNING_") ||
    actionId.startsWith("DAY_EVENING_") ||
    actionId.startsWith("BTN_SLOTS_PART1_") ||
    actionId.startsWith("BTN_SLOTS_PART2_");

  const wantsConsultation =
    !isExplicitSlotOrDayAction &&
    (
      actionId === "BTN_CONSULT_YES" ||
      actionId === "BTN_SELECT_SLOT" ||
      isRescheduleIntent ||
      hasBookingKeyword ||
      isWeekdayMention ||
      isWeekendMention ||
      Boolean(matchedWeekendDate)
    );

  if (wantsConsultation && !session.bookedSlot && !isMeetingDoneOverall) {
    if (matchedWeekendDate) {
      return renderSlotSelectionForDate({ db, session, meetingDate: matchedWeekendDate });
    }
    if (isWeekdayMention) {
      return sendConsultationDateSelection({ db, session, introText: weekdayExplanation });
    }
    return sendConsultationDateSelection({ db, session });
  }

  // 6. Candidate selected day -> Show all slots via helper
  if (
    actionId.startsWith("DAY_DATE_") ||
    actionId.startsWith("DAY_SELECT_") ||
    actionId.startsWith("DAY_MORNING_") ||
    actionId.startsWith("DAY_EVENING_")
  ) {
    if (isMeetingDoneOverall) {
      const completedMsg = getCompletedMessageText();
      await sendTextMessage(session.phone, completedMsg);
      return { replyText: completedMsg, step: "MEETING_COMPLETED" };
    }

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

    return renderSlotSelectionForDate({ db, session, meetingDate });
  }

  // Handle 2 select slot options (divided 8 in each):
  if (
    actionId.startsWith("BTN_SLOTS_PART1_") ||
    actionId.startsWith("BTN_SLOTS_PART2_") ||
    actionId.startsWith("SHOW_MORNING_SLOTS_") ||
    actionId.startsWith("SHOW_AFTERNOON_SLOTS_")
  ) {
    if (isMeetingDoneOverall) {
      const completedMsg = getCompletedMessageText();
      await sendTextMessage(session.phone, completedMsg);
      return { replyText: completedMsg, step: "MEETING_COMPLETED" };
    }

    const isPart2 =
      actionId.startsWith("BTN_SLOTS_PART2_") ||
      actionId.startsWith("SHOW_AFTERNOON_SLOTS_");
    const meetingDate = actionId
      .replace("BTN_SLOTS_PART1_", "")
      .replace("BTN_SLOTS_PART2_", "")
      .replace("SHOW_MORNING_SLOTS_", "")
      .replace("SHOW_AFTERNOON_SLOTS_", "");

    const dateSlots = await getAvailableWeekendSlots({
      db,
      meetingDate,
      candidateTimeZone: session.timeZone,
      candidateTimeLabel: session.timeZoneLabel,
    });
    const availableSlots = dateSlots.filter((s) => s.available);
    const isIndia = session.countryCode === "IN";
    const tzShort = extractShortTimezone(session.timeZoneLabel);
    const dayLabel = dateSlots[0]?.dayLabel || meetingDate;

    await updateSession(db, session.phone, {
      currentStep: "SELECTING_SLOT",
      activeSlotsDate: meetingDate,
    });

    if (isPart2) {
      // Slots 9 to 16 (or remainder, up to 8 slots)
      const part2Slots = availableSlots.slice(8, 16);
      const rows = part2Slots.map((s, idx) => ({
        id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
        title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
        description: `Slot #${idx + 9} (${tzShort})`.slice(0, 72),
      }));

      const sections = [
        {
          title: `Slots 9 to ${availableSlots.length}`.slice(0, 24),
          rows,
        },
      ];

      const part2Text =
        `📋 *Consultation Slots 9 to ${availableSlots.length} for ${dayLabel}*\n\n` +
        `Tap **Select Slot** below to choose your time slot, or reply directly with your slot number (*9* to *${availableSlots.length}*).`;

      await sendInteractiveList(
        session.phone,
        "Choose Slot (9-16)",
        part2Text,
        "Select Slot",
        sections,
      );
      return { replyText: part2Text, step: "SELECTING_SLOT" };
    } else {
      // Slots 1 to 8
      const part1Slots = availableSlots.slice(0, 8);
      const rows = part1Slots.map((s, idx) => ({
        id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
        title: `${s.candidateDisplayLabel.split(" (")[0]}`.slice(0, 24),
        description: `Slot #${idx + 1} (${tzShort})`.slice(0, 72),
      }));

      const sections = [
        {
          title: `Slots 1 to 8`.slice(0, 24),
          rows,
        },
      ];

      const part1Text =
        `📋 *Consultation Slots 1 to 8 for ${dayLabel}*\n\n` +
        `Tap **Select Slot** below to choose your time slot, or reply directly with your slot number (*1* to *8*).`;

      await sendInteractiveList(
        session.phone,
        "Choose Slot (1-8)",
        part1Text,
        "Select Slot",
        sections,
      );
      return { replyText: part1Text, step: "SELECTING_SLOT" };
    }
  }

  // 6b. Candidate typed a slot number (e.g. "1", "5", "14") or typed a time (e.g. "11:00", "2:30", "4pm")
  if (
    session.currentStep === "SELECTING_SLOT" &&
    session.activeSlotsDate &&
    !actionId.startsWith("SLOT_")
  ) {
    if (/^(slots?\s*)?1\s*[-–to ]+\s*8$/i.test(cleanText.trim())) {
      actionId = `BTN_SLOTS_PART1_${session.activeSlotsDate}`;
    } else if (/^(slots?\s*)?9\s*[-–to ]+\s*16$/i.test(cleanText.trim())) {
      actionId = `BTN_SLOTS_PART2_${session.activeSlotsDate}`;
    }
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
      const cleanLower = cleanText.toLowerCase().trim();
      const matched = available.find((s) => {
        const candClean = s.candidateStartTime.toLowerCase();
        const candCleanNoZero = candClean.replace(/^0/, "");
        const candRange = s.candidateDisplayLabel.toLowerCase();
        return (
          cleanLower.includes(s.istStartTime) ||
          cleanLower.includes(s.istStartTime.replace(/^0/, "")) ||
          cleanLower.includes(candClean) ||
          cleanLower.includes(candCleanNoZero) ||
          candRange.includes(cleanLower) ||
          cleanLower.replace(/[: ]/g, "").includes(s.istStartTime.replace(":", "")) ||
          cleanLower.replace(/[: ]/g, "").includes(candClean.replace(":", ""))
        );
      });
      if (matched) {
        actionId = `SLOT_${matched.date}_${matched.istStartTime}_${matched.candidateStartTime}`;
      }
    }
  }

  // 7. Candidate selected slot -> Lock slot in CRM, Assign to Abhay, Send Meet Link, Replace previous slot if rescheduling
  if (actionId.startsWith("SLOT_")) {
    if (isMeetingDoneOverall) {
      const completedMsg = getCompletedMessageText();
      await sendTextMessage(session.phone, completedMsg);
      return { replyText: completedMsg, step: "MEETING_COMPLETED" };
    }

    // Format: SLOT_{meetingDate}_{istStart}_{candidateStart}
    const parts = actionId.split("_");
    const meetingDate = parts[1];
    const istStart = parts[2];
    const candidateStart = parts[3];
    const istHour = parseInt(istStart.split(":")[0], 10);
    const istEnd = `${String(istHour + 1).padStart(2, "0")}:00`;

    // Double-booking check: Ensure slot is not already locked/booked by someone else!
    const existingSlot = await db.collection("meetingSlots").findOne({
      meetingDate,
      channel: { $ne: "WhatsApp Ireland" },
      status: { $in: ["scheduled", "completed"] },
      $or: [
        { startTime: istStart },
        {
          startTime: { $lt: istEnd },
          endTime: { $gt: istStart },
        },
      ],
    });

    const isSameCandidate =
      existingSlot &&
      existingSlot.phone === session.phone;

    if (existingSlot && !isSameCandidate) {
      console.log(`[WhatsApp] Collision: slot ${meetingDate} ${istStart} is already booked by ${existingSlot.phone} (${existingSlot.channel || "WhatsApp"})`);

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
        const candObj = convertIstSlotToCandidateTime(meetingDate, istStart, session.timeZone);
        // Always show candidate's local time (for Indian candidates IST IS their local time)
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

    // Compute 1-hour end times
    const candStartObj = convertIstSlotToCandidateTime(
      meetingDate,
      istStart,
      session.timeZone,
    );
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
      channel: { $ne: "WhatsApp Ireland" },
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
        channel: { $ne: "WhatsApp Ireland" },
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
              ? `Rescheduled from ${previousSlotDetails} to ${meetingDate} at ${candStartObj.display12h} - ${candEndObj.display12h} (${session.timeZoneLabel}) [IST: ${istStart} - ${istEnd}]. Assigned to Abhay. Room: ${meetLink}`
              : `Booked for ${meetingDate} at ${candStartObj.display12h} - ${candEndObj.display12h} (${session.timeZoneLabel}) [IST: ${istStart} - ${istEnd}]. Assigned to Abhay. Room: ${meetLink}`,
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
            ? `1-on-1 consultation with ${session.name || "WhatsApp Candidate"} was RESCHEDULED to ${meetingDate} at ${candStartObj.display12h} (${session.timeZoneLabel}) / ${istStart} IST.`
            : `1-on-1 Australia Employer Sponsored Work Visa consultation booked with ${session.name || "WhatsApp Candidate"} on ${meetingDate} at ${candStartObj.display12h} (${session.timeZoneLabel}) / ${istStart} IST.`,
          type: "meeting_scheduled",
          link: `/dashboard/leads/${leadId}`,
        });
      } catch (notifErr) {
        console.error("Failed to notify consultant:", notifErr);
      }
    }

    // 5. Update session in whatsapp_sessions
    const ist12hRange = `${format12hTime(istStart)} - ${format12hTime(istEnd)} IST`;
    const candTz = extractShortTimezone(session.timeZoneLabel).replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
    const candidateTimeFormatted = session.countryCode === "IN"
      ? `${candStartObj.display12h} - ${candEndObj.display12h}`
      : `${candStartObj.display12h} - ${candEndObj.display12h}${candTz ? ` (${candTz})` : ""}`;

    const historyItem: MeetingHistoryItem = {
      action: isReschedule ? "rescheduled" : "booked",
      date: meetingDate,
      candidateTime: candidateTimeFormatted,
      istTime: ist12hRange,
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
        candidateTimeLabel: candidateTimeFormatted,
        istTime: istStart,
        istTimeLabel: ist12hRange,
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

    const timeDisplay = candidateTimeFormatted;

    const confirmationMsg = isReschedule
      ? `Dear ${candidateDisplayName},\n\n` +
      `Your *Australia Employer Sponsored Work Visa* consultation has been **successfully rescheduled**! ✅\n\n` +
      `📅 *New Date:* ${formattedDate}\n` +
      `⏰ *New Time:* ${timeDisplay}\n` +
      `💻 *Google Meet:* ${meetLink}\n\n` +
      `Please make sure to *join the meeting on time*.\n\n` +
      `*Best regards,*\n` +
      `*TMS Visa*`
      : `Dear ${candidateDisplayName},\n\n` +
      `Thank you for showing your interest in the *Australia Employer Sponsored Work Visa*.\n\n` +
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

  // 8. If candidate specifically asks for the Australia 482 video link
  const isAskingVideoLink =
    lowerText.includes("video link") ||
    lowerText.includes("video url") ||
    lowerText.includes("watch video") ||
    lowerText.includes("send video") ||
    lowerText.includes("share video") ||
    lowerText.includes("give video") ||
    lowerText.includes("explainer video") ||
    lowerText.includes("process video") ||
    lowerText.includes("visa video") ||
    (lowerText.includes("link") && lowerText.includes("video")) ||
    (lowerText.includes("video") &&
      (lowerText.includes("where") ||
        lowerText.includes("how") ||
        lowerText.includes("send") ||
        lowerText.includes("give") ||
        lowerText.includes("watch") ||
        lowerText.includes("share") ||
        lowerText.includes("can you") ||
        lowerText.includes("please")));

  if (isAskingVideoLink) {
    const videoUrl = getVideo482Url();
    const videoReply =
      `Here is our Australia Employer Sponsored Work Visa explainer video! 🎥🇦🇺\n\n` +
      `▶️ **Watch the Video Here:**\n${videoUrl}\n\n` +
      `It explains employer sponsorship requirements, eligible occupations, salary benchmarks (AUD $76,500+), and relocation pathways.\n\n` +
      `*(Tap the link above to watch anytime)*`;

    await sendTextMessage(session.phone, videoReply);
    return { replyText: videoReply, step: session.currentStep };
  }

  // 9. If candidate specifically asks for the Google Meet / consultation meeting link
  const isAskingMeetLink =
    lowerText.includes("meeting link") ||
    lowerText.includes("meet link") ||
    lowerText.includes("google meet") ||
    lowerText.includes("room link") ||
    lowerText.includes("where to join") ||
    lowerText.includes("how to join") ||
    lowerText.includes("join meeting") ||
    lowerText.includes("consultation link") ||
    lowerText.includes("give me link") ||
    lowerText.includes("send link") ||
    (lowerText.includes("link") &&
      (lowerText.includes("meeting") ||
        lowerText.includes("consultation") ||
        lowerText.includes("call")));

  if (isAskingMeetLink) {
    const isMeetingDone =
      session.meetingCompleted === true ||
      session.meetingStatus === "completed" ||
      session.currentStep === "MEETING_COMPLETED" ||
      session.crmStatus === "follow-up" ||
      session.crmStatus === "sales" ||
      session.crmStatus === "payment-pending" ||
      session.crmStatus === "document-pending";

    if (isMeetingDone) {
      const alreadyDoneMsg =
        `Hello ${session.name || "there"}! 👋\n\n` +
        `Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅\n\n` +
        `Your Australia Employer Sponsored Work Visa profile is currently in progress with our onboarding team. Feel free to ask any question regarding your file!`;
      await sendTextMessage(session.phone, alreadyDoneMsg);
      return { replyText: alreadyDoneMsg, step: "MEETING_COMPLETED" };
    }

    const isBooked = Boolean(
      session.bookedSlot ||
      session.currentStep === "BOOKED" ||
      session.meetingStatus === "booked" ||
      session.meetingStatus === "rescheduled"
    );

    if (isBooked && session.bookedSlot) {
      const meetUrl = getStaticGoogleMeetLink();
      const meetReply =
        `Hi ${session.name || "there"}! 👋\n\n` +
        `Your 1-on-1 consultation with our senior visa expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel || session.bookedSlot.istTimeLabel}**.\n\n` +
        `🔗 **Google Meet Room Link:**\n${meetUrl}\n\n` +
        `*(Tap the link above at your scheduled time to join the call. Please have your CV ready!)* 🇦🇺`;
      await sendTextMessage(session.phone, meetReply);
      return { replyText: meetReply, step: "BOOKED" };
    }

    if (isCrmCandidate) {
      const crmDeskMsg =
        `Hello ${session.name || "there"}! 👋\n\n` +
        `Our senior consultation desk is managing your file (Status: ${session.crmStatus || "Active"}). Our team will connect with you directly. Feel free to ask any questions right here! 🇦🇺`;
      await sendTextMessage(session.phone, crmDeskMsg);
      return { replyText: crmDeskMsg, step: session.currentStep };
    }

    // Candidate has NOT booked a meeting yet -> DO NOT send the meeting link.
    const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);
    if (session.email) {
      return sendConsultationDateSelection({
        db,
        session,
        introText:
          `Hello ${session.name || "there"}! 👋\n\n` +
          `Our 1-on-1 consultations with our senior visa expert are held live on Google Meet (Saturdays & Sundays between **${candWindow.displayWindow}**).\n\n` +
          `The official Google Meet room link is issued once your consultation slot is booked.\n\n` +
          `Please tap **Select Date** below to choose your preferred weekend date:`,
      });
    }

    const notBookedReply =
      `Hello ${session.name || "there"}! 👋\n\n` +
      `Our 1-on-1 consultations are held live on Google Meet with our senior visa expert (Saturdays & Sundays between **${candWindow.displayWindow}**).\n\n` +
      `The official Google Meet room link is provided once your consultation slot is officially booked.\n\n` +
      `Please reply with your **Email Address** first so we can send your visa information pack and help you choose an available time slot! 🇦🇺`;

    await sendTextMessage(session.phone, notBookedReply);
    return { replyText: notBookedReply, step: session.currentStep };
  }

  // 10. Free-form conversational message -> Consult Context-Aware AI
  let aiAnswer = "";
  try {
    aiAnswer = await generateAiResponse({
      message: cleanText,
      session,
    });
  } catch (err) {
    console.error("[WhatsApp AI] generateAiResponse threw error:", err);
  }
  // If the AI response mentions emailing the candidate (e.g. "I've emailed the complete 691-role PDF to ..."),
  // or if the message asked about information contained in the official email pack,
  // guarantee that the email is ACTUALLY dispatched via SMTP!
  const lowerAnswer = aiAnswer.toLowerCase();
  const mentionsEmailDispatch =
    lowerAnswer.includes("emailed") ||
    lowerAnswer.includes("sent to your email") ||
    lowerAnswer.includes("sent to your registered email") ||
    lowerAnswer.includes("i've emailed") ||
    lowerAnswer.includes("ive emailed") ||
    lowerAnswer.includes("re-triggered") ||
    lowerAnswer.includes("information pack to");

  if (mentionsEmailDispatch && session.email) {
    try {
      const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
      await sendWhatsAppInfoEmail({
        phone: session.phone,
        name: session.name,
        email: session.email,
        leadId: session.leadId,
      });
      await updateSession(db, session.phone, { infoEmailSentAt: new Date() });
    } catch (e) {
      console.warn("[WhatsApp AI] Background email dispatch failed:", e);
    }
  }

  // Guaranteed fallback: If AI returned empty or failed, send an intelligent human response
  if (!aiAnswer || !aiAnswer.trim()) {
    const candidateName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    if (session.bookedSlot) {
      aiAnswer =
        `Hello ${candidateName}! 👋\n\n` +
        `Your 1-on-1 consultation with our senior visa expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
        `🔗 **Google Meet Link:** ${getStaticGoogleMeetLink()}\n\n` +
        `I am Aria, Senior Registered Migration Counselor at The Migration School (TMS Visa). If you have any questions about eligible occupations, requirements, or anything you'd like to prepare for the consultation, please feel free to ask right here! 🇦🇺`;
    } else {
      aiAnswer =
        `Hello ${candidateName}! 👋\n\n` +
        `Thank you for messaging The Migration School (TMS Visa) 🇦🇺.\n\n` +
        `I am Aria, Senior Registered Migration Counselor. How can I assist you with your Australia Employer Sponsored Work Visa query today? You can ask any question regarding our process, requirements, or eligible occupations!`;
    }
  }

  await sendTextMessage(session.phone, aiAnswer);

  // If candidate was actively in SELECTING_DAY and asked an inquiry, provide the date list
  if (session.currentStep === "SELECTING_DAY") {
    return sendConsultationDateSelection({
      db,
      session,
      introText: `Please tap **Select Date** below to choose your preferred consultation date:`,
    });
  }

  // If candidate was actively in SELECTING_SLOT and asked an inquiry, provide the slot list
  if (session.currentStep === "SELECTING_SLOT" && session.activeSlotsDate) {
    return renderSlotSelectionForDate({
      db,
      session,
      meetingDate: session.activeSlotsDate,
    });
  }

  // If candidate asked a hybrid question (inquiry + booking/day intent) and has email registered
  if (
    !session.bookedSlot &&
    session.email &&
    (hasBookingKeyword || isWeekdayMention || isWeekendMention || Boolean(matchedWeekendDate))
  ) {
    if (matchedWeekendDate) {
      return renderSlotSelectionForDate({ db, session, meetingDate: matchedWeekendDate });
    }
    if (isWeekdayMention) {
      return sendConsultationDateSelection({ db, session, introText: weekdayExplanation });
    }
    if (isWeekendMention) {
      return sendConsultationDateSelection({
        db,
        session,
        filterDay: isSaturdayMention ? "Saturday" : isSundayMention ? "Sunday" : undefined,
      });
    }
    return sendConsultationDateSelection({ db, session });
  }

  return { replyText: aiAnswer, step: session.currentStep };
}
