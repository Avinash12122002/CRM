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
  // Remove accidental "Dear at,", "letting us know, at.", "Hello at!", "Hi at,"
  sanitized = sanitized.replace(/([,\s])\s*at([.,!?])/gi, "$2");
  sanitized = sanitized.replace(/\b(Dear|Hi|Hello|welcome|know,)\s+at\b/gi, (m, prefix) => {
    return prefix.toLowerCase().includes("know") ? "know" : prefix;
  });
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

  // 1b. Phone Number Change Guard (Phone is frozen)
  const isPhoneNumberChangeRequest =
    (lowerMsg.includes("change") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile") || lowerMsg.includes("whatsapp"))) ||
    (lowerMsg.includes("update") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile") || lowerMsg.includes("whatsapp"))) ||
    lowerMsg === "change number" ||
    lowerMsg === "change phone" ||
    lowerMsg === "change my number" ||
    lowerMsg.includes("different number") ||
    (lowerMsg.includes("new") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile")));

  if (isPhoneNumberChangeRequest) {
    const candidateName =
      session.name && session.name !== "Candidate" && session.name !== "at" && session.name.trim().length > 2 && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    return (
      `Hi ${candidateName}! 🔒 Your registered phone number **cannot be changed** through this chat.\n\n` +
      `All CRM records are linked to +${session.phone}. If you have switched numbers, please message us from your **new WhatsApp number**, or email **info@tmsvisa.com**.\n\n` +
      `Your Name, Email, CV, or Consultation Slot can still be updated here anytime! 🇮🇪`
    );
  }

  // 1c. Name Change Request (100% Supported)
  const isNameChangeRequest =
    (lowerMsg.includes("change") && lowerMsg.includes("name")) ||
    (lowerMsg.includes("update") && lowerMsg.includes("name")) ||
    (lowerMsg.includes("correct") && lowerMsg.includes("name")) ||
    (lowerMsg.includes("edit") && lowerMsg.includes("name")) ||
    lowerMsg === "i want to change my name" ||
    lowerMsg === "can i change my name" ||
    lowerMsg === "change name" ||
    lowerMsg === "name change" ||
    lowerMsg.includes("my name is not") ||
    lowerMsg.includes("my name is wrong");

  if (isNameChangeRequest) {
    return (
      `Certainly! You can update your name anytime right here in this chat. ✍️\n\n` +
      `Please reply with your **Full Name** (for example: *"My name is Rajesh Sharma"* or *"Name: Priya Patel"*), and I will update your official CRM record immediately!`
    );
  }

  // 1d. Email Change Request (100% Supported)
  const isEmailChangeRequest =
    (lowerMsg.includes("change") && lowerMsg.includes("email")) ||
    (lowerMsg.includes("update") && lowerMsg.includes("email")) ||
    (lowerMsg.includes("correct") && lowerMsg.includes("email")) ||
    (lowerMsg.includes("edit") && lowerMsg.includes("email")) ||
    lowerMsg === "i want to change my email" ||
    lowerMsg === "can i change my email" ||
    lowerMsg === "change email" ||
    lowerMsg === "email change" ||
    lowerMsg.includes("my email is not") ||
    lowerMsg.includes("my email is wrong");

  if (isEmailChangeRequest) {
    return (
      `Certainly! You can update your email address anytime right here. 📧\n\n` +
      `Please reply with your **new email address** (for example: *"My email is yourname@gmail.com"*), and I will update your record and dispatch your official Ireland visa information pack immediately!`
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

CRM LIFECYCLE & PIPELINE STAGE:
- CRM Pipeline Status: ${session.crmStatus || (session.meetingCompleted ? "follow-up" : "new-lead")}
- Assigned Counselor / Case Manager: ${session.crmAssignedToName || "TMS Ireland Migration Desk"}
- Current Funnel Step: ${session.currentStep}
- Meeting Lifecycle Status: ${session.meetingStatus || (session.bookedSlot ? "booked" : "none")}
- Payment Status: ${session.paymentPending ? "Pending (€300 Initial Milestone)" : "Settled / In Progress"}
- Document Status: ${session.documentPending ? "Pending Document Collection" : "In Review"}
- Scheduled Callback: ${session.crmCallbackDate || "None"}
- CRM Team Notes: ${session.crmNotes && session.crmNotes.length > 0 ? session.crmNotes.slice(-3).join(" | ") : "None"}
- Info Email Sent: ${session.infoEmailSentAt ? "Yes ✅" : "No"}
- CV Received: ${session.cvReceivedAt ? `Yes ✅ (${new Date(session.cvReceivedAt).toLocaleDateString()})` : "Not received yet"}
- CV File: ${session.cvFileName || "None"}

VISA INTEREST:
- Destination of Interest: Ireland 🇮🇪
- Target Visa Pathway: Ireland Employer Sponsored Work Visa — Critical Skills Employment Permit (CSEP) & General Employment Permit (GEP)
- Known Occupation: ${session.occupation || (session.occupations && session.occupations.length > 0 ? session.occupations.join(", ") : "Not specified yet")}
- Work Experience: ${session.yearsExperience || "Not specified yet"}

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
    Boolean(session.leadId) ||
    Boolean(session.bookedSlot) ||
    (session.crmStatus && ACTIVE_CRM_STATUSES.includes(session.crmStatus.toLowerCase().trim())) ||
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.currentStep === "MEETING_COMPLETED";

  if (session.crmStatus === "meeting-scheduled" || session.bookedSlot) {
    contextBlock += `
ACTIVE CONFIRMED CONSULTATION:
- Date: ${session.bookedSlot?.date || "Scheduled in CRM"}
- Candidate Local Time: ${session.bookedSlot?.candidateTimeLabel || "Scheduled time"}
- Consultant: TMS Visa Senior Ireland Migration Expert
- Status: Confirmed Booked
- CRITICAL INSTRUCTION: The candidate ALREADY has their consultation scheduled! Congratulate them on taking the first step. Under NO circumstances ask them to book or send CV right now.
`;
  } else if (session.crmStatus === "sales") {
    contextBlock += `
ENROLLED CLIENT (SALES / CASE MANAGER ASSIGNED):
- Status: Officially Enrolled Candidate in Ireland Employer Sponsored Program
- Dedicated Case Manager: Active
- CRITICAL INSTRUCTION: Treat candidate as an enrolled client. Assist them warmly with any questions about their CV marketing to Irish employers, interview preparation, or document verification.
`;
  } else if (session.crmStatus === "payment-pending") {
    contextBlock += `
PAYMENT PENDING (€300 INITIAL MILESTONE FEE):
- Status: Consultation Complete, €300 Initial Milestone Fee Pending
- CRITICAL INSTRUCTION: Candidate has completed consultation and has pending enrollment fee. Answer questions about invoice, payment options, what is included (dedicated Case Manager, European CV revamp, free weekly English communication coaching), and the 100% money-back guarantee.
`;
  } else if (session.crmStatus === "document-pending") {
    contextBlock += `
DOCUMENT COLLECTION STAGE:
- Status: Enrolled, Pending Document Verification
- Required Candidate Documents (Only 4): 1. Passport Copy, 2. Education Certificates, 3. Reference Letters (minimum 2 years experience), 4. Medical Fitness Certificate.
- CRITICAL INSTRUCTION: Answer document submission questions clearly. Emphasize that candidate only needs to provide these 4 simple documents, and TMS handles all company/employer filings.
`;
  } else if (session.crmStatus === "call-back") {
    contextBlock += `
SCHEDULED CALLBACK:
- Status: Callback requested (${session.crmCallbackDate || "Scheduled soon"})
- CRITICAL INSTRUCTION: Acknowledge that our senior consultation desk has a scheduled callback with them. Answer any quick questions they have politely.
`;
  } else if (session.crmStatus === "follow-up" || session.meetingCompleted) {
    contextBlock += `
CONSULTATION COMPLETED (POST-MEETING FOLLOW-UP):
- Status: 1-on-1 Consultation Already Completed
- CRITICAL INSTRUCTION: The 1-on-1 consultation has ALREADY been completed! Under NO circumstances offer, prompt, or mention booking or rescheduling a meeting. Candidate is in post-consultation follow-up. Answer whatever specific question they asked directly. Do NOT repeat robotic onboarding or CV requests.
`;
  }

  // Inject last 6 messages from conversation history for full context without token bloat
  if (session.conversationHistory && session.conversationHistory.length > 0) {
    const recentHistory = session.conversationHistory.slice(-6);
    contextBlock += `
RECENT CONVERSATION HISTORY (Last ${recentHistory.length} messages):
${recentHistory.map((h, i) => `  [${i + 1}] ${h.role === "candidate" ? "CANDIDATE" : "TMS BOT"}: "${h.message.slice(0, 140)}"`).join("\n")}
`;
  }

  const nameSalutation = session.name && session.name !== "Candidate" ? ` ${session.name}` : "";

  // Check if candidate asks what documents to send
  const isAskingWhatToSend =
    lowerMsg.includes("send more") ||
    lowerMsg.includes("what more") ||
    lowerMsg.includes("what can i send") ||
    lowerMsg.includes("what else can i send") ||
    lowerMsg.includes("what documents") ||
    lowerMsg.includes("which documents") ||
    lowerMsg.includes("doc list") ||
    lowerMsg.includes("documents needed") ||
    lowerMsg.includes("what to send");

  if (isAskingWhatToSend) {
    return sanitizeFinalResponse(
      `Hi${nameSalutation}! For your Ireland Employer Sponsored Work Visa, you only need to provide 4 simple documents: 🇮🇪📄\n\n` +
      `1️⃣ **Updated CV / Resume** (Word or PDF)\n` +
      `2️⃣ **Valid Passport Copy** (Front & back photo pages)\n` +
      `3️⃣ **Work Reference Letters** (Proving 2+ years of relevant experience)\n` +
      `4️⃣ **Educational Certificates** (Degree or Diploma certificate)\n\n` +
      `💡 *Note:* No English test (PTE/IELTS) is required for Ireland! You can upload your documents right here on WhatsApp.`,
      session
    );
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
0. MANDATE FOR ACTIVE CRM CANDIDATES (${session.crmStatus || "NEW"}):
${
  isCrmCandidate
    ? `- CRITICAL MANDATE: This candidate is an EXISTING CRM CANDIDATE with status "${session.crmStatus || "Active In CRM"}".
- All initial intake steps (asking for email, sending info brochures, scheduling/holding consultations) HAVE ALREADY BEEN FULLY COMPLETED by our human team!
- UNDER NO CIRCUMSTANCES ask candidate for their email address. We already have it in CRM!
- UNDER NO CIRCUMSTANCES ask or prompt them to book a consultation meeting or schedule a call.
- UNDER NO CIRCUMSTANCES ask "Would you like to schedule a consultation" or suggest booking open weekend slots.
- UNDER NO CIRCUMSTANCES ask "What is your occupation and years of experience" as if they are a new stranger.
- Directly answer whatever question or message they sent, tailored to their current CRM file status (Assigned Counselor: ${session.crmAssignedToName || "Senior Ireland Counselor"}).`
    : `- If the candidate has not booked a consultation yet, guide them to review eligibility and choose a weekend slot.`
}
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
   - If occupation is on IOL (Ineligible list) → Cannot get a work permit. Inform professionally and suggest alternative paths.
   - MINIMUM EXPERIENCE: Candidate must have at least 2 years of experience in their occupation. Always mention this requirement when discussing eligibility.
14. STRICT ANTI-REPETITION MANDATE & CONVERSATION AWARENESS:
   - Review candidate's query and recent messages!
   - If the bot already described the file status or requested CV, DO NOT REPEAT that message!
   - If candidate asks "what can I send more", "what else can I send", or asks what documents are needed:
     Tell them clearly: Candidate provides ONLY 4 simple documents: Updated CV, Passport copy, Work reference letters, Educational certificates.
   - Never get stuck repeating the same template loop. Always answer the candidate's exact question directly!
15. CANDIDATE PROFILE UPDATES (NAME & EMAIL 100% ALLOWED — PHONE NUMBER STRICTLY FROZEN):
   - PHONE NUMBER IS STRICTLY FROZEN: Phone numbers CANNOT be changed via chat because all candidate records and consultation bookings are permanently tied to their active WhatsApp number (+${session.phone}). If they ask to change their phone number, firmly explain they must message from their new WhatsApp number.
   - CANDIDATE CAN FREELY CHANGE THEIR NAME: If candidate asks to change or update their name, NEVER refuse! NEVER claim that personal details or names cannot be changed! Warmly invite them: "Please reply with your Full Name (e.g. 'My name is John Doe') and I will update your official CRM profile immediately."
   - CANDIDATE CAN FREELY CHANGE THEIR EMAIL: If candidate asks to change or update their email, NEVER refuse! Warmly invite them: "Please reply with your new Email Address (e.g. 'My email is yourname@gmail.com') and I will update your record and resend your visa documents immediately."
   - NEVER claim that name or email cannot be changed for security reasons! Name and email updates are 100% permitted and supported in this chat.

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
        (isCrmCandidate
          ? `Our team is actively managing your file (Status: ${session.crmStatus || "In Progress"}). Please let us know if you have any questions or documents to update!`
          : `Would you like to schedule a free 1-on-1 consultation with our Senior Ireland Migration Expert this weekend?`),
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
        (isCrmCandidate
          ? `Our team is actively managing your file (Status: ${session.crmStatus || "In Progress"}). Please let us know if you have any questions or documents to update!`
          : `Would you like to book a free 1-on-1 consultation with our Ireland specialist to assess your profile?`),
        session
      );
    }

    if (occEligibility.status === "INELIGIBLE") {
      return sanitizeFinalResponse(
        `Thank you for reaching out! 🇮🇪 The title **"${occEligibility.role}"** is currently on Ireland's Ineligible Occupations List (IOL), meaning employment permits cannot be issued directly under this exact title.\n\n` +
        `However, many candidates qualify under related eligible occupations or specific exemptions depending on their exact duties, degree, and background.\n\n` +
        (isCrmCandidate
          ? `Your assigned counselor is reviewing related eligible classifications for your background. Please feel free to message any questions or additional details here anytime!`
          : `We recommend booking a free 1-on-1 session with our Senior Ireland Migration Expert to evaluate alternative eligible titles and review your CV. Would you like to view open weekend slots?`),
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
      (isCrmCandidate
        ? `Our team is tracking your file (Status: ${session.crmStatus || "In Progress"}). Please let us know if you have any questions or documents to share!`
        : `Would you like to schedule a free 1-on-1 consultation with our Ireland expert this weekend?`),
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
    (isCrmCandidate
      ? `Our team is actively managing your file (Status: ${session.crmStatus || "In Progress"}). Please feel free to ask any questions or share any updates right here!`
      : `Reply with your CV or ask any question to get started!`),
    session
  );
}

