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
} from "./timezone";
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
  return (
    process.env.VIDEO_482_URL ||
    "https://drive.google.com/file/d/17-migz0VwryoP_vLU28NhF1EjNhd570e/view?usp=sharing"
  );
}

/**
 * Builds rows for Meta WhatsApp interactive list (max 10 rows per Meta API limit).
 * If > 10 slots (e.g. 16 continuous slots), rows 1-9 are direct slots and row 10 opens slots 10 to N.
 */
function buildSlotRows(
  availableSlots: WeekendSlot[],
  meetingDate: string,
  isIndia: boolean,
  timeZoneLabel: string,
) {
  const tzShort = extractShortTimezone(timeZoneLabel);
  if (availableSlots.length <= 10) {
    return availableSlots.map((s, idx) => ({
      id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
      title: (isIndia
        ? `${s.istStartTime} - ${s.istEndTime} IST`
        : `${s.candidateDisplayLabel.split(" (")[0]}`).slice(0, 24),
      description: (isIndia
        ? `Slot #${idx + 1} (IST)`
        : `Slot #${idx + 1} (${tzShort})`).slice(0, 72),
    }));
  }

  const rows = availableSlots.slice(0, 9).map((s, idx) => ({
    id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
    title: (isIndia
      ? `${s.istStartTime} - ${s.istEndTime} IST`
      : `${s.candidateDisplayLabel.split(" (")[0]}`).slice(0, 24),
    description: (isIndia
      ? `Slot #${idx + 1} (IST)`
      : `Slot #${idx + 1} (${tzShort})`).slice(0, 72),
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
    // If the name in DB was set to a test placeholder, clean it
    if (existing.name && existing.name.toLowerCase().includes("test")) {
      existing.name = candidateName && !candidateName.toLowerCase().includes("test") ? candidateName : "Candidate";
      await db.collection(SESSIONS_COLLECTION).updateOne({ phone: cleanPhone }, { $set: { name: existing.name } });
    }

    // Sync live CRM data (like meeting completion, payment status, occupation, experience, country) if lead exists
    const lead = existing.leadId
      ? await db.collection("leads").findOne({ id: existing.leadId })
      : await db.collection("leads").findOne({ phone: cleanPhone });

    if (lead) {
      if (!existing.leadId) existing.leadId = lead.id;
      if (lead.country) {
        const matchCountry = findCountryByNameOrCode(lead.country);
        if (matchCountry) {
          existing.countryCode = matchCountry.countryCode;
          existing.countryName = matchCountry.countryName;
          existing.timeZone = matchCountry.timeZone;
          existing.timeZoneLabel = matchCountry.label;
        }
      }
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

    if (!existing.bookedSlot) {
      const activeSlot = await db.collection("meetingSlots").findOne({
        phone: cleanPhone,
        status: "scheduled",
      });
      if (activeSlot) {
        existing.bookedSlot = {
          date: activeSlot.meetingDate,
          candidateTime: activeSlot.candidateLocalTime || activeSlot.startTime,
          candidateTimeLabel: `${activeSlot.candidateLocalTime || activeSlot.startTime} (${existing.timeZoneLabel || country.label})`,
          istTime: activeSlot.startTime,
          istTimeLabel: `${activeSlot.startTime} - ${activeSlot.endTime} (IST)`,
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
  const existingLead = await db.collection("leads").findOne({ phone: cleanPhone });
  const activeSlot = await db.collection("meetingSlots").findOne({ phone: cleanPhone, status: "scheduled" });

  let initialStep: WhatsAppStep = "WELCOME";
  let initialBookedSlot = undefined;
  let initialMeetingStatus: "none" | "booked" | "rescheduled" | "completed" | "cancelled" = "none";

  if (activeSlot) {
    initialStep = "BOOKED";
    initialMeetingStatus = "booked";
    initialBookedSlot = {
      date: activeSlot.meetingDate,
      candidateTime: activeSlot.candidateLocalTime || activeSlot.startTime,
      candidateTimeLabel: `${activeSlot.candidateLocalTime || activeSlot.startTime} (${country.label})`,
      istTime: activeSlot.startTime,
      istTimeLabel: `${activeSlot.startTime} - ${activeSlot.endTime} (IST)`,
      meetingUserId: activeSlot.meetingUserId,
      meetingUserName: activeSlot.meetingUserName,
    };
  }

  const newSession: WhatsAppSession = {
    phone: cleanPhone,
    name: candidateName && !candidateName.toLowerCase().includes("test") ? candidateName : existingLead?.name || "Candidate",
    email: existingLead?.email,
    leadId: existingLead?.id,
    countryCode: country.countryCode,
    countryName: country.countryName,
    interestedCountry: "Australia",
    timeZone: country.timeZone,
    timeZoneLabel: country.label,
    currentStep: initialStep,
    bookedSlot: initialBookedSlot,
    followupCount: 0,
    meetingStatus: initialMeetingStatus,
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
          jobApplied: "Australia Employer Sponsored Work Visa",
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
      videoUrl.includes("youtu") ||
      !videoUrl.toLowerCase().endsWith(".mp4");

    if (isWebOrDriveLink) {
      const videoIntro =
        `🎥 *Australia Employer Sponsored Work Visa — Process Guide Video* 🇦🇺\n\n` +
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
  // --- AUTO-EXTRACT & PERSIST CANDIDATE PROFILE DETAILS FROM EVERY MESSAGE ---
  // =========================================================================
  const profileUpdates: Record<string, unknown> = {};

  // 1. Occupation & Sector from official 691 list
  const occMatch = findEligibleOccupation(cleanText);
  if (occMatch && (!session.occupation || session.occupation !== occMatch.role)) {
    session.occupation = occMatch.role;
    session.occupationSector = occMatch.category;
    profileUpdates.occupation = occMatch.role;
    profileUpdates.occupationSector = occMatch.category;
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

  // 2. Years of Experience (e.g. "5 years experience", "8+ yrs")
  const expRegex = /\b(\d{1,2})\s*(?:\+|\s*plus)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?\b/i;
  const expMatch = cleanText.match(expRegex);
  if (expMatch && (!session.yearsExperience || session.yearsExperience !== `${expMatch[1]} years`)) {
    const expStr = `${expMatch[1]} years`;
    session.yearsExperience = expStr;
    profileUpdates.yearsExperience = expStr;
    if (session.leadId) {
      await db.collection("leads").updateOne(
        { id: session.leadId },
        { $set: { experience: expStr, updatedAt: new Date() } }
      );
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
  if (qualMatch && !session.highestQualification) {
    session.highestQualification = qualMatch[0].toUpperCase();
    profileUpdates.highestQualification = qualMatch[0].toUpperCase();
  }

  // 5. Age / Age Range (e.g. "I am 28 years old", "age 32", "28 yrs old")
  const ageRegex = /\b(?:i\s*am\s*|age\s*|aged?\s*|i'm\s*)?(\d{2})\s*(?:years?\s*old|yrs?\s*old|yo\b)/i;
  const ageMatch = cleanText.match(ageRegex);
  if (ageMatch && !session.ageRange) {
    session.ageRange = ageMatch[1];
    profileUpdates.ageRange = ageMatch[1];
  }

  // 6. Marital Status
  const maritalRegex = /\b(married|single|divorced|widowed|unmarried|engaged)\b/i;
  const maritalMatch = cleanText.match(maritalRegex);
  if (maritalMatch && !session.maritalStatus) {
    session.maritalStatus = maritalMatch[1].charAt(0).toUpperCase() + maritalMatch[1].slice(1).toLowerCase();
    profileUpdates.maritalStatus = session.maritalStatus;
  }

  // 7. Family / Dependents (e.g. "wife and 2 kids", "1 child", "my family of 4")
  const familyRegex = /\b(?:(?:wife|husband|spouse|partner)\s*(?:and\s*)?)?(\d+)?\s*(?:child(?:ren)?|kids?|son|daughter|dependents?)\b/i;
  const familyMatch = cleanText.match(familyRegex);
  if (familyMatch && !session.familySize) {
    session.familySize = familyMatch[0].trim();
    profileUpdates.familySize = session.familySize;
  }

  // 8. Passport Status
  const passportRegex = /\b(i\s*have\s*(?:a\s*)?passport|passport\s*ready|valid\s*passport|no\s*passport|don'?t\s*have\s*passport|passport\s*not\s*ready)\b/i;
  const passportMatch = cleanText.match(passportRegex);
  if (passportMatch && session.hasPassport === undefined) {
    const hasIt = !/no|don'?t|not ready/.test(passportMatch[0].toLowerCase());
    session.hasPassport = hasIt;
    profileUpdates.hasPassport = hasIt;
  }

  // 9. Current Job Title (e.g. "I work as a Software Engineer", "I am a Nurse")
  const jobTitleRegex = /\b(?:i\s*(?:am\s*(?:a\s*|an\s*)?|work\s*as\s*(?:a\s*|an\s*)?|am\s*working\s*as\s*(?:a\s*|an\s*)?))([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,3})/;
  const jobTitleMatch = cleanText.match(jobTitleRegex);
  if (jobTitleMatch && !session.currentJobTitle && jobTitleMatch[1].length > 3) {
    session.currentJobTitle = jobTitleMatch[1].trim();
    profileUpdates.currentJobTitle = session.currentJobTitle;
  }

  // 10. Current Employer (e.g. "I work at Infosys", "working in TCS", "employed with Apollo")
  const employerRegex = /\b(?:work(?:ing)?\s*(?:at|in|with|for)|employed\s*(?:at|with|by)|company\s*(?:is|name)?)\s*([A-Z][A-Za-z\s&.]{2,30})/;
  const employerMatch = cleanText.match(employerRegex);
  if (employerMatch && !session.currentEmployer) {
    session.currentEmployer = employerMatch[1].trim();
    profileUpdates.currentEmployer = session.currentEmployer;
  }

  // 11. Current Salary (e.g. "8 LPA", "INR 60000", "salary is 1.2 LPA")
  const salaryRegex = /\b(?:(?:INR|₹|Rs\.?)\s*)?(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac|l\.?p\.?a|per\s*annum|per\s*month|pm|k\s*pm)/i;
  const salaryMatch = cleanText.match(salaryRegex);
  if (salaryMatch && !session.currentSalary) {
    session.currentSalary = salaryMatch[0].trim();
    profileUpdates.currentSalary = session.currentSalary;
  }

  // 12. Goals / Intent (e.g. "I want PR", "looking for better salary", "want to settle in Australia")
  const goalRegex = /\b((?:want|looking)\s*(?:to|for)\s*(?:PR|permanent\s*residency|settle|better\s*salary|immigrate|migrate|work\s*abroad|move\s*to\s*australia))\b/i;
  const goalMatch = cleanText.match(goalRegex);
  if (goalMatch && !session.candidateGoals) {
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
  }

  // --- Guard: If Consultation Meeting is Already Completed ---
  // No options or buttons to book a meeting are allowed once completed.
  const isMeetingDone =
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.currentStep === "MEETING_COMPLETED";

  if (isMeetingDone) {
    const candidateDisplayName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    // 1. If candidate attempts to book, reschedule, or select slots after completing consultation
    const triesToBookAgain =
      actionId === "BTN_CONSULT_YES" ||
      actionId === "BTN_RESCHEDULE" ||
      actionId === "BTN_RESCHEDULE_MEETING" ||
      actionId.startsWith("DAY_DATE_") ||
      actionId.startsWith("DAY_SELECT_") ||
      actionId.startsWith("SLOT_") ||
      actionId.startsWith("BTN_SLOTS_") ||
      lowerText.includes("book") ||
      lowerText.includes("schedule") ||
      lowerText.includes("reschedule") ||
      (lowerText.includes("meeting") && (lowerText.includes("link") || lowerText.includes("when") || lowerText.includes("time") || lowerText.includes("room")));

    if (triesToBookAgain) {
      const alreadyDoneMsg =
        `Hello ${candidateDisplayName}! 👋\n\n` +
        `Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅\n\n` +
        `Your profile is now in the onboarding and documentation phase. Our team is preparing your official evaluation and agreement.\n\n` +
        `If you have any questions about your Australia Employer Sponsored Work Visa file or payment, feel free to reply right here! 🇦🇺`;

      await sendTextMessage(session.phone, alreadyDoneMsg);
      return { replyText: alreadyDoneMsg, step: "MEETING_COMPLETED" };
    }

    // 2. If candidate is awaiting CV submission
    if (session.currentStep === "AWAITING_CV") {
      const askCvMsg =
        `Thanks for attending the meeting to initiate the process for Australia employer-sponsored work visa! 🇦🇺\n\n` +
        `Please send your CV / Resume here in PDF or Word document format. 📄`;
      await sendTextMessage(session.phone, askCvMsg);
      return { replyText: askCvMsg, step: "AWAITING_CV" };
    }

    // 3. If CV was already received
    if (session.cvReceivedAt) {
      const cvUnderReviewMsg =
        `Thanks for sharing your CV with us! Our review team is reviewing your qualification and job availability according to your work experience.\n\n` +
        `Our team expects to call you from an Australian number shortly. 🇦🇺📞`;
      await sendTextMessage(session.phone, cvUnderReviewMsg);
      return { replyText: cvUnderReviewMsg, step: "MEETING_COMPLETED" };
    }

    // 4. If candidate sends a greeting ("hi", "hello", etc.) or restart
    if (
      actionId === "RESTART_FLOW" ||
      ["hi", "hello", "hey", "start", "restart", "menu", "namaste", "hlo", "hii", "good morning", "good evening", "good afternoon"].includes(lowerText) ||
      lowerText.startsWith("hi ") ||
      lowerText.startsWith("hello ")
    ) {
      const alreadyDoneGreeting =
        `Hello ${candidateDisplayName}! Welcome back to The Migration School (TMS Visa) 🇦🇺.\n\n` +
        `Your consultation has already been completed and your file is in progress. How can our team assist you today? Feel free to ask any question!`;

      await sendTextMessage(session.phone, alreadyDoneGreeting);
      return { replyText: alreadyDoneGreeting, step: "MEETING_COMPLETED" };
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

  // Handle Watch 482 Video button click
  if (actionId === "BTN_ASK_VIDEO") {
    const videoUrl = getVideo482Url();
    const videoReply =
      `Australia Employer Sponsored Work Visa video! 🎥🇦🇺\n\n` +
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
      { id: "BTN_ASK_VIDEO", title: "Watch 482 Video" },
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
      { id: "BTN_ASK_VIDEO", title: "Watch 482 Video" },
    ]);
    return { replyText: welcomeBackMsg, step: "VIDEO_SENT_AWAITING_INTEREST" };
  }

  // 1c. Brand-new candidate or explicit reset
  if (actionId === "RESTART_FLOW" || (isGreeting && !session.email && !session.bookedSlot) || isFreshWelcome) {
    const welcomeText =
      `Hello ☺️! Welcome to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `We specialize in employer-sponsored work visas for Australia.\n\n` +
      `*Are you interested in the Australia Employer Sponsored Work Visa?*`;

    await sendQuickReplyButtons(session.phone, welcomeText, [
      { id: "BTN_482_YES", title: "Yes, Interested" },
      { id: "BTN_482_NO", title: "Not Right Now" },
    ]);

    const nextFollowup = getNext10AmInTimezone(session.timeZone);
    await updateSession(db, session.phone, {
      currentStep: "WELCOME",
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
      `Great! To Share All The Details With You, *please reply with your Email Address:*`;

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
    const extractedEmail = cleanText.trim().toLowerCase();
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
      infoEmailSentAt: new Date(),
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
      followupCount: 0,
    };
    const leadId = await syncCrmLead(db, updatedSession, "new-lead");

    // 1. Dispatch info email from info@tmsvisa.com
    try {
      const { sendWhatsAppInfoEmail } = await import("@/lib/whatsapp/infoEmail");
      await sendWhatsAppInfoEmail({
        phone: session.phone,
        name: session.name,
        email: extractedEmail,
        leadId,
      });
    } catch (emailErr) {
      console.error("[WhatsApp] Error sending info email:", emailErr);
    }

    // 2. Immediate WhatsApp message confirming email was sent
    const emailSentNotice =
      `We have sent an email about the whole process to your email address! Please check your inbox (and spam/junk folder) as well. 📩`;
    await sendTextMessage(session.phone, emailSentNotice);

    const now = new Date();
    await updateSession(db, session.phone, {
      email: extractedEmail,
      leadId,
      currentStep: "AWAITING_CONSULTATION_DECISION",
      infoEmailSentAt: now,
      videoSentAt: now,
      consultationPromptDueAt: new Date(Date.now() + 10 * 60 * 1000),
      nextFollowupAt: getNext10AmInTimezone(session.timeZone),
      followupCount: 0,
    });

    // 3. Wait 10 seconds, then send Step 3 video link
    setTimeout(async () => {
      try {
        await delay(10000);
        await sendTimedVideoAndProcessGuide(session.phone, extractedEmail, videoUrl);
      } catch (delayErr) {
        console.error("[WhatsApp] Error in video delivery delay:", delayErr);
      }
    }, 0);

    return {
      replyText: emailSentNotice,
      step: "AWAITING_CONSULTATION_DECISION",
    };
  }

  // 5. Candidate wants Consultation or wants to Reschedule/Change Date -> Show 10 Upcoming Weekend Dates (~whole month)
  if (actionId === "BTN_SELECT_SLOT" && session.activeSlotsDate) {
    actionId = `DAY_DATE_${session.activeSlotsDate}`;
  }

  const isRescheduleIntent =
    actionId === "BTN_RESCHEDULE" ||
    actionId === "BTN_RESCHEDULE_MEETING" ||
    actionId === "BTN_CHANGE_DAY" ||
    actionId === "BTN_SELECT_SLOT" ||
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
    actionId === "BTN_SELECT_SLOT" ||
    isRescheduleIntent ||
    (session.currentStep === "AWAITING_CONSULTATION_DECISION" &&
      ["yes", "book", "consult", "consultation", "meeting", "call"].some((w) =>
        lowerText.includes(w)
      )) ||
    (session.currentStep === "VIDEO_SENT_AWAITING_INTEREST" &&
      ["yes", "book", "consult", "consultation", "meeting", "call"].some((w) =>
        lowerText.includes(w)
      )) ||
    session.currentStep === "RESCHEDULING_DATE";


  if (wantsConsultation) {
    const isIndia = session.countryCode === "IN";
    const weekends = getUpcomingWeekendDays(10);

    const sections = [
      {
        title: "Select Weekend Date",
        rows: weekends.map((w) => ({
          id: `DAY_DATE_${w.date}`,
          title: w.displayLabel.slice(0, 24), // e.g. "Sat, 26 Sep"
          description: isIndia ? `${w.dayName} · 1 PM - 9 PM IST`.slice(0, 72) : `${w.dayName} · Local Time`.slice(0, 72),
        })),
      },
    ];

    const isRescheduling = Boolean(session.bookedSlot);
    const dayText = isRescheduling
      ? `📅 *Change Consultation Date & Time*\n\n` +
      `Your current meeting is on **${session.bookedSlot?.date}** at **${session.bookedSlot?.candidateTimeLabel || session.bookedSlot?.istTimeLabel}**.\n\n` +
      `Please select your new preferred weekend date from the upcoming month:`
      : `Our 1-on-1 consultations with our senior visa experts are held on **Saturdays and Sundays**.\n\n` +
      (isIndia
        ? `All slots run strictly between 01:00 PM and 09:00 PM IST in 1-hour intervals.\n\n`
        : `All slots run in 1-hour intervals converted to your local time (**${session.timeZoneLabel}**).\n\n`) +
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

        const sections = [
          {
            title: isIndia ? "Available Slots (IST)" : `Available Slots`.slice(0, 24),
            rows: nextWeekend.availableSlots.map((s, idx) => ({
              id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
              title: (isIndia
                ? `${format12hTime(s.istStartTime)} - ${format12hTime(s.istEndTime)} IST`
                : `${s.candidateDisplayLabel.split(" (")[0]}`).slice(0, 24),
              description: (isIndia
                ? `Slot #${idx + 1} (1 Hour)`
                : `Slot #${idx + 1} (${extractShortTimezone(session.timeZoneLabel)})`).slice(0, 72),
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
    const isIndia = session.countryCode === "IN";

    // Save activeSlotsDate in session so reply with number works
    await updateSession(db, session.phone, {
      currentStep: "SELECTING_SLOT",
      activeSlotsDate: meetingDate,
    });

    // Send complete overview text of all available 1-hour slots
    const overviewText = formatSlotsOverview({
      slots: availableSlots,
      dayLabel,
      candidateTimeZoneLabel: session.timeZoneLabel,
      isIndia,
    });

    const sections = [
      {
        title: isIndia ? "Available Slots (IST)" : `Available Slots`.slice(0, 24),
        rows: availableSlots.map((s, idx) => ({
          id: `SLOT_${s.date}_${s.istStartTime}_${s.candidateStartTime}`,
          title: (isIndia
            ? `${format12hTime(s.istStartTime)} - ${format12hTime(s.istEndTime)} IST`
            : `${s.candidateDisplayLabel.split(" (")[0]}`).slice(0, 24),
          description: (isIndia
            ? `Slot #${idx + 1} (1 Hour)`
            : `Slot #${idx + 1} (${extractShortTimezone(session.timeZoneLabel)})`).slice(0, 72),
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
        title: (isIndia
          ? `${format12hTime(s.istStartTime)} - ${format12hTime(s.istEndTime)} IST`
          : `${s.candidateDisplayLabel.split(" (")[0]}`).slice(0, 24),
        description: (isIndia
          ? `Slot #${idx + 9} (1 Hour)`
          : `Slot #${idx + 9} (${tzShort})`).slice(0, 72),
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
        title: (isIndia
          ? `${format12hTime(s.istStartTime)} - ${format12hTime(s.istEndTime)} IST`
          : `${s.candidateDisplayLabel.split(" (")[0]}`).slice(0, 24),
        description: (isIndia
          ? `Slot #${idx + 1} (1 Hour)`
          : `Slot #${idx + 1} (${tzShort})`).slice(0, 72),
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
        const bookedLabel = isIndia ? `${istStart} IST` : `${candObj.display12h} (${session.timeZoneLabel})`;

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
    if (isMeetingDone) {
      const alreadyDoneMsg =
        `Hello ${session.name || "there"}! 👋\n\n` +
        `Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅\n\n` +
        `Your Australia Employer Sponsored Work Visa profile is currently in progress with our onboarding team. Feel free to ask any question regarding your file!`;
      await sendTextMessage(session.phone, alreadyDoneMsg);
      return { replyText: alreadyDoneMsg, step: "MEETING_COMPLETED" };
    }

    const meetUrl = getStaticGoogleMeetLink();
    let meetReply: string;
    if (session.bookedSlot) {
      meetReply =
        `Hi ${session.name || "there"}! 👋\n\n` +
        `Your 1-on-1 consultation with our senior visa expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
        `🔗 **Google Meet Room Link:**\n${meetUrl}\n\n` +
        `*(Tap the link above at your scheduled time to join the call. Please have your CV ready!)* 🇦🇺`;
    } else {
      meetReply =
        `Hello ${session.name || "there"}! 👋\n\n` +
        `Our 1-on-1 consultations are held live on Google Meet with our senior visa expert.\n\n` +
        `🔗 **Official Google Meet Link:**\n${meetUrl}\n\n` +
        `Consultations are scheduled on Saturdays and Sundays between 01:00 PM and 09:00 PM IST in 1-hour intervals. Would you like to select an available time slot in your local time?`;
    }

    await sendTextMessage(session.phone, meetReply);
    return { replyText: meetReply, step: session.currentStep };
  }

  // 10. Free-form conversational message -> Consult Context-Aware Meta AI
  const aiAnswer = await generateAiResponse({
    message: cleanText,
    session,
  });

  await sendTextMessage(session.phone, aiAnswer);
  return { replyText: aiAnswer, step: session.currentStep };
}
