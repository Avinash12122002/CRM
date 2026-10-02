import { WhatsAppSession } from "./types";
import { TMS_VISA_IRELAND_KNOWLEDGE, FAQ_FALLBACKS } from "./knowledge";
import { checkIrelandOccupationEligibility, findEligibleOccupation } from "./occupations";
import { getCandidateMessageInsights } from "./messageIntelligence";
import { getCandidateConsultationWindow } from "./timezone";

function sanitizeStaffNames(text: string): string {
  if (!text) return text;
  return text
    .replace(/\b(Sumit|Abhay)\b/gi, (match) => {
      const lower = match.toLowerCase();
      if (lower === "sumit") return "your dedicated TMS Recruitment Case Manager";
      if (lower === "abhay") return "our Senior Ireland Migration Expert";
      return "our Senior Ireland Migration Specialist";
    })
    .replace(/\b(Mr\.?\s*Sumit|Mr\.?\s*Abhay)\b/gi, "our Senior Ireland Migration Specialist");
}

function sanitizeMeetingLink(text: string, session: WhatsAppSession): string {
  if (!text) return text;
  const isBooked = session.meetingStatus === "booked" || Boolean(session.bookedSlot);
  if (isBooked) return text;

  const cleaned = text
    .replace(/[•\-\*]?\s*(?:Join the meeting via|Join via|Meeting link:|Google Meet link:)?\s*https?:\/\/meet\.google\.com\/[^\s\)]+(?:\s*(?:when you(?:'re|re) ready|when ready))?\.?/gi, "")
    .replace(/https?:\/\/meet\.google\.com\/[a-z0-9\-]+/gi, "")
    .replace(/[•\-\*]?\s*Join the meeting via[^\n\.]+\.?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

function sanitizeTimezoneForCandidate(text: string, session: WhatsAppSession): string {
  if (!text) return text;
  const isIndia = session.countryCode === "IN" || session.timeZone === "Asia/Kolkata";
  if (isIndia) return text;

  const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);

  return text
    .replace(/(?:1\s*[-–]\s*9\s*PM|01:00\s*PM\s*[-–]\s*09:00\s*PM)\s*IST(?:\s*\([^)]*local time[^)]*\))?/gi, candWindow.displayWindow)
    .replace(/(?:1\s*[-–]\s*9\s*PM|01:00\s*PM\s*[-–]\s*09:00\s*PM)\s*\([^)]*local time[^)]*\)/gi, candWindow.displayWindow)
    .replace(/\b1\s*[-–]\s*9\s*PM\s*IST\b/gi, candWindow.displayWindow)
    .replace(/\bIST\b/g, candWindow.tzShort);
}

function sanitizeFinalResponse(text: string, session: WhatsAppSession): string {
  if (!text) return text;
  let sanitized = sanitizeStaffNames(text);
  sanitized = sanitizeMeetingLink(sanitized, session);
  sanitized = sanitizeTimezoneForCandidate(sanitized, session);
  return sanitized;
}

/**
 * Generates an intelligent, human-like response tailored to the candidate's exact CRM state for Ireland.
 */
