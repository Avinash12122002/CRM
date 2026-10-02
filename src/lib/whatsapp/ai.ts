import { WhatsAppSession } from "./types";
import { TMS_VISA_KNOWLEDGE, FAQ_FALLBACKS } from "./knowledge";
import { findEligibleOccupation } from "./occupations";
import { getCandidateMessageInsights, CandidateMessageInsight } from "./messageIntelligence";
import { getCandidateConsultationWindow } from "./timezone";

/**
 * Removes any accidental staff names (Sumit, Abhay, etc.) to guarantee strict institutional anonymity.
 */
function sanitizeStaffNames(text: string): string {
  if (!text) return text;
  return text
    .replace(/\b(Sumit|Abhay)\b/gi, (match) => {
      const lower = match.toLowerCase();
      if (lower === "sumit") return "your dedicated TMS Recruitment Case Manager";
      if (lower === "abhay") return "our Senior Migration Expert";
      return "our Senior Migration Specialist";
    })
    .replace(/\b(Mr\.?\s*Sumit|Mr\.?\s*Abhay)\b/gi, "our Senior Migration Specialist");
}

/**
 * Strict Meeting Link Guard:
 * If the candidate has NOT booked a consultation, guarantees that any leaked meet.google.com link
 * or phrases offering room access are completely stripped out before sending.
 */
