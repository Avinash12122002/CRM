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
    // If current name is missing, generic "Candidate", or test placeholder, try to resolve real name
    if (!existing.name || existing.name === "Candidate" || existing.name.toLowerCase().includes("test")) {
      const realCandidateName =
        candidateName && candidateName !== "Candidate" && !candidateName.toLowerCase().includes("test")
          ? candidateName
          : undefined;

      let foundName = realCandidateName;
      if (!foundName) {
        const lastLog = await db.collection("whatsapp_incoming_logs").findOne({
          phone: cleanPhone,
          senderName: { $exists: true, $nin: ["Candidate", "candidate", ""] },
        });
        if (lastLog?.senderName) {
          foundName = lastLog.senderName;
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
      if (lead.name && (!existing.name || existing.name === "Candidate" || existing.name.toLowerCase().includes("test"))) {
        existing.name = lead.name;
        await db.collection(SESSIONS_COLLECTION).updateOne({ phone: cleanPhone }, { $set: { name: lead.name } });
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

      // Extract all possible occupations from CRM lead
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
        if (!existing.occupation) {
          existing.occupation = leadOccs[0];
        }
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
    const slotTzShort = extractShortTimezone(country.label);
    const isIndia = country.countryCode === "IN";
    const candLabel = isIndia
      ? `${format12hTime(activeSlot.startTime)} - ${format12hTime(activeSlot.endTime)} IST`
      : `${candSlotStart.display12h} - ${candSlotEnd.display12h} (${slotTzShort})`;

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

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: candidateName && !candidateName.toLowerCase().includes("test") ? candidateName : existingLead?.name || "Candidate",
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
    const updatedLeadFields: Record<string, unknown> = {
      email: session.email || existingLead.email,
      country: session.countryName || existingLead.country,
      interestedCountry: "Australia",
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
  videoUrl: string,
) {
  // 1. Send the 482 explainer video
  if (videoUrl) {
    const isWebOrDriveLink =
      videoUrl.includes("drive.google.com") ||
      videoUrl.includes("tmsvisa.com") ||
      videoUrl.includes("youtu") ||
      !videoUrl.toLowerCase().endsWith(".mp4");

    if (isWebOrDriveLink) {
      const videoIntro =
        `🎥 *Australia Work Visa — Process Guide Video* 🇦🇺\n\n` +
        `Here is our video explaining employer sponsorship requirements, eligible occupations, and relocation pathways:\n\n` +
        `▶️ *Watch the Video Here:*\n${videoUrl}\n\n` +
        `*(Tap the link above to watch the video anytime)*`;
      await sendTextMessage(phone, videoIntro);
    } else {
      await sendVideoMessage(
        phone,
        videoUrl,
        "🇦🇺 Australia Employer Sponsored Work Visa Process Guide by The Migration School",
      );
    }
  }

  // 2. Schedule the consultation booking prompt after 10 minutes (skipping the old long complete process text)
  setTimeout(async () => {
    try {
      const { connectToDatabase } = await import("@/lib/mongodb");
      const { db } = await connectToDatabase();
      const s = await db.collection("whatsapp_sessions").findOne({ phone });
      if (s && (s.currentStep === "AWAITING_CONSULTATION_DECISION" || s.currentStep === "VIDEO_SENT_AWAITING_INTEREST") && !s.bookedSlot) {
        await sendConsultationBookingPrompt(phone);
        const { logWhatsAppMessage } = await import("@/lib/whatsapp/messageLogger");
        await logWhatsAppMessage({
          db,
          phone,
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
        await updateSession(db, phone, {
          consultationPromptDueAt: undefined,
          updatedAt: new Date(),
        });
      }
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
 * Dispatches the interactive "Select Date" list for upcoming weekend consultation dates.
 * Meta list allows up to 10 rows.
 */
export async function sendConsultationDateSelection(params: {
  db: Db;
  session: WhatsAppSession;
  introText?: string;
  filterDay?: "Saturday" | "Sunday";
}): Promise<{ replyText: string; step: WhatsAppStep }> {
  const { db, session, introText, filterDay } = params;
  const isIndia = session.countryCode === "IN";
  const allWeekends = getUpcomingWeekendDays(10);
  const weekends = filterDay
    ? allWeekends.filter((w) => w.dayName === filterDay)
    : allWeekends;

  // Always show candidate's local timezone in the date selection description
  const tzShortLabel = extractShortTimezone(session.timeZoneLabel);

  const sections = [
    {
      title: (filterDay ? `Upcoming ${filterDay}s` : "Select Weekend Date").slice(0, 24),
      rows: weekends.slice(0, 10).map((w) => ({
        id: `DAY_DATE_${w.date}`,
        title: w.displayLabel.slice(0, 24), // e.g. "Sat, 26 Sep"
        description: `${w.dayName} · 1PM-9PM ${tzShortLabel}`.slice(0, 72),
      })),
    },
  ];

  const candidateDisplayName =
    session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
      ? session.name
      : "";
  const nameSalutation = candidateDisplayName ? ` ${candidateDisplayName}` : "";

  const isRescheduling = Boolean(session.bookedSlot);
  let dayText = introText;

  if (!dayText) {
    if (isRescheduling) {
      dayText =
        `📅 *Change Consultation Date & Time*\n\n` +
        `Your current meeting is on **${session.bookedSlot?.date}** at **${session.bookedSlot?.candidateTimeLabel || session.bookedSlot?.istTimeLabel}**.\n\n` +
        `Please select your new preferred weekend date from the upcoming month:`;
    } else {
      const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);
      dayText =
        `Hello${nameSalutation}! 👋 To book your free 1-on-1 consultation with our Senior Migration Expert, please select your preferred weekend date below:\n\n` +
        `• **Format:** Dedicated 1-hour Google Meet session with our Senior Migration Expert.\n` +
        `• **Agenda:** CV review, eligibility check for 691 roles, and custom visa roadmap.\n` +
        `• **Timings:** Saturdays & Sundays between **${candWindow.displayWindow}** (in 1-hour slots).\n` +
        `• **Cost:** 100% Free.\n\n` +
        `Please tap **Select Date** below to choose your date:`;
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
        { id: "BTN_CHANGE_DAY", title: "View All 10 Dates" },
      ]);
      return { replyText: fullText, step: "SELECTING_DAY" };
    }
  }

  // Slots are available for this date!
  const allWeekends = getUpcomingWeekendDays(10);
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

  const sections = [
    {
      title: `Available Slots (${extractShortTimezone(session.timeZoneLabel)})`.slice(0, 24),
      rows: availableSlots.map((s, idx) => ({
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

  const existingLead = await db.collection("leads").findOne({ $or: phoneQueries });

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

    // If not yet notified that they already exist in CRM, notify them immediately
    if (!session.existingLeadNotified) {
      const candidateDisplayName =
        session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
          ? session.name
          : existingLead.name && existingLead.name !== "Candidate" && !existingLead.name.toLowerCase().includes("test")
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
    Boolean(existingLead) ||
    Boolean(session.existingLeadNotified) ||
    (session.crmStatus && ACTIVE_CRM_STATUSES.includes(session.crmStatus.toLowerCase().trim())) ||
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.currentStep === "MEETING_COMPLETED";

  if (isCrmCandidate) {
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    // 1. If candidate attempts to book, reschedule, or select slots
    const triesToBookAgain =
      actionId === "BTN_CONSULT_YES" ||
      actionId === "BTN_RESCHEDULE" ||
      actionId === "BTN_RESCHEDULE_MEETING" ||
      actionId === "BTN_YES_AUSTRALIA" ||
      actionId === "BTN_EMAIL_CONFIRM" ||
      actionId.startsWith("DAY_DATE_") ||
      actionId.startsWith("DAY_SELECT_") ||
      actionId.startsWith("SLOT_") ||
      actionId.startsWith("BTN_SLOTS_") ||
      lowerText === "book" ||
      lowerText === "book meeting" ||
      lowerText === "book consultation" ||
      lowerText === "schedule" ||
      lowerText === "reschedule" ||
      (lowerText.includes("meeting") && (lowerText.includes("link") || lowerText.includes("when") || lowerText.includes("time") || lowerText.includes("room")));

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
          `Your profile is now in the onboarding and documentation phase. Our team is preparing your official evaluation.\n\n` +
          `If you have any questions about your Australia Employer Sponsored Work Visa, feel free to reply right here! 🇦🇺`;
      }

      await sendTextMessage(session.phone, alreadyDoneMsg);
      return { replyText: alreadyDoneMsg, step: session.currentStep };
    }

    // 2. If candidate is awaiting CV submission
    if (session.currentStep === "AWAITING_CV") {
      const askCvMsg =
        `Thanks for attending the meeting. We hope that you enjoyed the meeting with our expert. Now, our review team will review your CV to match the requirements of Australian Employers! 🇦🇺\n\n` +
        `Please send your CV / Resume here in PDF or Word document format. 📄`;
      await sendTextMessage(session.phone, askCvMsg);
      return { replyText: askCvMsg, step: "AWAITING_CV" };
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
    lowerClean.includes("again") ||
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
    const targetEmail = emailMatch ? emailMatch[0].toLowerCase() : session.email;

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
        name: session.name,
        email: targetEmail,
        leadId: session.leadId,
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
          `• 📘 **PTE Academic Score & Assessment Guide (PDF)**\n\n` +
          `📬 *Important:* Please check both your **Inbox** and **Spam/Junk folder** right now.\n\n` +
          `💡 *Quick Check:* Listing all 691 occupations here is too long for WhatsApp, but you can reply with your **Job Title** and **Years of Experience** right here for a free instant eligibility check! 🇦🇺\n\n` +
          `Need it sent to a different email address? Just reply: *"My email is yourname@example.com"*. 📧`
          : `✅ We have immediately sent the official **Australia Employer Sponsored Work Visa Information Pack** to **${targetEmail}**! 📩\n\n` +
          `📎 **Attached in your email:**\n` +
          `• 🇦🇺 **Official 691 Eligible Occupation List (PDF)**\n` +
          `• 📘 **PTE Academic Score & Assessment Guide (PDF)**\n\n` +
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

  // Affirmative check (handles button clicks or typed equivalents like "yes, interested", "sure", "yep")
  const isAffirmative =
    actionId === "BTN_482_YES" ||
    (session.currentStep === "WELCOME" &&
      ["yes", "yep", "yeah", "interested", "sure", "ok", "okay"].some((w) =>
        lowerText === w || (w === "ok" ? /\bok\b/.test(lowerText) : lowerText.includes(w))
      ));

  // Negative check (handles button clicks or typed equivalents like "not right now", "no", "maybe later")
  // CRITICAL: Word boundary matching prevents false positives like "nonsense", "normal", "nothing", "nobody"!
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

  // Email format check
  const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const isDirectEmail = EMAIL_PATTERN.test(cleanText);

  // Handle Watch 482 Video button click
  if (actionId === "BTN_ASK_VIDEO") {
    const videoUrl = getVideo482Url();
    const videoReply =
      `Here is our Australia Employer Sponsored Work Visa explainer video! 🎥🇦🇺\n\n` +
      `▶️ **Watch the Video Here:**\n${videoUrl}\n\n` +
      `It explains employer sponsorship requirements, eligible occupations, salary benchmarks (AUD $76,500+), and relocation pathways.\n\n`;

    await sendTextMessage(session.phone, videoReply);
    return { replyText: videoReply, step: session.currentStep };
  }

  // 1. Initial State: WELCOME (when starting or saying hi)
  const isFreshWelcome =
    session.currentStep === "WELCOME" &&
    !actionId &&
    !isGreeting &&
    !isAffirmative &&
    !isNegative &&
    !isDirectEmail &&
    !session.email;

  // 1a. If candidate already has a booked consultation and sends a greeting ("hi", "hello", etc.)
  if (isGreeting && (session.currentStep === "BOOKED" || session.bookedSlot)) {
    const meetLink = getStaticGoogleMeetLink();
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
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
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
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
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
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
      `Hello ☺️! Welcome to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `We specialize in employer-sponsored work visas for Australia.\n\n` +
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
          session.currentStep === "AWAITING_EMAIL" ||
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

  // 3. Candidate clicked YES to 482 -> Request Email
  if (isAffirmative && !isDirectEmail) {
    const emailPrompt =
      `Great! Now we will  Share All The Details over your email , *please reply with your Email Address:*`;

    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    await updateSession(db, session.phone, {
      currentStep: "AWAITING_EMAIL",
      followupCount: 0,
      nextFollowupAt: nextFollowup,
    });
    await sendTextMessage(session.phone, emailPrompt);
    return { replyText: emailPrompt, step: "AWAITING_EMAIL" };
  }

  // 4. In AWAITING_EMAIL state (or direct email shared) -> Validate Email, Send Info Email, Wait 10s -> Send Video, Schedule 10m Prompt
  if (session.currentStep === "AWAITING_EMAIL" || (isDirectEmail && session.currentStep !== "BOOKED")) {
    const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const extractedEmail = emailMatch ? emailMatch[0].toLowerCase() : cleanText.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const isValidFormat = emailRegex.test(extractedEmail);
    const domain = extractedEmail.includes("@") ? extractedEmail.split("@")[1] : "";
    const isValidDomain = domain.includes(".") && domain.length >= 4;

    // Whitelist of accepted email providers (gmail, yahoo, outlook, hotmail, etc.)
    const ACCEPTED_DOMAINS = [
      "gmail.com", "googlemail.com",
      "yahoo.com", "yahoo.in", "yahoo.co.in", "yahoo.co.uk", "yahoo.com.au",
      "outlook.com", "outlook.in", "hotmail.com", "hotmail.in", "live.com",
      "icloud.com", "me.com",
      "rediffmail.com", "protonmail.com", "proton.me",
      "aol.com", "mail.com", "zoho.com", "ymail.com",
      // Also allow corporate / custom domains that have at least 2-part structure
    ];
    const isWhitelistedDomain = ACCEPTED_DOMAINS.includes(domain) || (domain.includes(".") && !domain.startsWith(".") && domain.split(".").every(part => part.length >= 2));

    if (!isValidFormat || !isValidDomain || !isWhitelistedDomain) {
      // Check if candidate is asking a question or conversing rather than an attempted email
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

    // Save email & create/update lead in CRM
    const updatedSession = {
      ...session,
      email: extractedEmail,
      currentStep: "AWAITING_CONSULTATION_DECISION" as WhatsAppStep,
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
      followupCount: 0,
    };
    const leadId = await syncCrmLead(db, updatedSession, "new-lead");

    // 1. Dispatch info email from info@tmsvisa.com
    let emailSentSuccessfully = false;
    try {
      const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
      const emailRes = await sendWhatsAppInfoEmail({
        phone: session.phone,
        name: session.name,
        email: extractedEmail,
        leadId,
      });
      emailSentSuccessfully = emailRes.success === true;
    } catch (emailErr) {
      console.error("[WhatsApp] Error sending info email:", emailErr);
    }

    // 2. Immediate WhatsApp message confirming email was sent
    const emailSentNotice = emailSentSuccessfully
      ? `We have sent an email about the whole process to your email address (**${extractedEmail}**)! Please check your inbox (and spam/junk folder) as well. 📩`
      : `We registered your email address (**${extractedEmail}**). Our team is dispatching your visa roadmap now — please check your inbox and spam folder shortly! 📩`;
    await sendTextMessage(session.phone, emailSentNotice);

    const now = new Date();
    await updateSession(db, session.phone, {
      email: extractedEmail,
      leadId,
      currentStep: "AWAITING_CONSULTATION_DECISION",
      ...(emailSentSuccessfully ? { infoEmailSentAt: now } : {}),
      videoSentAt: now,
      consultationPromptDueAt: new Date(Date.now() + 10 * 60 * 1000),
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
      followupCount: 0,
    });

    // 3. Send Step 3 video link after 2 seconds so candidate receives email confirmation notice first
    try {
      await delay(2000);
      await sendTimedVideoAndProcessGuide(session.phone, extractedEmail, videoUrl);
    } catch (delayErr) {
      console.error("[WhatsApp] Error in video delivery delay:", delayErr);
    }

    return {
      replyText: emailSentNotice,
      step: "AWAITING_CONSULTATION_DECISION",
    };
  }

  // 5. Candidate wants Consultation, Mentions a Day/Date, or wants to Reschedule/Change Date
  if (actionId === "BTN_SELECT_SLOT" && session.activeSlotsDate) {
    actionId = `DAY_DATE_${session.activeSlotsDate}`;
  }

  const weekends = getUpcomingWeekendDays(10);
  const matchedWeekendDate = matchWeekendDateFromText(
    cleanText,
    weekends,
    session.currentStep === "SELECTING_DAY"
  );

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
    "call with expert", "expert call", "talk to expert", "speak with expert",
    "video call", "google meet", "1 on 1", "1-on-1", "when can we talk",
    "when can we meet", "choose time", "select time", "select date",
    "available date", "available slot", "free slot", "lock slot",
    "baat karni", "meeting karni", "call karni", "appointment chahiye",
  ];
  const hasBookingKeyword = BOOKING_KEYWORDS.some((kw) => {
    if (kw.length <= 4) {
      const rx = new RegExp(`\\b${kw}\\b`, "i");
      return rx.test(lowerText);
    }
    return lowerText.includes(kw);
  });

  const candidateDisplayName =
    session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
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
  if (session.bookedSlot) {
    if (isRescheduleIntent) {
      return sendConsultationDateSelection({ db, session });
    }
    if (hasBookingKeyword) {
      const meetLink = getStaticGoogleMeetLink();
      const bookedReminder =
        `Hello${nameSalutation}! 👋 Your 1-on-1 consultation with our Senior Migration Expert is confirmed:\n\n` +
        `📅 **Date:** ${session.bookedSlot.date}\n` +
        `⏰ **Time:** ${session.bookedSlot.candidateTimeLabel || session.bookedSlot.istTimeLabel}\n` +
        `💻 **Google Meet Link:** ${meetLink}\n\n` +
        `Please make sure to join on time with your CV ready! 🇦🇺\n` +
        `Tap below if you need to change your date or time:`;
      await sendQuickReplyButtons(session.phone, bookedReminder, [
        { id: "BTN_RESCHEDULE", title: "Change Date & Time" },
        { id: "BTN_ASK_VIDEO", title: "Watch Visa Video" },
      ]);
      return { replyText: bookedReminder, step: "BOOKED" };
    }
  }

  // 5b. If candidate is actively in the SELECTING_DAY step and replied via text
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
      return sendConsultationDateSelection({
        db,
        session,
        filterDay: isSaturdayMention ? "Saturday" : isSundayMention ? "Sunday" : undefined,
      });
    }
  }

  // 5c. Candidate wants Consultation, mentions Day/Date/Slots, or clicked Book Consultation
  const wantsConsultation =
    actionId === "BTN_CONSULT_YES" ||
    actionId === "BTN_SELECT_SLOT" ||
    isRescheduleIntent ||
    hasBookingKeyword ||
    isWeekdayMention ||
    isWeekendMention ||
    Boolean(matchedWeekendDate);

  if (wantsConsultation && !session.bookedSlot) {
    // If candidate has registered email, proceed directly to date/slot selection
    if (session.email) {
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
    } else {
      // Prompt candidate for email first so consultation invite & dossier can be sent
      const emailPromptMsg = isWeekdayMention
        ? `Hello${nameSalutation}! 👋 Our free 1-on-1 consultations with our Senior Migration Experts are held strictly on **Saturdays and Sundays** between **${candWindowMsg.displayWindow}**.\n\n` +
          `To book your free session and receive your official Google Meet invitation & visa roadmap, *please reply with your Email Address:*`
        : `Hello${nameSalutation}! 👋 To book your free 1-on-1 consultation with our Senior Migration Expert, *please reply with your Email Address* so we can register your profile and send your official meeting invitation & visa pack:`;

      await updateSession(db, session.phone, { currentStep: "AWAITING_EMAIL" });
      await sendTextMessage(session.phone, emailPromptMsg);
      return { replyText: emailPromptMsg, step: "AWAITING_EMAIL" };
    }
  }

  // 6. Candidate selected day -> Show all slots via helper
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

    return renderSlotSelectionForDate({ db, session, meetingDate });
  }

  // Handle 2 select slot options (divided 8 in each):
  if (
    actionId.startsWith("BTN_SLOTS_PART1_") ||
    actionId.startsWith("BTN_SLOTS_PART2_") ||
    actionId.startsWith("SHOW_MORNING_SLOTS_") ||
    actionId.startsWith("SHOW_AFTERNOON_SLOTS_")
  ) {
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

    // Compute 1-hour end times (e.g. 11:00 -> 12:00, 18:00 -> 19:00)
    const [h, m] = istStart.split(":").map(Number);
    const endH = h + 1;
    const endM = m;
    const istEnd = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
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
    const candidateTimeFormatted = session.countryCode === "IN"
      ? ist12hRange
      : `${candStartObj.display12h} - ${candEndObj.display12h} (${session.timeZoneLabel})`;

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
      `We look forward to speaking with you.\n\n` +
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

  // 10. Update intent detection — BEFORE calling AI, check if candidate wants to change phone/email/name
  // NOTE: Phone numbers CANNOT be changed via chat under CRM compliance and security rules.
  const wantsPhoneChange =
    (lowerClean.includes("change") && (lowerClean.includes("number") || lowerClean.includes("phone") || lowerClean.includes("mobile") || lowerClean.includes("contact") || lowerClean.includes("whatsapp"))) ||
    (lowerClean.includes("update") && (lowerClean.includes("number") || lowerClean.includes("phone") || lowerClean.includes("mobile") || lowerClean.includes("contact") || lowerClean.includes("whatsapp"))) ||
    (lowerClean.includes("new") && (lowerClean.includes("number") || lowerClean.includes("phone") || lowerClean.includes("mobile"))) ||
    (lowerClean.includes("different") && (lowerClean.includes("number") || lowerClean.includes("phone") || lowerClean.includes("mobile"))) ||
    (lowerClean.includes("wrong") && (lowerClean.includes("number") || lowerClean.includes("phone") || lowerClean.includes("mobile")));

  // Standalone phone number sent by candidate (8-15 digits) while not in slot selection or email state
  const digitsOnly = cleanText.replace(/\D/g, "");
  const isBarePhoneNumber =
    digitsOnly.length >= 8 &&
    digitsOnly.length <= 15 &&
    /^\+?[\d\s\-()]+$/.test(cleanText.trim()) &&
    session.currentStep !== "SELECTING_SLOT" &&
    (session.currentStep as string) !== "AWAITING_EMAIL" &&
    session.currentStep !== "AWAITING_EMAIL_UPDATE" &&
    session.currentStep !== "AWAITING_NAME_UPDATE";

  if (wantsPhoneChange || isBarePhoneNumber) {
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    const phoneNoChangeMsg =
      `Hello ${candidateDisplayName}! 👋\n\n` +
      `Under our security and verification protocol, **your registered phone number cannot be changed** through this chat. 🔒\n\n` +
      `Your candidate dossier, consultation booking, and official CRM records are permanently linked to your verified WhatsApp account (+${session.phone}).\n\n` +
      `If you have switched to a new phone number:\n` +
      `• Please initiate a new message directly from your **new WhatsApp number** to start or connect your profile, OR\n` +
      `• Contact our administrative desk at **info@tmsvisa.com** for manual identity verification.\n\n` +
      `You can still update other details such as your Name, Email, CV, or Consultation Slot right here. Please let me know how else I can assist you! 🇦🇺`;

    await sendTextMessage(session.phone, phoneNoChangeMsg);
    return { replyText: phoneNoChangeMsg, step: session.currentStep };
  }

  const wantsEmailChange =
    (lowerClean.includes("change") && (lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    (lowerClean.includes("update") && (lowerClean.includes("email") || lowerClean.includes("mail"))) ||
    (lowerClean.includes("wrong") && lowerClean.includes("email")) ||
    (lowerClean.includes("new") && lowerClean.includes("email")) ||
    (lowerClean.includes("correct") && lowerClean.includes("email"));

  const wantsNameChange =
    (lowerClean.includes("change") && (lowerClean.includes("name") || lowerClean.includes("naam"))) ||
    (lowerClean.includes("update") && lowerClean.includes("name")) ||
    (lowerClean.includes("wrong") && lowerClean.includes("name")) ||
    (lowerClean.includes("correct") && lowerClean.includes("name"));

  if (wantsEmailChange) {
    await updateSession(db, session.phone, { currentStep: "AWAITING_EMAIL_UPDATE" });
    const emailChangePrompt =
      `Of course! To update your registered email address, please reply with your new, correct email address right here.\n\n` +
      `📧 **Please reply with: Your New Email Address**`;
    await sendTextMessage(session.phone, emailChangePrompt);
    return { replyText: emailChangePrompt, step: "AWAITING_EMAIL_UPDATE" };
  }

  if (wantsNameChange) {
    await updateSession(db, session.phone, { currentStep: "AWAITING_NAME_UPDATE" });
    const nameChangePrompt =
      `Absolutely! Please reply with your **correct full name** and we will update your profile record immediately.\n\n` +
      `📝 **Please reply with: Your Correct Full Name**`;
    await sendTextMessage(session.phone, nameChangePrompt);
    return { replyText: nameChangePrompt, step: "AWAITING_NAME_UPDATE" };
  }

  // 11. Free-form conversational message -> Consult Context-Aware AI
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