export async function generateAiResponse(params: {
  message: string;
  session: WhatsAppSession;
}): Promise<string> {
  const { message, session } = params;
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY;

  const rawMsg = (message || "").trim();
  const lowerMsg = rawMsg.toLowerCase();

  // 1. Strict Security & Policy Check: Deletion or Wipe of Data
  const isDeletionRequest =
    lowerMsg.includes("delete") ||
    lowerMsg.includes("erase") ||
    lowerMsg.includes("purge") ||
    lowerMsg.includes("wipe") ||
    lowerMsg.includes("clear chat") ||
    lowerMsg.includes("clear history") ||
    ((lowerMsg.includes("reset") || lowerMsg.includes("remove")) &&
      (lowerMsg.includes("chat") ||
        lowerMsg.includes("data") ||
        lowerMsg.includes("profile") ||
        lowerMsg.includes("cv") ||
        lowerMsg.includes("record")));

  if (isDeletionRequest) {
    return (
      `Data deletion, profile removal, or chat wipes cannot be performed through this chat. 🔒\n\n` +
      `All records are managed securely by our CRM Administrator for verification & compliance. For administrative inquiries, email: info@tmsvisa.com`
    );
  }

  // 1b. Phone Number Change Guard
  const isPhoneNumberChangeRequest =
    (lowerMsg.includes("change") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile"))) ||
    (lowerMsg.includes("update") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile"))) ||
    (lowerMsg.includes("new") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile")));

  if (isPhoneNumberChangeRequest) {
    const candidateName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    return (
      `Hi ${candidateName}! 🔒 Your registered phone number **cannot be changed** through this chat.\n\n` +
      `All CRM records are linked to +${session.phone}. If you have switched numbers, please message us from your **new WhatsApp number**, or email **info@tmsvisa.com**.\n\n` +
      `Your Name, Email, CV, or Consultation Slot can still be updated here anytime! 🇮🇪`
    );
  }

  // 2. Staff Name Inquiries Fallback
  const isAskingStaffName =
    lowerMsg.includes("sumit") ||
    lowerMsg.includes("abhay") ||
    lowerMsg.includes("staff name") ||
    lowerMsg.includes("employee name") ||
    lowerMsg.includes("person name") ||
    lowerMsg.includes("case manager name") ||
    lowerMsg.includes("who is taking my meeting");

  if (isAskingStaffName) {
    return (
      `For compliance & data protection, individual staff names are not shared. 🔒 Your profile is managed by:\n\n` +
      `• **Aria** — Senior Migration Counselor (initial guidance)\n` +
      `• **TMS Recruitment Case Manager** — CV makeover, English communication coaching & employer matching\n` +
      `• **Senior Ireland Migration Expert** — 1-on-1 weekend consultation\n\n` +
      `Contact: info@tmsvisa.com`
    );
  }

  const matchedOcc = findEligibleOccupation(message);

  // Build candidate profile dossier
  let contextBlock = `
CANDIDATE LIVE CRM PROFILE & DOSSIER (IRELAND):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTITY:
- Candidate Name: ${session.name || "Candidate"}
- Phone Number: +${session.phone}
- Email Address: ${session.email || "Not shared yet"}
- Country of Residence: ${session.countryName} (${session.timeZoneLabel})

VISA INTEREST:
- Destination of Interest: Ireland 🇮🇪
- Target Visa Pathway: Ireland Employer Sponsored Work Visa — Critical Skills Employment Permit (CSEP) & General Employment Permit (GEP)
- Current Funnel Step: ${session.currentStep}
- Meeting Lifecycle Status: ${session.meetingStatus || (session.bookedSlot ? "booked" : "none")}
- Info Email Sent: ${session.infoEmailSentAt ? "Yes ✅" : "No"}
- CV Received: ${session.cvReceivedAt ? `Yes ✅ (${new Date(session.cvReceivedAt).toLocaleDateString()})` : "Not received yet"}
- CV File: ${session.cvFileName || "None"}

FINANCIAL OVERVIEW FOR IRELAND (ACCURATE):
- Irish Employer Pays (100% covered by employer):
  * €1,000 Work Permit Fee (DETE government application fee)
  * €60 Visa Processing Fee (Irish visa application at VFS)
  * All other government approval costs
  * Flight Ticket to Ireland ✈️
- Candidate Total Service Charge: Strictly €1,000 in two stages:
  * Milestone 1: €300 upon agreement signing. Covers:
    – Dedicated TMS Recruitment Case Manager from Day 1
    – European/Irish-standard professional CV makeover
    – Free weekly English communication coaching (from first weekend — to impress employers, NOT a visa requirement)
    – Free Interview Preparation coaching
    – Booking interviews with Irish employers on candidate's behalf
  * Milestone 2: €700 paid ONLY after visa approval AND flight tickets are in hand!
- 100% Money-Back Guarantee: If visa rejected for ANY reason → full refund immediately, no questions asked.
`;


  // Occupation eligibility check — 3-way logic
  const occEligibility = session.occupation
    ? checkIrelandOccupationEligibility(session.occupation)
    : matchedOcc
      ? checkIrelandOccupationEligibility(matchedOcc.role)
      : null;

  if (occEligibility) {
    if (occEligibility.status === "CSEP") {
      contextBlock += `
INQUIRED OCCUPATION — CRITICAL SKILLS (CSEP):
- Role: "${occEligibility.role}"
- Sector: "${occEligibility.category || "Critical Skills"}"
- Permit Type: Critical Skills Employment Permit (CSEP)
- Timeline: 3-4 months
- PR Pathway: Stamp 4 after 2 years of work
- Instruction: Confidently confirm that role "${occEligibility.role}" is on the CSOL (Critical Skills list). Explain CSEP benefits.
`;
    } else if (occEligibility.status === "GEP") {
      contextBlock += `
INQUIRED OCCUPATION — GENERAL PERMIT (GEP):
- Role: "${occEligibility.role}"
- Permit Type: General Employment Permit (GEP)
- Timeline: 4-5 months
- Instruction: Confirm that "${occEligibility.role}" qualifies for the General Employment Permit (GEP) — not on CSOL but also not on the Ineligible list. Encourage consultation.
`;
    } else if (occEligibility.status === "INELIGIBLE") {
      contextBlock += `
INQUIRED OCCUPATION — INELIGIBLE (IOL):
- Role: "${occEligibility.role}"
- Status: On the Ineligible Occupations List (IOL) — employment permit CANNOT be granted
- Instruction: Professionally inform the candidate that this specific role is on the IOL and a work permit cannot be issued. However, suggest they book a consultation as some roles have exceptions or the candidate's actual duties may qualify under a related role.
`;
    }
  } else if (matchedOcc) {
    contextBlock += `
INQUIRED OCCUPATION MATCH:
- Role: "${matchedOcc.role}"
- Sector: "${matchedOcc.category}"
- Status: CONFIRMED on the Ireland Critical Skills Occupations List (CSOL).
- Instruction: Confidently confirm to the candidate that their role "${matchedOcc.role}" is on the official CSOL list under ${matchedOcc.category}!
`;
  }

  if (session.bookedSlot) {
    contextBlock += `
ACTIVE CONFIRMED CONSULTATION:
- Date: ${session.bookedSlot.date}
- Candidate Local Time: ${session.bookedSlot.candidateTimeLabel}
- Consultant: TMS Visa Senior Ireland Migration Expert
- Status: ${session.meetingStatus || "booked"}
- TIMEZONE RULE: Always state candidate's local time as ${session.bookedSlot.candidateTimeLabel}. Do NOT mention IST to international candidates.
`;
  }

  // Check FAQ Fallbacks first
  for (const faq of FAQ_FALLBACKS) {
    if (faq.keywords.some((k) => lowerMsg.includes(k))) {
      return sanitizeFinalResponse(faq.answer, session);
    }
  }

  // LLM Inference with Groq
  if (apiKey) {
    try {
      const insights = await getCandidateMessageInsights({ message, session });

      const systemPrompt = `You are Aria, Senior Registered Migration Counselor for Ireland at The Migration School (TMS Visa).
You are communicating directly with candidates on WhatsApp about moving to Ireland on an Employer Sponsored Work Visa (Critical Skills Employment Permit / General Employment Permit).

STRICT OPERATIONAL RULES:
1. ALWAYS stay in character as Aria. Never refer to yourself as an AI or language model.
2. DESTINATION: Always talk about Ireland (Dublin, Cork, Galway, Limerick). Currency is Euros (€).
3. FEES: Total €1,000. Milestone 1 is €300 upon agreement (covers CV makeover, Case Manager, FREE English communication coaching, FREE Interview Prep & booking interviews). Milestone 2 is €700 ONLY after visa approval and flight tickets are in hand! Irish Employer covers: €1,000 work permit (DETE) + €60 visa processing fee + all government costs + flight tickets.
4. PERMANENT RESIDENCY: Stamp 4 PR after 2 years of work under Critical Skills. EU mobility access.
5. ENGLISH — NO TEST REQUIRED: The Ireland Employer Sponsored Work Visa does NOT require a PTE or IELTS score at ANY stage. TMS provides FREE weekly English communication coaching from Day 1 — purely to help the candidate impress Irish employers during interviews. Never say PTE is mandatory or required for Ireland visa.
6. DOCUMENTS (candidate provides ONLY 4): Passport copy, Education documents, Reference letters, Medical fitness certificate. TMS handles all employer/company documents from Ireland.
7. VFS: TMS books the VFS biometrics appointment in the candidate's home country. Irish visa approved in 2-3 weeks after VFS.
8. GUARANTEE: If visa rejected for ANY reason → 100% full refund immediately, no questions asked.
9. TIMEZONE: Candidate is in ${session.countryName} (${session.timeZoneLabel}). Always quote consultations in candidate's local time!
10. WHATSAPP FORMAT: Keep answers concise, warm, punchy, under 80-100 words with 3-4 bullet points and emojis. No long essays.
11. NEVER reveal employee names (Sumit, Abhay). Refer to functional roles ("our Senior Ireland Migration Expert", "your dedicated TMS Recruitment Case Manager").
12. NO LEAKED LINKS: Never share a Google Meet link unless session is confirmed booked.
13. OCCUPATION ELIGIBILITY (3-WAY RULE — CRITICAL):
   - If occupation is on CSOL (Critical Skills list) → CSEP permit. Timeline 3-4 months. Stamp 4 PR after 2 years. Celebrate with the candidate! 🎉
   - If occupation is NOT on CSOL but NOT on IOL → GEP (General Employment Permit). Timeline 4-5 months. Also eligible!
   - If occupation is on IOL (Ineligible list) → Cannot get a work permit. Inform professionally and suggest booking a consultation to explore exceptions.
   - MINIMUM EXPERIENCE: Candidate must have at least 2 years of experience in their occupation. Always mention this requirement when discussing eligibility.

${contextBlock}

KNOWLEDGE BASE:
${TMS_VISA_IRELAND_KNOWLEDGE}
`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: `${systemPrompt}\nPrimary Intent: ${insights.primaryIntent}` },
            { role: "user", content: rawMsg },
          ],
          temperature: 0.3,
          max_tokens: 350,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiText = data.choices?.[0]?.message?.content?.trim();
        if (aiText) {
          return sanitizeFinalResponse(aiText, session);
        }
      }
    } catch (llmErr) {
      console.warn("[WhatsApp Ireland AI Error]", llmErr);
    }
  }

  // Fallback response if LLM offline
  if (occEligibility) {
    if (occEligibility.status === "CSEP") {
      return sanitizeFinalResponse(
        `Great news! 🇮🇪 Your occupation **"${occEligibility.role}"** is listed on the official Ireland Critical Skills Occupations List (CSOL) under **${occEligibility.category || "Critical Skills"}**.\n\n` +
        `• **Permit Type:** Critical Skills Employment Permit (CSEP) — 3-4 months timeline\n` +
        `• **PR Pathway:** Fast-track to Stamp 4 Permanent Residency after just 2 years!\n` +
        `• **Requirement:** Minimum 2 years of relevant experience in your field\n` +
        `• **Employer covers:** €1,000 work permit fee + €60 visa fee + flight tickets! ✈️\n` +
        `• **Candidate fee:** €300 to start (CV makeover, Case Manager, FREE English coaching & Interview Prep), €700 only after visa & flights in hand\n\n` +
        `Would you like to schedule a free 1-on-1 consultation with our Senior Ireland Migration Expert this weekend?`,
        session
      );
    }

    if (occEligibility.status === "GEP") {
      return sanitizeFinalResponse(
        `Good news! 🇮🇪 Your occupation **"${occEligibility.role}"** qualifies for Ireland's **General Employment Permit (GEP)**.\n\n` +
        `• **Permit Type:** General Employment Permit (GEP) — 4-5 months timeline\n` +
        `• **Requirement:** Minimum 2 years of relevant work experience\n` +
        `• **Employer covers:** Work permit fees, visa processing, and flight tickets! ✈️\n` +
        `• **TMS Support:** European CV makeover, Case Manager, FREE English communication coaching & employer matching\n\n` +
        `Would you like to book a free 1-on-1 consultation with our Ireland specialist to assess your profile?`,
        session
      );
    }

    if (occEligibility.status === "INELIGIBLE") {
      return sanitizeFinalResponse(
        `Thank you for reaching out! 🇮🇪 The title **"${occEligibility.role}"** is currently on Ireland's Ineligible Occupations List (IOL), meaning employment permits cannot be issued directly under this exact title.\n\n` +
        `However, many candidates qualify under related eligible occupations or specific exemptions depending on their exact duties, degree, and background.\n\n` +
        `We recommend booking a free 1-on-1 session with our Senior Ireland Migration Expert to evaluate alternative eligible titles and review your CV. Would you like to view open weekend slots?`,
        session
      );
    }
  }

  if (matchedOcc) {
    return sanitizeFinalResponse(
      `Great news! 🇮🇪 Your occupation **"${matchedOcc.role}"** is currently listed on the official Ireland Critical Skills Occupations List under **${matchedOcc.category}**.\n\n` +
      `• Sponsoring Irish employers cover your €1,000 work permit fee, €60 visa fee, and flight tickets! ✈️\n` +
      `• Minimum 2 years of relevant experience required.\n` +
      `• Initial milestone is just €300 upon agreement (covers CV makeover, Case Manager, FREE English coaching & Interview Prep).\n` +
      `• Fast-track to Stamp 4 PR after 2 years. 100% Money-Back Guarantee.\n\n` +
      `Would you like to schedule a free 1-on-1 consultation with our Ireland expert this weekend?`,
      session
    );
  }

  return sanitizeFinalResponse(
    `Thanks for your message! 🇮🇪 Under the Ireland Employer Sponsored Work Visa program (Critical Skills CSEP & General GEP), qualified professionals can secure direct employment with approved Irish companies.\n\n` +
    `• Employer covers €1,000 permit fee + €60 visa fee + all government costs + flight tickets.\n` +
    `• Candidate fee: Strictly €1,000 (€300 upon agreement, €700 only after visa approval & flight tickets in hand).\n` +
    `• €300 includes: European CV makeover, Case Manager, FREE English coaching & FREE Interview Preparation.\n` +
    `• Candidate provides only 4 docs: Passport, Education docs, Reference letters, Medical cert (minimum 2 years experience required).\n` +
    `• Fast-track Stamp 4 Permanent Residency after 2 years. 100% Money-Back Guarantee.\n\n` +
    `Reply with your CV or ask any question to get started!`,
    session
  );
}