function sanitizeMeetingLink(text: string, session: WhatsAppSession): string {
  if (!text) return text;
  const isBooked = session.meetingStatus === "booked" || Boolean(session.bookedSlot);
  if (isBooked) return text;

  // Remove lines like "• Join the meeting via https://meet.google.com/hgu-yxat-nwy when you're ready."
  const cleaned = text
    .replace(/[•\-\*]?\s*(?:Join the meeting via|Join via|Meeting link:|Google Meet link:)?\s*https?:\/\/meet\.google\.com\/[^\s\)]+(?:\s*(?:when you(?:'re|re) ready|when ready))?\.?/gi, "")
    .replace(/https?:\/\/meet\.google\.com\/[a-z0-9\-]+/gi, "")
    .replace(/[•\-\*]?\s*Join the meeting via[^\n\.]+\.?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

/**
 * Strict Non-IST Timezone Sanitizer:
 * If the candidate is NOT in India, removes any accidental mention of "IST" and ensures
 * candidate local timing is strictly used.
 */
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

/**
 * Master post-processor applied to every outgoing AI and local expert message.
 */
function sanitizeFinalResponse(text: string, session: WhatsAppSession): string {
  if (!text) return text;
  let sanitized = sanitizeStaffNames(text);
  sanitized = sanitizeMeetingLink(sanitized, session);
  sanitized = sanitizeTimezoneForCandidate(sanitized, session);
  return sanitized;
}

/**
 * Generates an intelligent, human-like response tailored to the candidate's exact CRM state.
 * Combines ultra-fast LLM inference (Groq / Gemini / OpenAI) with an advanced local
 * Australian Visa Expert Cognitive Engine that analyzes candidate intent dynamically.
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

  // 1. Strict Security & Policy Check: Deletion, Purge, Reset, or Removal of Data/Chats/Profiles
  const isDeletionRequest =
    lowerMsg.includes("delete") ||
    lowerMsg.includes("erase") ||
    lowerMsg.includes("purge") ||
    lowerMsg.includes("wipe") ||
    lowerMsg.includes("start from fresh") ||
    lowerMsg.includes("start fresh") ||
    lowerMsg.includes("clear chat") ||
    lowerMsg.includes("clear history") ||
    ((lowerMsg.includes("reset") || lowerMsg.includes("remove")) &&
      (lowerMsg.includes("chat") ||
        lowerMsg.includes("data") ||
        lowerMsg.includes("profile") ||
        lowerMsg.includes("everything") ||
        lowerMsg.includes("cv") ||
        lowerMsg.includes("record") ||
        lowerMsg.includes("history") ||
        lowerMsg.includes("info") ||
        lowerMsg.includes("account") ||
        lowerMsg.includes("from fresh") ||
        lowerMsg.includes("conversation")));

  if (isDeletionRequest) {
    return (
      `Data deletion, profile removal, or chat resets cannot be performed through this chat. 🔒\n\n` +
      `All account data is managed exclusively by our CRM Administrator for compliance and verification. For administrative requests, email: info@tmsvisa.com`
    );
  }

  // 1b. Strict Security Policy Check: Phone Number Cannot Be Changed via Chat
  const isPhoneNumberChangeRequest =
    (lowerMsg.includes("change") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile") || lowerMsg.includes("contact") || lowerMsg.includes("whatsapp"))) ||
    (lowerMsg.includes("update") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile") || lowerMsg.includes("contact") || lowerMsg.includes("whatsapp"))) ||
    (lowerMsg.includes("new") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile"))) ||
    (lowerMsg.includes("different") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile"))) ||
    (lowerMsg.includes("wrong") && (lowerMsg.includes("number") || lowerMsg.includes("phone") || lowerMsg.includes("mobile")));

  if (isPhoneNumberChangeRequest) {
    const candidateName =
      session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : "there";

    return (
      `Hi ${candidateName}! 🔒 Your registered phone number **cannot be changed** through this chat.\n\n` +
      `All records are permanently linked to +${session.phone}. If you've switched numbers, message us from your **new WhatsApp number**, or email **info@tmsvisa.com** for verification.\n\n` +
      `Your Name, Email, CV, or Consultation Slot can still be updated here anytime! 🇦🇺`
    );
  }

  // 2. Strict Anonymity Fallback: Inquiries about individual staff names (Sumit, Abhay, etc.)
  const isAskingStaffName =
    lowerMsg.includes("sumit") ||
    lowerMsg.includes("abhay") ||
    lowerMsg.includes("staff name") ||
    lowerMsg.includes("employee name") ||
    lowerMsg.includes("person name") ||
    lowerMsg.includes("case manager name") ||
    lowerMsg.includes("consultant name") ||
    lowerMsg.includes("who is managing") ||
    lowerMsg.includes("who is my case manager") ||
    lowerMsg.includes("who is taking my call") ||
    lowerMsg.includes("who is taking my meeting");

  if (isAskingStaffName) {
    return (
      `For compliance, individual staff names are not shared. 🔒 Your profile is handled by:\n\n` +
      `• **Aria** — Senior Migration Counselor (initial guidance)\n` +
      `• **TMS Recruitment Case Manager** — CV makeover, PTE coaching & employer marketing\n` +
      `• **Senior Migration Expert** — Free 1-on-1 weekend consultation\n` +
      `• **Registered Migration Agent (MARN)** — Visa lodgement with Home Affairs\n\n` +
      `Contact: info@tmsvisa.com`
    );
  }

  const matchedOcc = findEligibleOccupation(message);

  // Build rich candidate live profile — fed to AI as system context
  let contextBlock = `
CANDIDATE LIVE CRM PROFILE & FULL DOSSIER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTITY:
- Candidate Name: ${session.name || "Candidate"}
- Phone Number: +${session.phone}
- Email Address: ${session.email || "Not shared yet"}
- Country of Residence: ${session.countryName} (${session.timeZoneLabel})
- Age: ${session.ageRange || "Not specified"}
- Marital Status: ${session.maritalStatus || "Not specified"}
- Family / Dependents: ${session.familySize || "Not specified"}
- Languages Spoken: ${session.languageSpoken || "Not specified"}

VISA INTEREST:
- Destination of Interest: ${session.interestedCountry || "Australia"}
- Target Visa Pathway: Australia Employer Sponsored Work Visa (Skills in Demand)
- Candidate Goals: ${session.candidateGoals || "Not specified"}

PROFESSIONAL BACKGROUND:
- Known Occupation: ${session.occupation || (session.occupations && session.occupations.length > 0 ? session.occupations.join(", ") : "Not specified yet")}${session.occupationSector ? ` (Sector: ${session.occupationSector})` : ""}
- All Identified Occupations: ${session.occupations && session.occupations.length > 0 ? session.occupations.join(", ") : session.occupation || "None"}
- Current Job Title: ${session.currentJobTitle || "Not specified"}
- Current Employer: ${session.currentEmployer || "Not specified"}
- Work Experience: ${session.yearsExperience || "Not specified yet"}
- Current Salary: ${session.currentSalary || "Not specified"}
- Desired Salary in Australia: ${session.desiredSalary || "Not specified"}
- Educational Qualification: ${session.highestQualification || "Not specified yet"}
- English Language Status: ${session.englishTestStatus || "Preparing with TMS / Pending"}
- Passport Status: ${session.hasPassport === true ? "Has valid passport ✅" : session.hasPassport === false ? "No passport ❌" : "Not specified"}

CRM LIFECYCLE & PIPELINE STAGE:
- CRM Pipeline Status: ${session.crmStatus || (session.meetingCompleted ? "follow-up" : "new-lead")}
- Assigned Counselor / Case Manager: ${session.crmAssignedToName || "TMS Senior Migration Desk"}
- Current Funnel Step: ${session.currentStep}
- Meeting Lifecycle Status: ${session.meetingStatus || (session.bookedSlot ? "booked" : "none")}
- Payment Status: ${session.paymentPending ? "Pending (Awaiting AUD 300 Initial Service Fee)" : "Settled / In Progress"}
- Document Status: ${session.documentPending ? "Pending Document Collection" : "In Review"}
- Scheduled Callback: ${session.crmCallbackDate || "None"}
- CRM Team Notes: ${session.crmNotes && session.crmNotes.length > 0 ? session.crmNotes.slice(-3).join(" | ") : "None"}
- Info Email Sent: ${session.infoEmailSentAt ? "Yes ✅" : "No"}
- CV Received: ${session.cvReceivedAt ? `Yes ✅ (${new Date(session.cvReceivedAt).toLocaleDateString()})` : "Not received yet"}
- CV File: ${session.cvFileName || "None"}
`;

  if (matchedOcc) {
    contextBlock += `
INQUIRED OCCUPATION MATCH:
- Role: "${matchedOcc.role}"
- Sector: "${matchedOcc.category}"
- Status: CONFIRMED on the official 691 Australia Employer Sponsored Work Visa Eligible Occupation List.
- Instruction: Confidently confirm to the candidate that their role "${matchedOcc.role}" is on the official list under ${matchedOcc.category}!
`;
  }

  // Stage-Specific Instructions based on Candidate's exact CRM Stage
  if (session.crmStatus === "meeting-scheduled" || session.bookedSlot) {
    contextBlock += `
ACTIVE CONFIRMED CONSULTATION:
- Date: ${session.bookedSlot?.date || "Scheduled in CRM"}
- Candidate Local Time: ${session.bookedSlot?.candidateTimeLabel || "Scheduled time"}
- Consultant: TMS Visa Senior Migration Expert
- Status: Confirmed Booked
- CRITICAL INSTRUCTION: The candidate ALREADY has their consultation scheduled! Congratulate them on taking the first step. Answer any preparation questions they have (topics covered: CV evaluation across 691 occupations, employer matching process, 4-5 month timeline). Under NO circumstances ask them to book or send CV right now.
`;
  } else if (session.crmStatus === "sales") {
    contextBlock += `
ENROLLED CLIENT (SALES / CASE MANAGER ASSIGNED):
- Status: Officially Enrolled Candidate in Australia Employer Sponsored Program
- Dedicated Case Manager: Active
- CRITICAL INSTRUCTION: Treat candidate as an enrolled client. Assist them warmly with any questions about their CV marketing to Australian employers, interview preparation, document verification, or free PTE classes.
`;
  } else if (session.crmStatus === "payment-pending") {
    contextBlock += `
PAYMENT PENDING (AUD 300 INITIAL MILESTONE FEE):
- Status: Consultation Complete, AUD 300 Onboarding Fee Pending
- CRITICAL INSTRUCTION: Candidate has completed consultation and has pending onboarding fee. Answer questions about invoice, payment options, what is included (dedicated Case Manager, Australian CV revamp, free weekly PTE coaching), and the 100% money-back guarantee terms.
`;
  } else if (session.crmStatus === "document-pending") {
    contextBlock += `
DOCUMENT COLLECTION STAGE:
- Status: Onboarding in Progress — Awaiting Candidate Documents
- CRITICAL INSTRUCTION: Candidate is submitting documents. If candidate asks what more they can send or what documents are needed ("what can I send more", "documents needed"):
  Explain clearly that they can share:
  1) Latest CV / Resume (PDF or Word)
  2) Valid Passport (photo & address pages)
  3) Experience Letters / Reference Letters / Relieving letters / recent payslips
  4) Educational Degree / Diploma certificates
  5) English scorecard (PTE/IELTS) if already taken (otherwise free PTE coaching is provided from day 1).
`;
  } else if (session.crmStatus === "call-back") {
    contextBlock += `
CALLBACK SCHEDULED:
- Status: Telephonic Callback Scheduled${session.crmCallbackDate ? ` for ${session.crmCallbackDate}` : ""}
- CRITICAL INSTRUCTION: Candidate is expecting a phone call from our counseling team. Answer their immediate chat questions politely and confirm an advisor will call them.
`;
  } else if (session.meetingCompleted || session.meetingStatus === "completed" || session.crmStatus === "follow-up") {
    contextBlock += `
CONSULTATION OUTCOME (FOLLOW-UP):
- Status: Consultation Successfully Completed
- Completed On: ${session.meetingCompletedAt ? new Date(session.meetingCompletedAt).toISOString().split('T')[0] : "Recently"}
- CRITICAL INSTRUCTION: The 1-on-1 consultation has ALREADY been completed! Under NO circumstances offer, prompt, or mention booking or rescheduling a meeting. Candidate is in post-consultation follow-up. Answer whatever specific question they asked directly. Do NOT repeat robotic onboarding or CV requests if they ask a question.
`;
  } else if (session.meetingStatus === "canceled") {
    contextBlock += `
CONSULTATION CANCELLATION DETAILS:
- Status: Canceled
- Canceled At: ${session.meetingCanceledAt ? new Date(session.meetingCanceledAt).toISOString().split('T')[0] : "Recently"}
- Reason: ${session.meetingCancellationReason || "Requested by candidate"}
- CRITICAL INSTRUCTION: Candidate's meeting was cancelled. Remind candidate that their consultation was cancelled and encourage them to reschedule for an upcoming weekend in their local time.
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

  const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);
  contextBlock += `
CANDIDATE LOCAL TIMEZONE & CONSULTATION HOURS:
- Candidate Country: ${session.countryName}
- Candidate Local Timezone: ${session.timeZoneLabel} (${candWindow.tzShort})
- Candidate Weekend Consultation Hours: strictly ${candWindow.displayWindow} (Saturdays & Sundays)
- CRITICAL TIMEZONE INSTRUCTION: ALWAYS AND ONLY quote the candidate's exact local timing: "${candWindow.displayWindow}". Under NO circumstances mention "IST" to candidates outside India!
`;

  // Dynamically analyze candidate message intent, tone, sentiment, and inject learned knowledge directives
  const insights = getCandidateMessageInsights({ message: rawMsg, session });

  // Check if candidate is already in active CRM stages
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
    session.meetingCompleted === true ||
    session.meetingStatus === "completed";

  const SYSTEM_PROMPT = `
You are Aria, Senior Registered Migration Counselor at The Migration School (TMS Visa).
You speak like a knowledgeable, warm, empathetic, and authoritative human visa expert.

${TMS_VISA_KNOWLEDGE}

${contextBlock}

${insights.learnedDirectives}

RESPONSE DIRECTIVES:
0. MANDATE FOR ACTIVE CRM CANDIDATES (${session.crmStatus || "NEW"}):
${
  isCrmCandidate
    ? `- CRITICAL MANDATE: This candidate is an EXISTING CRM CANDIDATE with status "${session.crmStatus || "Active In CRM"}".
- All intake steps (asking for email, sending info brochures, scheduling/holding consultations) HAVE ALREADY BEEN FULLY COMPLETED by our human team!
- UNDER NO CIRCUMSTANCES ask candidate for their email address.
- UNDER NO CIRCUMSTANCES ask or prompt them to book a consultation meeting or schedule a call.
- UNDER NO CIRCUMSTANCES ask "Want to book a free weekend consultation" or "Would you like to book a consultation".
- UNDER NO CIRCUMSTANCES ask "What is your occupation and years of experience" as if they are a new stranger.
- Directly answer whatever question or message they sent, tailored to their current CRM file status.`
    : `- If the candidate has not booked a consultation yet, guide them to review eligibility and choose a weekend slot from the menu.`
}

1. STRICT ANONYMITY — ZERO PERSONAL STAFF NAMES:
- NEVER tell the candidate any individual employee or person names (NEVER say "Sumit", "Abhay", or any person's name).
- If the candidate explicitly asks for personal names or asks about Sumit, Abhay, or staff names, explain that under institutional data protection and compliance protocol, personal employee names are not shared.
- ALWAYS refer to staff strictly by professional functional titles: "your dedicated TMS Recruitment Case Manager", "our Senior Migration Expert", "our Registered Australian Migration Agent (MARN Holder)", or "Aria, Senior Registered Migration Counselor".

2. SPEAK LIKE A HUMAN & A REGISTERED VISA EXPERT:
- Analyze what the user said, read their intent and questions carefully.
- Acknowledge their situation and feelings (career ambitions, family relocation, financial clarity, relocation doubts).
- Answer their exact question in your opening sentence with real Australian migration authority.
- Greet candidate by name (${session.name && session.name !== "Candidate" ? session.name : "there"}).
- Relate directly to their facts (Occupation: ${session.occupation || "their occupation"}, Experience: ${session.yearsExperience || "their experience"}, Location: ${session.countryName}).

3. ULTRA-CONCISE & SHORT WHATSAPP FORMAT (STRICT LIMIT: 60 TO 100 WORDS MAX — NEVER CUT INFORMATION):
- Candidates read on mobile WhatsApp. Every response MUST be SHORT, CRISP, and QUICK TO READ. Long essays or huge multi-section dumps are STRICTLY FORBIDDEN.
- NEVER CUT ANY INFORMATION: When answering ANY question, include all essential facts, figures, and rules requested, but state them in tight, compact 1-line bullet points.
- NO VERBOSE INTROS: Never write long introductory preambles (e.g. NEVER say "Here is the complete, step-by-step journey for your Australia Employer Sponsored Work Visa with TMS Visa:"). Jump directly to the answer.
- NO SEPARATE REDUNDANT BLOCKS: Never append a separate "Key Benefits" section or regurgitate information already covered. If explaining the process, integrate key figures directly into the bullets or a 2-line summary.
- IF CANDIDATE ASKS ABOUT PROCESS / STEPS / HOW IT WORKS:
  Give a tight 5-step roadmap + key figures (all under 95 words):
  1️⃣ CV Review: Free check across 691 eligible roles
  2️⃣ Onboarding (AUD 300): Case Manager, CV makeover & free weekly PTE coaching
  3️⃣ Employer Match: Interview & official job offer from approved Australian sponsor
  4️⃣ Docs & Visa: Only 3 docs (Passport, Medical, PCC) + PTE (after offer); MARN Agent lodges visa
  5️⃣ Travel & Balance (AUD 700): AUD 700 paid ONLY after visa grant & flight tickets in hand!
  Employer covers: $330 permit + $6,000 embassy + $1,000 flight. Min salary AUD $76,500/yr. PR in 2 yrs. 4-5 months total.
- Key figures to include when relevant:
  * Minimum statutory salary: AUD $76,500/year threshold plus 11.5% superannuation.
  * Australian employer covers: $330 work permit + $6,000 embassy fees + $1,000 flight ticket.
  * Candidate fee: Exactly AUD 1,000 total (AUD 300 to start; AUD 700 balance only after visa approval & flight tickets in hand).
  * 3 candidate documents: only Passport copy, Medical Fitness, and Police Clearance (PCC).
  * English requirements: No exam needed to start; TMS provides free weekly PTE coaching from week 1; exam taken after job offer (PTE Academic L:33, R:36, W:29, S:24 or IELTS 5.0).
  * Timeline: 4 to 5 months total from raw CV to visa approval and travel.
  * PR pathway: Direct Australian Permanent Residency (Subclass 186) after 2 years.
  * Rejection guarantee: Direct pre-vetted employer sponsorship ensures work visas with TMS never get rejected.
- Structure: 1 brief greeting line → 3 to 5 compact bullet points → 1 closing CTA line.
- MAXIMUM TOTAL LENGTH: 60 to 100 words. Absolutely NEVER exceed 110 words.
- Never initiate "Subclass 482" — always use "Australia Employer Sponsored Work Visa".

4. RESPONDING TO "ARE YOU A BOT / ARE YOU AI / WHO ARE YOU":
- Clarify warmly: "I am Aria, Senior Registered Migration Counselor at The Migration School (TMS Visa). I coordinate directly with our Senior Migration Experts and Registered Australian Migration Agents (MARN Holders) to assess candidates for Australian employer sponsorship."
- Do NOT sound robotic. Emphasize that candidate is communicating directly with our professional visa counseling desk.

5. RESPONDING TO SKEPTICISM, INSULTS, ANGER, OR SCAM FEARS:
- Never argue, become defensive, or fail to respond.
- Validate their caution: explain that migration fraud is widespread, which is why TMS operates under registered corporate entities in Australia (Orange NSW, ABN 75 148 213 076) and India (Groworld Vijatour Pvt Ltd, CIN U62099HR2024PTC122827), uses registered MARN agents, and protects candidates with a two-stage milestone fee (AUD 300 to start; AUD 700 strictly after visa approval & flight tickets in hand).

6. RESPONDING TO "HOW DID YOU GET MY NUMBER / I NEVER APPLIED":
- Clarify politely that their profile was received through our international skilled migration portal or job board inquiry for Australian employment.
- Offer an easy opt-out ("You can reply 'Not Right Now' at any time") while inviting them to evaluate their CV if they have 2+ years experience.

7. OUT-OF-CONTEXT / SLANG / ABBREVIATIONS:
- Understand intent even if candidate speaks in slang, short replies ("k", "tell", "plz", "how"), or emotional expressions.
- Always provide an empathetic, human, and informative Australian visa expert answer.

8. STRICT SECURITY POLICY — PHONE NUMBER CANNOT BE CHANGED IN CHAT:
- NEVER tell the candidate that their phone number has been updated or changed.
- NEVER ask the candidate to reply with a new phone number.
- NEVER accept or pretend to accept a new phone number.
- Under strict compliance and CRM security, phone numbers cannot be changed through WhatsApp chat because all candidate records, verified files, and consultation bookings are permanently tied to their current active WhatsApp number (+${session.phone}).
- If candidate asks to change or update their number, firmly explain that registered phone numbers cannot be changed via chat for security reasons. They should message directly from their new WhatsApp number or email info@tmsvisa.com.

9. THINK LIKE GOOGLE & BE SMART — ANALYZE THE EXACT QUESTION (NEVER REPEAT CANNED TEMPLATES):
- Carefully analyze what the candidate asked or said (whether in English, Hindi, or Hinglish like "Visa ka kya rha", "kya hua", "mera visa kab aayega", "fees kitni hai", "Sir", "Job milegi?").
- If the candidate asked a specific question, answer THAT question directly and accurately in 1-3 sentences. NEVER send a canned greeting asking for their job title and experience if they already asked a question!
- If the candidate asks in Hindi or Hinglish, reply in simple, natural, conversational Hinglish/Hindi or English that directly addresses what they asked.
- If the candidate asks about visa progress/status and you do not have their specific file, think like an intelligent counselor & Google: explain what TMS does (Australia Employer Sponsored Work Visa with min salary AUD $76,500/year), and ask for their resume or registered email ID so you can look up their exact file.
- If the candidate just greets (e.g. "Sir", "Namaste", "Hello"), respond politely and ask how you can help them with their Australia career or visa pathway today.

10. EMAIL INQUIRIES, RESENDS & DELIVERY:
- NEVER claim that an official consultation summary or document has already been sent if the candidate is asking for it or states they haven't received it.
- NEVER tell the candidate to reply "Resend" in an unhandled loop.
- If the candidate asks for an email or states they did not receive it, reassure them warmly: explain that TMS Visa will immediately deliver the official Australia Employer Sponsored Work Visa Information Pack (including the 691 Eligible Occupation list and PTE Guide) to ${session.email ? `**${session.email}**` : "their registered email address"}.
- Remind candidate to check both their Inbox and Spam/Junk folder.
- If candidate wants to update or change their email address, tell them: "Reply with 'My email is yourname@example.com' and our system will immediately update your profile and email the visa documents to your new address."

11. CONSULTATION DURATION, CANDIDATE LOCAL TIMEZONE & INTERACTIVE BOOKING PROTOCOL:
- Consultations with our Senior Migration Expert are strictly 1-HOUR Google Meet sessions (NEVER 2 hours!).
- Consultations are scheduled strictly on Saturdays and Sundays between ${candWindow.displayWindow} in candidate's local time.
- ABSOLUTE TIMEZONE MANDATE: Candidate is located in ${session.countryName}. NEVER mention "IST" or "1-9 PM" unless the candidate is located in India! Always and only refer to their consultation timings as "${candWindow.displayWindow}".
- ABSOLUTE MEETING LINK PRIVACY: NEVER send or offer any Google Meet link (such as meet.google.com/...) unless the candidate has already booked their slot (meetingStatus: "booked"). Unbooked candidates MUST select a slot first from the menu.
- When a candidate asks to book, schedule, or discusses consultation timing, tell them they can choose their preferred weekend date and 1-hour slot directly from our interactive WhatsApp menu. NEVER ask the candidate to reply with a date or time in plain text!

12. STRICT ANTI-REPETITION MANDATE & CONVERSATION AWARENESS:
- Review RECENT CONVERSATION HISTORY before answering!
- If the bot's last message already stated "Your consultation is complete, and your file is currently in onboarding" or asked for CV, DO NOT REPEAT THAT SAME PARAGRAPH OR TEMPLATE!
- If candidate says "Now want can I send more", "what can I send", "what else can I send", or asks about documents:
  Answer their question directly and list the exact documents:
  * Updated CV / Resume (Word or PDF format)
  * Valid Passport copy (front & back photo pages)
  * Educational degree / diploma certificates
  * Work experience letters or recent payslips (2+ years)
  * English scorecard (PTE/IELTS) if already taken (otherwise free weekly PTE coaching starts from day 1).
- If candidate sends a short greeting like "He'll", "hello", "hi", acknowledge it warmly and ask how you can specifically help them today without repeating long canned speeches.
- Never get stuck repeating the same message loop. Always advance the conversation helpfully!
`;

  // 3. Attempt Remote LLM Inference (Groq, Gemini, OpenAI) with 6s timeout
  if (apiKey) {
    try {
      // 3a. Groq Cloud (Primary Engine - Ultra-fast LPU inference)
      const groqKey = process.env.GROQ_API_KEY || (apiKey?.startsWith("gsk_") ? apiKey : undefined);
      if (groqKey) {
        const groqModels = [
          process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
          "openai/gpt-oss-120b",
          "openai/gpt-oss-20b",
        ];

        for (const model of groqModels) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${groqKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: rawMsg },
                ],
                max_tokens: 380,
                temperature: 0.35,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              const replyText = data.choices?.[0]?.message?.content;
              if (replyText && replyText.trim().length > 10) {
                return sanitizeFinalResponse(replyText.trim(), session);
              }
            }
          } catch {
            // Try next model or fallback
          }
        }
      }

      // 3b. Google Gemini
      const geminiKey = process.env.GEMINI_API_KEY || (apiKey?.startsWith("AIza") ? apiKey : undefined);
      if (geminiKey) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
          const res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `${SYSTEM_PROMPT}\n\nCandidate says: "${rawMsg}"\n\nProvide your WhatsApp reply as Aria (STRICTLY UNDER 95 WORDS, short, punchy, keeping ALL key figures and facts, suitable for mobile WhatsApp):`,
                    },
                  ],
                },
              ],
              generationConfig: {
                maxOutputTokens: 380,
                temperature: 0.35,
              },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (replyText && replyText.trim().length > 10) {
                return sanitizeFinalResponse(replyText.trim(), session);
              }
            }
        } catch {
          // Fallback to local expert
        }
      }

      // 3c. OpenAI GPT
      const openAiKey = process.env.OPENAI_API_KEY || (apiKey?.startsWith("sk-") ? apiKey : undefined);
      if (openAiKey) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: rawMsg },
              ],
              max_tokens: 380,
              temperature: 0.35,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const replyText = data.choices?.[0]?.message?.content;
            if (replyText && replyText.trim().length > 10) {
              return sanitizeFinalResponse(replyText.trim(), session);
            }
          }
        } catch {
          // Fallback to local expert
        }
      }
    } catch (err) {
      console.warn("[WhatsApp AI] Remote inference failed, running Local Human Visa Expert Engine:", err);
    }
  }

  // 4. Infallible Local Australian Visa Expert Cognitive Engine
  // Analyzes user message intent, situation, and queries dynamically like a human consultant.
  return sanitizeFinalResponse(generateHumanVisaExpertReply({ message: rawMsg, session, matchedOcc, insights }), session);
}

/**
 * Advanced Local Human Visa Expert Cognitive Engine
 * Produces deep, empathetic, and authoritative migration consultation responses.
 */
function generateHumanVisaExpertReply(params: {
  message: string;
  session: WhatsAppSession;
  matchedOcc?: { role: string; category: string } | null;
  insights?: CandidateMessageInsight;
}): string {
  const { message, session, matchedOcc, insights } = params;

  // --- STEP 1: Deep Intent Classifier ---
  // Strips down the message to core tokens to understand WHAT the candidate means,
  // regardless of tone, spelling, punctuation, or anger level.
  const rawLower = message.toLowerCase().trim();
  const words = rawLower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const wordSet = new Set(words);

  // Emotional/Tone flags (non-blocking — message still gets a RELEVANT response)
  const isFrustrated =
    wordSet.has("idiot") || wordSet.has("stupid") || wordSet.has("fool") ||
    wordSet.has("nonsense") || wordSet.has("rubbish") || wordSet.has("useless") ||
    wordSet.has("fake") || wordSet.has("scam") || wordSet.has("fraud") ||
    rawLower.includes("shut up") || rawLower.includes("get lost") ||
    rawLower.includes("bakwas") || rawLower.includes("pagal") ||
    rawLower.includes("chutiya") || rawLower.includes("bekar") ||
    wordSet.has("fuck") || wordSet.has("bitch") || wordSet.has("bastard") ||
    wordSet.has("liar") || wordSet.has("cheater") || wordSet.has("cheat");

  const isAngryOrSkeptical =
    isFrustrated ||
    rawLower.includes("are you real") || rawLower.includes("not real") ||
    rawLower.includes("i don't believe") || rawLower.includes("i dont believe") ||
    rawLower.includes("not trustworthy") || rawLower.includes("this is fake");

  // Extract what the user is ACTUALLY talking about (even if angry)
  const msgWithoutProfanity = rawLower
    .replace(/\b(idiot|stupid|fool|nonsense|rubbish|useless|fuck|bitch|bastard|bakwas|pagal|chutiya|bekar|liar|cheater|cheat|scam|fraud|fake|shut\s+up|get\s+lost)\b/g, "")
    .trim();

  const lowerForTopic = msgWithoutProfanity || rawLower;
  const lower = rawLower; // Keep original for full checks

  // --- STEP 2: Contextual intent detection on the cleaned message ---
  const wantsToChangePhone =
    (lowerForTopic.includes("change") && (lowerForTopic.includes("number") || lowerForTopic.includes("phone") || lowerForTopic.includes("mobile") || lowerForTopic.includes("contact") || lowerForTopic.includes("whatsapp"))) ||
    (lowerForTopic.includes("update") && (lowerForTopic.includes("number") || lowerForTopic.includes("phone") || lowerForTopic.includes("mobile") || lowerForTopic.includes("contact") || lowerForTopic.includes("whatsapp"))) ||
    (lowerForTopic.includes("new") && (lowerForTopic.includes("number") || lowerForTopic.includes("phone") || lowerForTopic.includes("mobile"))) ||
    (lowerForTopic.includes("different") && (lowerForTopic.includes("number") || lowerForTopic.includes("phone") || lowerForTopic.includes("mobile"))) ||
    (lowerForTopic.includes("wrong") && (lowerForTopic.includes("number") || lowerForTopic.includes("phone") || lowerForTopic.includes("mobile")));

  const isBarePhoneNumber =
    /^\+?[\d\s\-()]{8,18}$/.test(rawLower.trim()) &&
    rawLower.replace(/\D/g, "").length >= 8 &&
    rawLower.replace(/\D/g, "").length <= 15;

  const wantsToChangeEmail =
    (lowerForTopic.includes("change") && (lowerForTopic.includes("email") || lowerForTopic.includes("mail"))) ||
    (lowerForTopic.includes("update") && (lowerForTopic.includes("email") || lowerForTopic.includes("mail"))) ||
    (lowerForTopic.includes("wrong") && lowerForTopic.includes("email")) ||
    (lowerForTopic.includes("new") && lowerForTopic.includes("email")) ||
    (lowerForTopic.includes("correct") && lowerForTopic.includes("email"));

  const wantsToChangeName =
    (lowerForTopic.includes("change") && (lowerForTopic.includes("name") || lowerForTopic.includes("naam"))) ||
    (lowerForTopic.includes("update") && lowerForTopic.includes("name")) ||
    (lowerForTopic.includes("wrong") && lowerForTopic.includes("name")) ||
    (lowerForTopic.includes("my name is") || lowerForTopic.includes("mera naam")) ||
    (lowerForTopic.includes("correct") && lowerForTopic.includes("name"));

  const wantsToUpdateCv =
    (lowerForTopic.includes("send") || lowerForTopic.includes("share") || lowerForTopic.includes("attach") || lowerForTopic.includes("upload")) &&
    (lowerForTopic.includes("cv") || lowerForTopic.includes("resume") || lowerForTopic.includes("biodata"));

  const asksAboutProcess =
    lowerForTopic.includes("how does it work") || lowerForTopic.includes("process") ||
    lowerForTopic.includes("steps") || lowerForTopic.includes("procedure") ||
    lowerForTopic.includes("how long") || lowerForTopic.includes("timeline") ||
    lowerForTopic.includes("months") || lowerForTopic.includes("roadmap");

  const asksAboutCost =
    lowerForTopic.includes("cost") || lowerForTopic.includes("fee") ||
    lowerForTopic.includes("charges") || lowerForTopic.includes("price") ||
    lowerForTopic.includes("payment") || lowerForTopic.includes("how much") ||
    lowerForTopic.includes("kharcha") || lowerForTopic.includes("kitna lagega");

  const asksAboutSalary =
    lowerForTopic.includes("salary") || lowerForTopic.includes("earn") ||
    lowerForTopic.includes("income") || lowerForTopic.includes("wages") ||
    lowerForTopic.includes("pay") || lowerForTopic.includes("tsmit");

  const asksAboutFamily =
    lowerForTopic.includes("family") || lowerForTopic.includes("wife") ||
    lowerForTopic.includes("husband") || lowerForTopic.includes("spouse") ||
    lowerForTopic.includes("child") || lowerForTopic.includes("children") ||
    lowerForTopic.includes("kids") || lowerForTopic.includes("son") ||
    lowerForTopic.includes("daughter") || lowerForTopic.includes("partner");

  const asksAboutEnglish =
    lowerForTopic.includes("english") || lowerForTopic.includes("ielts") ||
    lowerForTopic.includes("pte") || lowerForTopic.includes("language") ||
    lowerForTopic.includes("band") || lowerForTopic.includes("score");

  const asksAboutJobs =
    lowerForTopic.includes("job") || lowerForTopic.includes("work") ||
    lowerForTopic.includes("occupation") || lowerForTopic.includes("profession") ||
    lowerForTopic.includes("career") || lowerForTopic.includes("vacancy") ||
    lowerForTopic.includes("vacancies") || lowerForTopic.includes("profile");

  const asksAboutDocuments =
    lowerForTopic.includes("document") || lowerForTopic.includes("paperwork") ||
    lowerForTopic.includes("passport") || lowerForTopic.includes("pcc") ||
    lowerForTopic.includes("police clearance") || lowerForTopic.includes("medical");

  const asksAboutPr =
    lowerForTopic.includes(" pr ") || lowerForTopic.includes("permanent") ||
    lowerForTopic.includes("citizenship") || lowerForTopic.includes("settle") ||
    (lowerForTopic.includes("186") || lowerForTopic.includes("subclass 186"));

  const asksAboutEligibility =
    lowerForTopic.includes("eligible") || lowerForTopic.includes("eligibility") ||
    lowerForTopic.includes("qualify") || lowerForTopic.includes("qualification") ||
    lowerForTopic.includes("can i apply") || lowerForTopic.includes("am i eligible") ||
    lowerForTopic.includes("kya main") || lowerForTopic.includes("kya hu");

  const asksIdentityOrBot =
    rawLower.includes("are you a bot") || rawLower.includes("are you bot") ||
    rawLower.includes("are you ai") || rawLower.includes("are you an ai") ||
    rawLower.includes("is this ai") || rawLower.includes("is this bot") ||
    rawLower.includes("am i talking to a bot") || rawLower.includes("am i talking to a robot") ||
    wordSet.has("robot") || rawLower.includes("artificial intelligence") ||
    rawLower.includes("who is this") || rawLower.includes("who are you") ||
    rawLower.includes("who am i talking to");

  const asksContactOrigin =
    rawLower.includes("how did you get my number") || rawLower.includes("who gave you my number") ||
    rawLower.includes("where did you get my number") || rawLower.includes("how do you know me") ||
    rawLower.includes("why are you messaging me") || rawLower.includes("i didn't apply") ||
    rawLower.includes("i never applied") || rawLower.includes("did i apply");

  const wantsOptOut =
    rawLower === "stop" || rawLower === "unsubscribe" ||
    rawLower.includes("don't message") || rawLower.includes("do not message") ||
    rawLower.includes("stop messaging") || rawLower.includes("stop sending") ||
    rawLower.includes("leave me alone") || rawLower.includes("remove my number") ||
    rawLower.includes("block") && rawLower.includes("number");

  // --- STEP 3: Core variables (must be before frustratedPrefix) ---
  const candidateName =
    session.name &&
    session.name !== "Candidate" &&
    !session.name.toLowerCase().includes("test") &&
    !session.name.includes("@") // never use email address as a name
      ? session.name
      : "";
  const nameSalutation = candidateName ? ` ${candidateName}` : "";

  const meetUrl = process.env.GOOGLE_MEET_LINK || "https://meet.google.com/hgu-yxat-nwy";
  const videoUrl =
    process.env.VIDEO_482_URL ||
    "https://tmsvisa.com/australia-work-visa-process/";

  // Build frustrated-but-contextual opener if message has anger + actual topic
  const frustratedPrefix = isFrustrated
    ? `I sincerely understand your frustration${candidateName ? `, ${candidateName}` : ""}, and I appreciate your honesty. Let me address this properly. 🙏\n\n`
    : "";

  // ============================================================
  // PRIORITY RESPONSE: Handle every possible topic FIRST,
  // even if the message contains anger/profanity alongside it.
  // Anger alone (with no other topic) is handled separately below.
  // ============================================================

  // 0. Phone number change request — CANNOT be changed via chat
  if (wantsToChangePhone || isBarePhoneNumber) {
    return (
      `${frustratedPrefix}🔒 Your registered phone number **cannot be changed** through this chat.\n\n` +
      `Records are permanently linked to +${session.phone}. To use a new number, message from it directly, or email **info@tmsvisa.com**.\n\n` +
      `Name, Email, CV, or Consultation Slot can still be updated here! 🇦🇺`
    );
  }

  // 0A. Email change request
  if (wantsToChangeEmail) {
    return (
      `${frustratedPrefix}Sure${nameSalutation}! Please reply with your **new email address** and we'll update your profile right away.\n\n` +
      `📧 Reply with: **yourname@example.com**`
    );
  }

  // 0B. Name change request
  if (wantsToChangeName) {
    return (
      `${frustratedPrefix}Sure${nameSalutation}! Please reply with your **correct full name** and we'll update your record instantly.\n\n` +
      `📝 Reply with: **Your Full Name**`
    );
  }

  // 0C. CV / Resume upload intent
  if (wantsToUpdateCv) {
    return (
      `${frustratedPrefix}Please send your CV/Resume here (PDF or Word) 📄 and our specialists will assess it against the 691 eligible Australian occupations right away! 🇦🇺`
    );
  }

  // 0D. Identity / Bot / Who are you?
  if (asksIdentityOrBot) {
    return (
      `${frustratedPrefix}Hi${nameSalutation}! 👋 I'm **Aria**, Senior Migration Counselor at **TMS Visa** 🇦🇺 — your official visa guidance desk.\n\n` +
      `I work with our Senior Migration Experts and Registered Migration Agents (MARN Holders) to assess candidates for Australian employer sponsorship. How can I help?`
    );
  }

  // 0E. How did you get my number / I never applied
  if (asksContactOrigin) {
    return (
      `${frustratedPrefix}Hi${nameSalutation}! Your profile was received via our international skilled migration portal or job network.\n\n` +
      `We work exclusively on the **Australia Employer Sponsored Work Visa** — min salary AUD $76,500/year, employer-covered fees, direct PR after 2 years.\n\n` +
      `Not interested? Reply **"Stop"** anytime. Have 2+ years experience? We'd love to do a free CV check! 🇦🇺`
    );
  }

  // 0F. Opt-out / Stop
  if (wantsOptOut) {
    return (
      `Understood${nameSalutation}. We have paused all outreach for your number. 🛑\n\n` +
      `If your plans change, feel free to message us anytime.\n\n` +
      `Wishing you all the very best!`
    );
  }

  // 0FF. Dynamically Learned Intelligence Response (High-Friction Candidate Doubts)
  // Uses psychologically calibrated empathy hooks, transparent figures, and stress-relieving facts
  if (insights && insights.curatedReply) {
    if (
      insights.primaryIntent === "scam_legitimacy_doubt" ||
      insights.primaryIntent === "upfront_fee_concern" ||
      insights.primaryIntent === "english_pte_fear" ||
      insights.primaryIntent === "job_sponsorship_guarantee" ||
      insights.primaryIntent === "family_spousal_rights" ||
      insights.primaryIntent === "salary_financial_benefits" ||
      insights.primaryIntent === "consultation_booking_hesitation"
    ) {
      return sanitizeStaffNames(`${frustratedPrefix}${insights.curatedReply}`);
    }
  }

  // 0G. Cost / Fees question (even if expressed with frustration)
  if (asksAboutCost) {
    return (
      `${frustratedPrefix}100% transparent fees${nameSalutation} — zero hidden costs: 🇦🇺\n\n` +
      `💼 **Employer Covers:** $330 permit + $6,000 embassy + $1,000 flight ticket\n\n` +
      `👤 **Candidate: AUD 1,000 total (2 milestones):**\n` +
      `1️⃣ **AUD 300** — On signing (CV makeover, Case Manager, free PTE coaching)\n` +
      `2️⃣ **AUD 700** — Only after visa approval & flight tickets in hand!\n\n` +
      `Free 1-on-1 weekend consultation available. Want to book?`
    );
  }

  // 0H. Salary question (even if expressed with frustration)
  if (asksAboutSalary) {
    return (
      `${frustratedPrefix}Australian salary protection${nameSalutation}: 💼🇦🇺\n\n` +
      `• **Min salary:** AUD $76,500/year (~₹42–46 Lakhs) + allowances\n` +
      `• **Super:** Employer adds 11.5% into your retirement fund\n` +
      `• **Tax-free:** First AUD $18,200/year is 0% tax\n` +
      `• **Savings:** ~AUD $1,500–$3,000/month after living costs\n\n` +
      `Want a free consultation to review your occupation's package?`
    );
  }

  // 0I. Process / Timeline / How it works
  if (asksAboutProcess) {
    return (
      `${frustratedPrefix}4–5 month Australia Work Visa process${nameSalutation}: 🇦🇺⏱️\n\n` +
      `1️⃣ **CV Review:** Free check across 691 eligible roles\n` +
      `2️⃣ **Onboarding (AUD 300):** Case Manager, CV makeover & free PTE classes\n` +
      `3️⃣ **Employer Match:** Interview with approved sponsor & job offer\n` +
      `4️⃣ **Docs & Visa:** Only 3 docs (Passport, Medical, PCC) + PTE (after offer). MARN Agent lodges visa\n` +
      `5️⃣ **Travel & Balance (AUD 700):** Pay remaining AUD 700 only after visa grant & flight tickets in hand!\n\n` +
      `💼 Employer covers: $330 permit + $6,000 embassy + $1,000 flight\n` +
      `💰 Min salary: AUD $76,500/yr + super | Direct PR in 2 yrs\n\n` +
      `Ready to book your free consultation?`
    );
  }

  // 0J. Family / Spouse / Children
  if (asksAboutFamily) {
    return (
      `${frustratedPrefix}Yes! Your whole family comes with you${nameSalutation}! 👨‍👩‍👧‍👦🇦🇺\n\n` +
      `• **Spouse:** Full unrestricted work rights from Day 1\n` +
      `• **Children:** Free public schooling & healthcare\n` +
      `• **PR:** After 2 years, entire family gets Subclass 186 PR together\n\n` +
      `Want to discuss your family roadmap in our free weekend consultation?`
    );
  }

  // 0K. English / IELTS / PTE
  if (asksAboutEnglish) {
    return (
      `${frustratedPrefix}No English test needed to start${nameSalutation}! 📚🇦🇺\n\n` +
      `• Exam taken **only after your job offer** — TMS gives free weekly PTE coaching from Day 1\n` +
      `• **PTE:** L:33, R:36, W:29, S:24 | **IELTS:** 5.0 per band\n` +
      `• Exempt if 5+ years schooling was in English\n\n` +
      `Have you taken any English test before?`
    );
  }

  // 0L. Jobs / Occupations / Vacancies
  if (asksAboutJobs) {
    return (
      `${frustratedPrefix}**691 eligible occupations** — min AUD $76,500/year${nameSalutation}: 🇦🇺📋\n\n` +
      `• **Trades:** Mechanics, Electricians, Welders, Chefs, Plumbers, HVAC\n` +
      `• **Engineering:** Civil, Mech, Electrical, Mining Engineers\n` +
      `• **IT:** Developers, Cloud/Cyber/Network Engineers\n` +
      `• **Healthcare:** Nurses, Physios, Medical Technologists\n\n` +
      `What's your occupation & years of experience? I'll check your ANZSCO code now!`
    );
  }

  // 0M. Documents
  if (asksAboutDocuments) {
    return (
      `${frustratedPrefix}Only **3 documents** needed from you${nameSalutation}: 📄🇦🇺\n\n` +
      `1️⃣ Passport copy  2️⃣ Medical Fitness Certificate  3️⃣ Police Clearance (PCC)\n\n` +
      `TMS + employer handle all filings, nomination, labour market testing & visa lodgement!`
    );
  }

  // 0N. Eligibility question
  if (asksAboutEligibility) {
    return (
      `${frustratedPrefix}Core eligibility criteria${nameSalutation}: 🇦🇺✅\n\n` +
      `• **Occupation:** On the 691 ANZSCO eligible list\n` +
      `• **Experience:** 2+ years full-time verifiable\n` +
      `• **Age:** Under 45 (exceptions for specialist roles)\n` +
      `• **English:** PTE/IELTS after job offer; free TMS coaching from Day 1\n` +
      `• **Qualification:** Degree, diploma, ITI or trade cert (role-dependent)\n\n` +
      `Tell me your job title & years of experience — I'll give you an instant verdict!`
    );
  }

  // 0O. Permanent Residency
  if (asksAboutPr) {
    return (
      `${frustratedPrefix}Direct PR pathway${nameSalutation}! 🇦🇺\n\n` +
      `• **2 years** with sponsor → Subclass 186 PR (no points test, no lottery)\n` +
      `• **PR benefits:** Medicare, free education, social security, live anywhere\n` +
      `• **Citizenship:** After 12 months of PR → Australian passport\n\n` +
      `Want to discuss your PR roadmap in our free weekend consultation?`
    );
  }

  // ============================================================
  // ANGER / FRUSTRATION ALONE (no other actionable topic found)
  // ============================================================
  if (isFrustrated || isAngryOrSkeptical) {
    return (
      `I understand your frustration${nameSalutation} — migration fraud is real and your skepticism is valid. 🤝\n\n` +
      `TMS Visa operates under strict legal compliance:\n` +
      `• 🇦🇺 Orange, NSW 2800 | ABN: 75 148 213 076\n` +
      `• 🇮🇳 Delhi NCR | Groworld Vijatour Pvt Ltd (CIN: U62099HR2024PTC122827)\n` +
      `• Visa lodged by licensed **MARN Registered Migration Agents**\n` +
      `• **Milestone safety:** AUD 300 to start; AUD 700 only after visa + flight tickets in hand\n\n` +
      `What would you like to verify?`
    );
  }

  // ============================================================
  // GREETINGS & DIRECT SALUTATIONS ("Sir", "Mam", "Namaste", "Hello", "Bhai", etc.)
  // ============================================================
  const isDirectSalutation =
    rawLower === "sir" ||
    rawLower === "mam" ||
    rawLower === "madam" ||
    rawLower === "namaste" ||
    rawLower === "bhai" ||
    rawLower === "hello" ||
    rawLower === "hlo" ||
    rawLower === "hi" ||
    rawLower === "hey" ||
    rawLower === "good morning" ||
    rawLower === "good afternoon" ||
    rawLower === "good evening";

  if (isDirectSalutation) {
    return (
      `Namaste${nameSalutation}! 🙏 I am Aria, Senior Registered Migration Counselor at **TMS Visa** Australia.\n\n` +
      `How can I assist you with your Australia Employer Sponsored Work Visa (AUD $76,500+ min salary) or migration queries today? Feel free to ask any question!`
    );
  }

  // ============================================================
  // STATUS / PROGRESS / "VISA KA KYA RHA" / "KYA HUA" / UPDATES
  // ============================================================
  const asksAboutStatus =
    lower.includes("kya rha") ||
    lower.includes("kya hua") ||
    lower.includes("kya ho rha") ||
    lower.includes("kya chal rha") ||
    lower.includes("status") ||
    lower.includes("update") ||
    lower.includes("progress") ||
    lower.includes("mera visa") ||
    lower.includes("meri file") ||
    lower.includes("kab tak") ||
    lower.includes("kab hoga") ||
    lower.includes("kaha tak") ||
    lower.includes("kuch pata chala") ||
    lower.includes("any news") ||
    lower.includes("what happened") ||
    (lower.includes("visa") && (lower.includes("kya") || lower.includes("kab") || lower.includes("how") || lower.includes("where")));

  if (asksAboutStatus) {
    if (session.meetingCompleted) {
      return (
        `Hi${nameSalutation}! 🇦🇺 Aapki 1-on-1 consultation complete ho chuki hai aur aapki profile onboarding/documentation review phase mein hai.\n\n` +
        `Hamari team aapke CV ko verified Australian employers ke saath match kar rahi hai. Jaise hi matching update aayegi, hum aapse direct connect karenge!`
      );
    }
    if (session.bookedSlot) {
      return (
        `Hi${nameSalutation}! 🇦🇺 Aapka consultation meeting confirm hai:\n` +
        `📅 **Date:** ${session.bookedSlot.date}\n` +
        `⏰ **Time:** ${session.bookedSlot.candidateTimeLabel}\n\n` +
        `Is meeting mein hamare senior visa expert aapke CV, ANZSCO job eligibility aur visa roadmap ko live discuss karenge.`
      );
    }
    if (session.email) {
      return (
        `Hi${nameSalutation}! 🇦🇺 Aapka profile hamare system mein registered hai (${session.email}).\n\n` +
        `Aapke Australia Employer Sponsored Work Visa file ka agla step hai **1-on-1 expert consultation meeting**. Kya aap weekend par free session schedule karna chahenge?`
      );
    }
    return (
      `Hi${nameSalutation}! 🇦🇺 Hum Australia Employer Sponsored Work Visa (min salary AUD $76,500/yr) par kaam karte hain.\n\n` +
      `Aapke specific visa file aur status ko check karne ke liye, kripya apna **registered Email ID** ya **CV/Resume** yahan share karein, taaki hum aapka record live check kar sakein!`
    );
  }


  // 1. Inquiries about explainer video
  if (
    lower.includes("video link") ||
    lower.includes("video url") ||
    lower.includes("watch video") ||
    lower.includes("send video") ||
    lower.includes("explainer video") ||
    lower.includes("process video") ||
    (lower.includes("link") && lower.includes("video"))
  ) {
    return (
      `Here is our complete Australia Employer Sponsored Work Visa explainer video! 🎥🇦🇺\n\n` +
      `▶️ **Watch the Video:**\n${videoUrl}\n\n` +
      `It covers employer sponsorship, 691 eligible jobs, AUD $76,500+ salary, and PR pathways.\n\n` +
      `*(Tap above to watch anytime)*`
    );
  }

  // 2. Inquiries about meeting link / room access / "send me the link"
  if (
    lower.includes("meeting link") ||
    lower.includes("meet link") ||
    lower.includes("google meet") ||
    lower.includes("room link") ||
    lower.includes("where to join") ||
    lower.includes("how to join") ||
    lower.includes("give me link") ||
    lower.includes("send link") ||
    lower.includes("send me the link") ||
    lower.includes("share the link") ||
    (lower.includes("link") && (lower.includes("meeting") || lower.includes("consultation") || lower.includes("call") || lower.includes("send") || lower.includes("give") || lower.includes("share")))
  ) {
    const isBooked = Boolean(
      session.bookedSlot ||
      session.currentStep === "BOOKED" ||
      session.meetingStatus === "booked" ||
      session.meetingStatus === "rescheduled"
    );
    if (isBooked) {
      const timeStr = session.bookedSlot?.candidateTimeLabel || session.bookedSlot?.istTimeLabel || "";
      const dateStr = session.bookedSlot?.date ? `for **${session.bookedSlot.date}**${timeStr ? ` at **${timeStr}**` : ""}` : "for your scheduled time";
      return (
        `Hi${nameSalutation}! 👋\n\n` +
        `Your 1-on-1 consultation with our senior migration expert is confirmed ${dateStr}.\n\n` +
        `🔗 **Google Meet Room Link:**\n${meetUrl}\n\n` +
        `*(Tap the link above at your scheduled time to join. Please have your CV ready!)* 🇦🇺`
      );
    }
    return (
      `Hello${nameSalutation}! 👋\n\n` +
      `Our 1-on-1 consultations with our senior visa expert are held live on Google Meet.\n\n` +
      `The official Google Meet room link is issued once your consultation slot is officially booked.\n\n` +
      `Would you like to select an available weekend date and time slot to book your session?`
    );
  }

  // 3. Candidate requests a phone call / "Call me now" / asks why Google Meet instead of direct phone
  if (
    lower.includes("call me") ||
    lower.includes("phone call") ||
    lower.includes("voice call") ||
    lower.includes("call now") ||
    lower.includes("why meet") ||
    lower.includes("why google meet") ||
    lower.includes("talk on phone") ||
    lower.includes("can you call") ||
    lower.includes("call on my number")
  ) {
    return (
      `Hi${nameSalutation}! Our consultations run **1-on-1 on Google Meet** 📞🇦🇺 because the expert screen-shares your CV, checks ANZSCO codes, and walks you through the full roadmap live.\n\n` +
      `Weekend slots (Sat/Sun) available in your local time. Want to book?`
    );
  }

  // 4. Age Criteria / Age Limit Questions
  if (
    lower.includes("age limit") ||
    lower.includes("what is the age") ||
    lower.includes("how old") ||
    lower.includes("years old") ||
    lower.includes("maximum age") ||
    lower.includes("minimum age") ||
    lower.includes("age restriction") ||
    lower.includes("my age is") ||
    lower.includes("i am 4") ||
    lower.includes("i am 3") ||
    lower.includes("i am 5") ||
    lower.includes("age 4") ||
    lower.includes("age 5")
  ) {
    return (
      `Age criteria${nameSalutation}: 🇦🇺\n\n` +
      `• **Under 45:** Fully eligible for employer sponsorship & Subclass 186 PR\n` +
      `• **45–50:** Possible exemptions for specialist/regional/high-income roles\n` +
      `• **Minimum:** 18+ years with 2+ years experience\n\n` +
      `Want to review your CV in a free weekend consultation?`
    );
  }

  // 5. Qualifications / Degree / 10th / 12th / Diploma / ITI eligibility
  if (
    lower.includes("degree") ||
    lower.includes("qualification") ||
    lower.includes("diploma") ||
    lower.includes("iti") ||
    lower.includes("10th") ||
    lower.includes("12th") ||
    lower.includes("no degree") ||
    lower.includes("don't have degree") ||
    lower.includes("distance education") ||
    lower.includes("bachelor") ||
    lower.includes("master")
  ) {
    return (
      `A 4-year degree is **NOT always required**${nameSalutation}! 🇦🇺\n\n` +
      `• **Trades** (Chefs, Mechanics, Electricians, Welders): Diploma/ITI + 3+ years experience qualifies via RPL\n` +
      `• **Professional** (Engineers, IT, Finance, Healthcare): Bachelor's/Master's + 2+ years\n\n` +
      `Tell me your job title & years of experience — I'll check your ANZSCO code!`
    );
  }

  // 6. Work Experience / Cash Salary / Gaps / Payslips
  if (
    lower.includes("experience") ||
    lower.includes("cash salary") ||
    lower.includes("bank statement") ||
    lower.includes("payslip") ||
    lower.includes("pay slip") ||
    lower.includes("career gap") ||
    lower.includes("gap in") ||
    lower.includes("how many years")
  ) {
    return (
      `Work experience requirements${nameSalutation}: 💼🇦🇺\n\n` +
      `• **Minimum:** 2 years full-time verifiable experience\n` +
      `• **Proofs accepted:** Service letters, bank salary credits, payslips, ITR/Form 16, contracts\n` +
      `• **Gaps:** Brief gaps are fine as long as total is 2+ cumulative years\n\n` +
      `How many total years do you have in your field?`
    );
  }

  // 7. Salary, Earnings, TSMIT, Savings, Taxes in Australia
  if (
    lower.includes("salary") ||
    lower.includes("how much salary") ||
    lower.includes("earn") ||
    lower.includes("savings") ||
    lower.includes("minimum pay") ||
    lower.includes("tsmit") ||
    lower.includes("76500") ||
    lower.includes("tax") ||
    lower.includes("superannuation") ||
    lower.includes("pension")
  ) {
    return (
      `Australian salary (legally protected)${nameSalutation}: 💼🇦🇺\n\n` +
      `• **Min (TSMIT):** AUD $76,500/yr (~$6,375/month) + allowances\n` +
      `• **Superannuation:** +11.5% retirement fund from employer\n` +
      `• **Tax-free:** First $18,200/yr @ 0%\n` +
      `• **Savings:** ~AUD $1,500–$3,000/month after living costs\n\n` +
      `Want a free consultation to review your occupation's package?`
    );
  }

  // 8. Cost, Fees, Transparency & Two-Stage Milestones
  if (
    lower.includes("cost") ||
    lower.includes("fee") ||
    lower.includes("charges") ||
    lower.includes("price") ||
    lower.includes("payment") ||
    lower.includes("how much do i pay") ||
    lower.includes("why 300") ||
    lower.includes("hidden cost") ||
    lower.includes("installment")
  ) {
    return (
      `100% transparent — zero hidden costs: 🇦🇺\n\n` +
      `💼 **Employer covers:** $330 permit + $6,000 embassy fees + $1,000 flight\n\n` +
      `👤 **Candidate: AUD 1,000 total (2 milestones)**\n` +
      `1️⃣ **AUD 300** — On signing (CV makeover, Case Manager, free PTE coaching)\n` +
      `2️⃣ **AUD 700** — Only after visa approval & flight tickets in hand!\n\n` +
      `Free weekend consultation available. Want to book?`
    );
  }

  // 9. English Language (IELTS, PTE, CELPIP, Free Classes)
  if (
    lower.includes("ielts") ||
    lower.includes("pte") ||
    lower.includes("english") ||
    lower.includes("language") ||
    lower.includes("score") ||
    lower.includes("band") ||
    lower.includes("classes") ||
    lower.includes("celpip") ||
    lower.includes("weak english") ||
    lower.includes("no english")
  ) {
    return (
      `No English test needed to begin! 📚🇦🇺\n\n` +
      `• Exam taken **only after job offer** — TMS provides free weekly PTE coaching from Day 1\n` +
      `• **PTE:** L:33, R:36, W:29, S:24 | **IELTS:** 5.0 per band\n` +
      `• Exempt if 5+ years schooling was in English\n\n` +
      `Have you taken any English test before?`
    );
  }

  // 10. Family, Spouse Work Rights, Children Schooling
  if (
    lower.includes("family") ||
    lower.includes("wife") ||
    lower.includes("husband") ||
    lower.includes("spouse") ||
    lower.includes("child") ||
    lower.includes("children") ||
    lower.includes("kids") ||
    lower.includes("daughter") ||
    lower.includes("son") ||
    lower.includes("partner")
  ) {
    return (
      `Yes! Your entire family comes with you! 👨‍👩‍👧‍👦🇦🇺\n\n` +
      `• **Spouse:** Full unrestricted work rights from Day 1\n` +
      `• **Children:** Public schooling & healthcare access\n` +
      `• **PR:** Whole family gets Subclass 186 PR together after 2 years\n\n` +
      `Want to discuss your family roadmap in our free weekend consultation?`
    );
  }

  // 11. Parents / Relatives
  if (
    lower.includes("parent") ||
    lower.includes("mother") ||
    lower.includes("father") ||
    lower.includes("mom") ||
    lower.includes("dad") ||
    lower.includes("brother") ||
    lower.includes("sister")
  ) {
    return (
      `Parents & extended family: 🇦🇺\n\n` +
      `• **During work visa:** Parents can visit on Subclass 600 Visitor Visa (up to 12 months)\n` +
      `• **After PR (2 years):** You can sponsor parents for permanent parent visas\n\n` +
      `Spouse & dependent children travel with you from Day 1.`
    );
  }

  // 12. Permanent Residency (PR Subclass 186) & Citizenship
  if (
    lower.includes("pr") ||
    lower.includes("permanent") ||
    lower.includes("186") ||
    lower.includes("citizenship") ||
    lower.includes("settle") ||
    lower.includes("passport") && lower.includes("australia")
  ) {
    return (
      `Direct PR pathway! 🇦🇺\n\n` +
      `• **2 years** with sponsor → Subclass 186 Permanent Residency\n` +
      `• **Benefits:** Medicare, free education, social security, live anywhere\n` +
      `• **Citizenship:** 12 months after PR → Australian passport\n\n` +
      `Want to review your pathway with our Migration Expert this weekend?`
    );
  }

  // 13. Accommodation & Relocation Support
  if (
    lower.includes("accommodation") ||
    lower.includes("stay") ||
    lower.includes("housing") ||
    lower.includes("where will i live") ||
    lower.includes("hotel") ||
    lower.includes("room") ||
    lower.includes("flat")
  ) {
    return (
      `Relocation support${nameSalutation}: ✈️🇦🇺\n\n` +
      `• **Flight:** Employer covers ~AUD $1,000 flight ticket\n` +
      `• **Accommodation:** Most employers provide 2–4 weeks initial housing/airport pickup\n` +
      `• **Settling in:** TMS Case Manager gives pre-departure briefings & rental guidance\n\n` +
      `You're supported every step of the way!`
    );
  }

  // 14. What if employer fires me / Job security / Employer change in Australia
  if (
    lower.includes("fire") ||
    lower.includes("fired") ||
    lower.includes("lose job") ||
    lower.includes("change job") ||
    lower.includes("change employer") ||
    lower.includes("company closes") ||
    lower.includes("bonded")
  ) {
    return (
      `You're fully protected under Australian Fair Work Ombudsman law: 🇦🇺\n\n` +
      `• **Grace period:** 60–180 days to transfer sponsorship if you change employers\n` +
      `• **TMS support:** We assist with sponsor transfers during your agreement period\n` +
      `• **No bondage:** Australian law prohibits any exploitative employer practices`
    );
  }

  // 15. Legitimacy, Trust, Scam & Fraud concerns, Registered Office
  if (
    lower.includes("fake") ||
    lower.includes("scam") ||
    lower.includes("fraud") ||
    lower.includes("real or") ||
    lower.includes("trust") ||
    lower.includes("genuine") ||
    lower.includes("office") ||
    lower.includes("address") ||
    lower.includes("license") ||
    lower.includes("abn") ||
    lower.includes("cin")
  ) {
    return (
      `TMS Visa is a registered consultancy${nameSalutation}: 🏛️🇦🇺\n\n` +
      `🇦🇺 **Australia:** 154 Peisley Street, Orange, NSW 2800 | ABN: 75 148 213 076\n` +
      `🇮🇳 **India:** Groworld Vijatour Pvt Ltd, Delhi NCR | CIN: U62099HR2024PTC122827\n\n` +
      `• Visa lodged by licensed **MARN Registered Migration Agents**\n` +
      `• AUD 300 to start; AUD 700 only after visa approval & flight tickets in hand\n\n` +
      `Want a face-to-face Google Meet consultation this weekend?`
    );
  }

  // 16. Rejection Guarantee & Risk
  if (
    lower.includes("reject") ||
    lower.includes("rejection") ||
    lower.includes("refusal") ||
    lower.includes("guarantee") ||
    lower.includes("success rate") ||
    lower.includes("what if visa not approved")
  ) {
    return (
      `TMS work visas have a **zero rejection track record**! 🛡️🇦🇺\n\n` +
      `• Direct pre-vetted employer sponsorship — no blind applications\n` +
      `• Full lodgement by a licensed **MARN Migration Agent** (100% compliant)\n` +
      `• AUD 700 balance payable **only after** visa approval & flight in hand`
    );
  }

  // 17. Documents Needed (Passport, Medical, PCC)
  if (
    lower.includes("document") ||
    lower.includes("paperwork") ||
    lower.includes("pcc") ||
    lower.includes("police clearance") ||
    lower.includes("medical")
  ) {
    return (
      `Only **3 documents** from you: 📄🇦🇺\n\n` +
      `1️⃣ Passport copy  2️⃣ Medical Fitness Certificate  3️⃣ Police Clearance (PCC)\n\n` +
      `TMS + your employer handle all filings, sponsorship, labour market testing & visa lodgement!`
    );
  }

  // 18. Process, Steps, Timeline & How it works
  if (
    lower.includes("process") ||
    lower.includes("timeline") ||
    lower.includes("how long") ||
    lower.includes("steps") ||
    lower.includes("how it works") ||
    lower.includes("duration") ||
    lower.includes("months") ||
    lower.includes("roadmap")
  ) {
    return (
      `**4–5 months** from CV to visa approval: ⏱️🇦🇺\n\n` +
      `1️⃣ Free CV review (691 occupations)\n` +
      `2️⃣ Agreement + Case Manager — AUD 300 (CV makeover + free PTE coaching)\n` +
      `3️⃣ Employer marketing — TMS finds your sponsor\n` +
      `4️⃣ English exam (after offer) + Passport, Medical, PCC\n` +
      `5️⃣ Nomination + Visa lodged by MARN Agent\n` +
      `6️⃣ Visa grant + flight — pay AUD 700 only then!\n\n` +
      `Free 1-on-1 consultation available — want to schedule?`
    );
  }

  // 19. Applying from GCC / Middle East / Other Countries (Dubai, Saudi, Qatar, Nepal, etc.)
  if (
    lower.includes("dubai") ||
    lower.includes("uae") ||
    lower.includes("saudi") ||
    lower.includes("qatar") ||
    lower.includes("kuwait") ||
    lower.includes("oman") ||
    lower.includes("bahrain") ||
    lower.includes("nepal") ||
    lower.includes("sri lanka") ||
    lower.includes("philippines") ||
    lower.includes("pakistan") ||
    lower.includes("gulf") ||
    lower.includes("from my country") ||
    lower.includes("current country")
  ) {
    return (
      `Yes! You can apply from anywhere in the world! 🌏🇦🇺\n\n` +
      `UAE, Saudi, Qatar, India, Nepal, Sri Lanka — interviews are virtual, and medicals done at your local Australian Embassy-approved VFS center. You fly to Australia on approval!\n\n` +
      `What's your occupation and current location?`
    );
  }

  // 20. Non-Work Visas / Other Countries (Canada, UK, USA, Tourist, Student)
  if (
    lower.includes("canada") ||
    lower.includes("uk") ||
    lower.includes("united kingdom") ||
    lower.includes("usa") ||
    lower.includes("america") ||
    lower.includes("europe") ||
    lower.includes("tourist") ||
    lower.includes("visitor") ||
    lower.includes("student visa") ||
    lower.includes("study visa")
  ) {
    return (
      `TMS Visa specializes **exclusively in Australia Employer Sponsored Work Visas** 🇦🇺 — not tourist, student, or other country visas.\n\n` +
      `Australia offers: AUD $76,500/year min salary, employer-covered $6,000 embassy fees & flight, full family rights, and direct PR.\n\n` +
      `Have 2+ years experience? We'd love to assess your CV!`
    );
  }

  // 21. Hindi / Hinglish queries
  if (
    lower.includes("hindi") ||
    lower.includes("kitna kharcha") ||
    lower.includes("jana chahta") ||
    lower.includes("kya process") ||
    lower.includes("kaise hoga") ||
    lower.includes("madad") ||
    lower.includes("batao")
  ) {
    return (
      `Namaste${nameSalutation}! 🇦🇺 Australia Employer Sponsored Work Visa mein Australian company aapko sponsor karti hai:\n\n` +
      `• **Salary:** AUD $76,500/year (~₹42–45 Lakhs)\n` +
      `• **Employer:** $6,000 embassy + $330 permit + flight ticket cover karta hai\n` +
      `• **Aapka fee:** AUD 300 shuru mein + AUD 700 sirf visa aur ticket ke baad\n` +
      `• **Family:** Wife ko work rights, bachon ki free padhai\n` +
      `• **PR:** 2 saal baad permanent residency\n\n` +
      `Aapka profession aur experience kitna hai?`
    );
  }

  // 22A. Inquiries about Available Jobs, 691 Eligible Occupations, Vacancies
  if (
    lower.includes("job list") ||
    lower.includes("list of job") ||
    lower.includes("what job") ||
    lower.includes("which job") ||
    lower.includes("types of job") ||
    lower.includes("vacancies") ||
    lower.includes("vacancy") ||
    lower.includes("691 job") ||
    lower.includes("eligible job") ||
    lower.includes("demand in australia") ||
    lower.includes("available job") ||
    lower.includes("which profile") ||
    lower.includes("profiles available")
  ) {
    return (
      `**691 eligible occupations** — min AUD $76,500/year (~₹42–45 Lakhs): 🇦🇺📋\n\n` +
      `• **Trades:** Mechanics, Electricians, Welders, Chefs, Plumbers, HVAC\n` +
      `• **Engineering:** Civil, Mech, Electrical, Mining, Structural Engineers\n` +
      `• **IT:** Developers, Cloud, Cyber Security, Network Engineers\n` +
      `• **Healthcare:** Nurses, Physiotherapists, Medical Technologists\n` +
      `• **Hospitality:** Hotel/Restaurant Managers, Food Technologists\n\n` +
      `Employer covers $6,000 embassy + $330 permit + flight. What's your profession & experience?`
    );
  }

  // 22B. Freshers / No Experience / Entry Level
  if (
    lower.includes("fresher") ||
    lower.includes("no experience") ||
    lower.includes("0 experience") ||
    lower.includes("without experience") ||
    lower.includes("can freshers apply") ||
    lower.includes("zero experience") ||
    lower.includes("entry level") ||
    lower.includes("0 years")
  ) {
    return (
      `Experience requirements${nameSalutation}: 💼🇦🇺\n\n` +
      `Australian employer sponsorship requires **minimum 2 years full-time verifiable experience**.\n\n` +
      `• Less than 2 years? Build up to it with payslips/service letters in your field\n` +
      `• Recent graduate? Student/graduate visa pathways may apply\n\n` +
      `How many months/years of experience do you currently have?`
    );
  }

  // 22C. No Passport / Expired Passport
  if (
    lower.includes("no passport") ||
    lower.includes("don't have passport") ||
    lower.includes("without passport") ||
    lower.includes("lost passport") ||
    lower.includes("passport expired") ||
    lower.includes("haven't made passport") ||
    lower.includes("not have passport") ||
    lower.includes("no have passport")
  ) {
    return (
      `No passport needed to get started! 🛂🇦🇺\n\n` +
      `• We start CV evaluation, makeover & free PTE coaching immediately\n` +
      `• Passport only needed when employer lodges formal nomination (4–5 months in)\n\n` +
      `Apply for a new/Tatkal passport in parallel while we work on your profile!`
    );
  }

  // 22D. Weak English / Low Test Score / PTE Coaching
  if (
    lower.includes("failed ielts") ||
    lower.includes("failed pte") ||
    lower.includes("low score") ||
    lower.includes("poor english") ||
    lower.includes("can't speak english") ||
    lower.includes("cannot speak english") ||
    lower.includes("english is weak") ||
    lower.includes("weak english") ||
    lower.includes("fail english") ||
    lower.includes("score low")
  ) {
    return (
      `Don't worry about English! 📚🇦🇺\n\n` +
      `• No exam needed to start — take it only after your job offer\n` +
      `• TMS provides free weekly PTE coaching from Day 1\n` +
      `• **PTE:** L:33, R:36, W:29, S:24 | **IELTS:** 5.0 per band (most pass in 2–3 weeks with TMS coaching!)\n\n` +
      `Our trainers provide proven templates, shortcuts & mock tests for a first-attempt pass!`
    );
  }

  // 22E. Direct PR (189/190) vs Employer Sponsored Work Visa
  if (
    lower.includes("direct pr") ||
    lower.includes("why not pr") ||
    lower.includes("can i get direct pr") ||
    lower.includes("why work visa") ||
    lower.includes("pr points") ||
    lower.includes("points system") ||
    lower.includes("subclass 189") ||
    lower.includes("subclass 190")
  ) {
    return (
      `Direct PR (189/190) vs Employer Sponsored: 🇦🇺🎯\n\n` +
      `• **189/190 PR:** Requires 85–95+ points, IELTS 8+, 1–3 year wait with no guarantee\n` +
      `• **Employer Sponsored:** No points test, no lottery — hired by pre-vetted employer, AUD $76,500/year guaranteed\n` +
      `• **PR after 2 years:** Subclass 186 PR for you & family — fastest, most secure route!`
    );
  }

  const isCrmLead =
    Boolean(session.existingLeadNotified) ||
    Boolean(session.leadId) ||
    Boolean(session.bookedSlot) ||
    (session.crmStatus &&
      ["meeting-scheduled", "follow-up", "sales", "payment-pending", "document-pending", "call-back"].includes(
        session.crmStatus.toLowerCase().trim()
      )) ||
    session.meetingCompleted === true ||
    session.meetingStatus === "completed" ||
    session.currentStep === "MEETING_COMPLETED";

  // 22F. What is TMS / About Company
  if (
    lower.includes("what is tms") ||
    lower.includes("what is the migration school") ||
    lower.includes("about your company") ||
    lower.includes("about tms") ||
    lower.includes("company profile") ||
    lower.includes("who is the migration school")
  ) {
    return (
      `**The Migration School (TMS Visa)** — Australian Employer Sponsored Work Visa specialists: 🏛️🇦🇺\n\n` +
      `• 🇦🇺 154 Peisley St, Orange NSW 2800 | ABN: 75 148 213 076\n` +
      `• 🇮🇳 Delhi NCR | Groworld Vijatour Pvt Ltd (CIN: U62099HR2024PTC122827)\n` +
      `• All visas lodged by licensed **MARN Migration Agents**\n` +
      `• Zero rejection track record\n` +
      `• AUD 300 to start; AUD 700 only after visa + flight in hand\n\n` +
      (isCrmLead
        ? `Feel free to ask any questions about our credentials or your Australian migration file right here!`
        : `Free Google Meet consultation this weekend?`)
    );
  }

  // 22G. Affirmations & Continuations ("ok", "yes", "sure", "tell me", "proceed", "what next")
  if (
    lower === "ok" ||
    lower === "okay" ||
    lower === "yes" ||
    lower === "yeah" ||
    lower === "sure" ||
    lower === "tell me" ||
    lower === "tell me more" ||
    lower === "more info" ||
    lower === "what next" ||
    lower === "proceed" ||
    lower === "go ahead" ||
    lower === "how to proceed"
  ) {
    if (isCrmLead) {
      return (
        `Great${nameSalutation}! Your file is currently active with our migration team (${session.crmStatus || "in progress"}). 🇦🇺\n\n` +
        `How can our counseling desk assist you today? Feel free to ask any question about your file, employer matching, or documents!`
      );
    }
    return (
      `Great${nameSalutation}! Here's how to proceed: 🇦🇺🚀\n\n` +
      `1️⃣ Share your **occupation & years of experience** — I'll check your ANZSCO code\n` +
      `2️⃣ **Send your CV** (PDF or Word) here in WhatsApp\n` +
      `3️⃣ **Book a free weekend consultation** on Google Meet for your custom 4–5 month roadmap\n\n` +
      `What's your current job title and experience?`
    );
  }

  // 22. If candidate mentioned an eligible occupation from the official 691 list
  if (matchedOcc) {
    return (
      `Great news${nameSalutation}! 🎉 **${matchedOcc.role}** is **CONFIRMED ELIGIBLE** under *${matchedOcc.category}* on the official 691 list!\n\n` +
      `• Min salary: **AUD $76,500/year** + super\n` +
      `• Employer covers $6,000 embassy + $330 permit + flight\n` +
      `• Direct PR (Subclass 186) after 2 years\n\n` +
      (isCrmLead
        ? `Our team is reviewing your profile. Feel free to ask any questions about your file right here!`
        : `Want to book a free weekend consultation to review your CV?`)
    );
  }

  // 23. Check general FAQ fallback keywords
  for (const faq of FAQ_FALLBACKS) {
    if (faq.keywords.some((k) => lower.includes(k))) {
      return faq.answer;
    }
  }

  // 23b. If candidate asks what more they can send or which documents to provide
  const isAskingWhatToSend =
    lower.includes("send more") ||
    lower.includes("what more") ||
    lower.includes("what can i send") ||
    lower.includes("what else can i send") ||
    lower.includes("what documents") ||
    lower.includes("which documents") ||
    lower.includes("doc list") ||
    lower.includes("documents needed") ||
    lower.includes("what to send");

  if (isAskingWhatToSend) {
    return (
      `Hi${nameSalutation}! Here are the essential documents you can share with our review team: 🇦🇺📄\n\n` +
      `1️⃣ **Updated CV / Resume** (Word or PDF format)\n` +
      `2️⃣ **Valid Passport Copy** (Photo & address pages)\n` +
      `3️⃣ **Work Experience Proof** (Relieving letters, reference letters, or recent payslips)\n` +
      `4️⃣ **Educational Certificates** (Degree or Diploma transcripts)\n` +
      `5️⃣ **English Scorecard** (PTE/IELTS) if already taken (otherwise our free weekly PTE classes begin right away!)\n\n` +
      `You can upload any of these files right here in WhatsApp!`
    );
  }

  // 24. If consultation is completed and candidate asks about next steps
  if (session.meetingCompleted || session.meetingStatus === "completed" || session.crmStatus === "follow-up") {
    return (
      `Hi${nameSalutation}! 🇦🇺 Your profile is in active follow-up with our consultation team.\n\n` +
      `Feel free to share any questions on documentation, employer matching, or your 4–5 month roadmap — our team is here to assist!`
    );
  }

  // 25. If candidate is awaiting consultation decision or selecting slots
  if (session.currentStep === "SELECTING_DAY" || session.currentStep === "SELECTING_SLOT") {
    return (
      `Hi${nameSalutation}! 👋 Select your weekend slot from the menu above, or ask me anything about eligible jobs, salaries, or the 4–5 month timeline! 🇦🇺`
    );
  }

  // 26. General human visa expert answer for open-ended or out-of-context questions
  if (isCrmLead) {
    return (
      `Hi${nameSalutation}! 👋 Your profile is currently active in our CRM (${session.crmStatus || "in progress"}). 🇦🇺\n\n` +
      `How can our team assist you with your Australia migration file today? Feel free to ask any question!`
    );
  }

  return (
    `Hi${nameSalutation}! 👋 I'm **Aria** from **TMS Visa** 🇦🇺 — specializing in Australia Employer Sponsored Work Visas (691 occupations, min AUD $76,500/year).\n\n` +
    `• Employer covers: $6,000 embassy + $330 permit + flight\n` +
    `• Candidate fee: AUD 300 to start; AUD 700 only after visa approval\n` +
    `• Direct PR after 2 years | Zero rejection track record\n\n` +
    `What's your occupation and years of experience? I'll check your eligibility now!`
  );
}
