import { Db } from "mongodb";
import { WhatsAppSession } from "./types";
import { getStaticGoogleMeetLink } from "./stateMachine";
import { getCandidateConsultationWindow } from "./timezone";

/**
 * Supported Candidate Intent Categories
 * Derived from real-world candidate conversations for Australian Employer Sponsored Work Visas.
 */
export type CandidateIntentCategory =
  | "upfront_fee_concern"          // "Why pay AUD 300 upfront?", "Is it refundable?", "Can employer pay all?"
  | "english_pte_fear"             // "My English is weak", "Is IELTS mandatory?", "What if I fail?"
  | "scam_legitimacy_doubt"        // "Is TMS real?", "Why WhatsApp?", "Show proof/ABN/CIN", "Frauds happen"
  | "job_sponsorship_guarantee"    // "Will I really get a job?", "What if company closes?", "Salary guarantee"
  | "eligibility_experience_doubt" // "No degree", "Only 2 years experience", "Age over 40", "Different trade"
  | "family_spousal_rights"        // "Can spouse work?", "Kids school fee?", "PR Subclass 186"
  | "salary_financial_benefits"    // "Is AUD 76,500 real?", "Savings in Australia?", "Taxes"
  | "process_and_timeline"         // "How many months?", "Step-by-step procedure", "When will I travel?"
  | "consultation_booking_hesitation" // "Why video call?", "Who takes it?", "Send link", "Is it free?"
  | "email_and_document_query"     // "Didn't get email", "Spam folder", "What 3 documents are needed?"
  | "colloquial_short"             // "Ok", "k", "tell me", "how", "sir", "namaste", "fees?"
  | "general_visa_inquiry";

export type CandidateSentiment =
  | "skeptical"       // Guarded, questioning legitimacy, asking for proof
  | "anxious"         // Worried about exams, failing, money loss, or age
  | "frustrated"      // Angry, annoyed with bot or repeated messages
  | "budget_sensitive"// Deeply focused on costs, asking for salary deduction
  | "eager"           // Enthusiastic, ready to move forward or book
  | "curious"         // Asking open questions, wanting more details
  | "neutral";        // Matter-of-fact question

export type LinguisticStyle = "hinglish" | "terse" | "detailed" | "standard";

export interface CandidateMessageInsight {
  primaryIntent: CandidateIntentCategory;
  secondaryIntents: CandidateIntentCategory[];
  sentiment: CandidateSentiment;
  linguisticStyle: LinguisticStyle;
  urgencyLevel: "high" | "medium" | "low";
  meetingLinkAllowed: boolean;
  detectedKeywords: string[];
  empathyHook: string;
  reassurancePoints: string[];
  recommendedTone: string;
  learnedDirectives: string;
  curatedReply: string;
}

export interface ObjectionCluster {
  intent: CandidateIntentCategory;
  count: number;
  percentage: number;
  keyThemes: string[];
  effectiveCounterStrategy: string;
}

export interface LearnedKnowledgeModel {
  version: number;
  lastTrainedAt: Date;
  totalAnalyzedMessages: number;
  totalAnalyzedSessions: number;
  topObjections: ObjectionCluster[];
  sentimentBreakdown: Record<CandidateSentiment, number>;
  linguisticBreakdown: Record<LinguisticStyle, number>;
  frequentQueries: Array<{ query: string; count: number; recommendedSolution: string }>;
  synthesizedPromptGuidance: string;
}

// In-memory cache for dynamic learnings to ensure zero latency overhead on high-frequency messaging
let cachedKnowledge: LearnedKnowledgeModel | null = null;
let lastCacheRefresh: number = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Removes any accidental staff names to uphold strict institutional anonymity.
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
 * Analyzes candidate's incoming message, emotional state, intent, and profile context.
 * Returns dynamic insights, empathy hooks, and prompt guidance.
 */
export function analyzeCandidateMessage(params: {
  message: string;
  session: WhatsAppSession;
}): CandidateMessageInsight {
  const { message, session } = params;
  const rawMsg = (message || "").trim();
  const lower = rawMsg.toLowerCase();

  // Clean tokens
  const words = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const wordSet = new Set(words);

  // 1. Linguistic Style Detection
  const hinglishTokens = [
    "kya", "hai", "kitna", "paisa", "paise", "kaise", "milega", "hoga", "sach",
    "batao", "btao", "karo", "mera", "meri", "hum", "kab", "karna", "nahi",
    "sir", "madam", "sahab", "ji", "dhokha", "frood", "kharcha", "kitne",
    "dena", "padega", "naukri", "kaam", "chahiye", "lagta", "lagti"
  ];
  const hasHinglish = hinglishTokens.some((t) => wordSet.has(t) || lower.includes(` ${t} `));
  const isTerse = words.length <= 3 && !hasHinglish;
  const isDetailed = words.length > 25;
  const linguisticStyle: LinguisticStyle = hasHinglish
    ? "hinglish"
    : isTerse
    ? "terse"
    : isDetailed
    ? "detailed"
    : "standard";

  // 2. Sentiment Detection
  const hasProfanityOrAnger =
    wordSet.has("fake") || wordSet.has("fraud") || wordSet.has("scam") ||
    wordSet.has("idiot") || wordSet.has("stupid") || wordSet.has("rubbish") ||
    wordSet.has("nonsense") || wordSet.has("liar") || wordSet.has("cheater") ||
    lower.includes("shut up") || lower.includes("get lost") || lower.includes("bakwas");

  const hasSkepticism =
    hasProfanityOrAnger ||
    lower.includes("are you real") || lower.includes("not real") ||
    lower.includes("how to trust") || lower.includes("proof") ||
    lower.includes("don't trust") || lower.includes("dont trust") ||
    lower.includes("is this genuine") || lower.includes("sach hai kya") ||
    lower.includes("registration number") || lower.includes("abn");

  const hasAnxiety =
    lower.includes("fail") || lower.includes("weak english") ||
    lower.includes("afraid") || lower.includes("fear") ||
    lower.includes("problem") || lower.includes("what if") ||
    lower.includes("reject") || lower.includes("risk") ||
    lower.includes("safe") || lower.includes("guarantee");

  const hasBudgetSensitivity =
    lower.includes("no money") || lower.includes("cannot afford") ||
    lower.includes("salary deduction") || lower.includes("deduct from salary") ||
    lower.includes("why upfront") || lower.includes("why pay now") ||
    lower.includes("kharcha") || lower.includes("discount") ||
    lower.includes("expensive");

  const hasEagerness =
    lower.includes("ready to start") || lower.includes("interested") ||
    lower.includes("send cv") || lower.includes("book now") ||
    lower.includes("urgent") || lower.includes("as soon as possible") ||
    lower.includes("lets start") || lower.includes("let's start");

  let sentiment: CandidateSentiment = "neutral";
  if (hasProfanityOrAnger) {
    sentiment = "frustrated";
  } else if (hasSkepticism) {
    sentiment = "skeptical";
  } else if (hasBudgetSensitivity) {
    sentiment = "budget_sensitive";
  } else if (hasAnxiety) {
    sentiment = "anxious";
  } else if (hasEagerness) {
    sentiment = "eager";
  } else if (lower.includes("?") || words.length > 5) {
    sentiment = "curious";
  }

  // 3. Primary & Secondary Intent Classification
  const detectedKeywords: string[] = [];
  const secondaryIntents: CandidateIntentCategory[] = [];

  // Upfront Fee Doubt
  const isFeeQuery =
    lower.includes("aud 300") || lower.includes("300") || lower.includes("fee") ||
    lower.includes("cost") || lower.includes("charge") || lower.includes("payment") ||
    lower.includes("upfront") || lower.includes("why first") || lower.includes("refund") ||
    lower.includes("paisa") || lower.includes("pay later") || lower.includes("after visa") ||
    lower.includes("salary cut") || lower.includes("deduct");

  // English & PTE Fear
  const isEnglishQuery =
    lower.includes("ielts") || lower.includes("pte") || lower.includes("english") ||
    lower.includes("score") || lower.includes("band") || lower.includes("language") ||
    lower.includes("exam") || lower.includes("test");

  // Legitimacy & Scam Fear
  const isLegitimacyQuery =
    lower.includes("scam") || lower.includes("fraud") || lower.includes("fake") ||
    lower.includes("trust") || lower.includes("proof") || lower.includes("abn") ||
    lower.includes("cin") || lower.includes("office") || lower.includes("address") ||
    lower.includes("registered") || lower.includes("marn");

  // Job Guarantee
  const isJobQuery =
    lower.includes("job guarantee") || lower.includes("offer letter") ||
    lower.includes("employer") || lower.includes("sponsor") || lower.includes("vacancy") ||
    lower.includes("interview") || lower.includes("naukri");

  // Experience & Eligibility
  const isEligibilityQuery =
    lower.includes("experience") || lower.includes("qualification") ||
    lower.includes("degree") || lower.includes("eligible") || lower.includes("age") ||
    lower.includes("gap") || lower.includes("am i eligible") || lower.includes("can i apply");

  // Family & Settlement
  const isFamilyQuery =
    lower.includes("family") || lower.includes("wife") || lower.includes("husband") ||
    lower.includes("spouse") || lower.includes("kids") || lower.includes("children") ||
    lower.includes("school") || lower.includes("pr") || lower.includes("186") ||
    lower.includes("permanent");

  // Salary & Benefits
  const isSalaryQuery =
    lower.includes("salary") || lower.includes("76,500") || lower.includes("76500") ||
    lower.includes("earn") || lower.includes("tsmit") || lower.includes("superannuation") ||
    lower.includes("savings");

  // Process & Timeline
  const isProcessQuery =
    lower.includes("process") || lower.includes("steps") || lower.includes("how it works") ||
    lower.includes("roadmap") || lower.includes("timeline") || lower.includes("how long") ||
    lower.includes("months") || lower.includes("duration");

  // Meeting Inquiry
  const isMeetingQuery =
    lower.includes("meeting") || lower.includes("consultation") || lower.includes("slot") ||
    lower.includes("weekend") || lower.includes("google meet") || lower.includes("meet link") ||
    lower.includes("who will talk");

  // Email / Docs
  const isEmailQuery =
    lower.includes("email") || lower.includes("mail") || lower.includes("document") ||
    lower.includes("pcc") || lower.includes("passport") || lower.includes("medical");

  // Primary Intent Assignment
  let primaryIntent: CandidateIntentCategory = "general_visa_inquiry";
  if (isLegitimacyQuery) {
    primaryIntent = "scam_legitimacy_doubt";
    detectedKeywords.push("legitimacy", "scam-check");
  } else if (isFeeQuery) {
    primaryIntent = "upfront_fee_concern";
    detectedKeywords.push("fees", "aud-300");
  } else if (isEnglishQuery) {
    primaryIntent = "english_pte_fear";
    detectedKeywords.push("english", "pte-exam");
  } else if (isJobQuery) {
    primaryIntent = "job_sponsorship_guarantee";
    detectedKeywords.push("job-sponsorship", "employer-guarantee");
  } else if (isFamilyQuery) {
    primaryIntent = "family_spousal_rights";
    detectedKeywords.push("family", "pr-pathway");
  } else if (isSalaryQuery) {
    primaryIntent = "salary_financial_benefits";
    detectedKeywords.push("salary", "tsmit-threshold");
  } else if (isProcessQuery) {
    primaryIntent = "process_and_timeline";
    detectedKeywords.push("process", "timeline-4-5-months");
  } else if (isEligibilityQuery) {
    primaryIntent = "eligibility_experience_doubt";
    detectedKeywords.push("eligibility", "2-years-exp");
  } else if (isMeetingQuery) {
    primaryIntent = "consultation_booking_hesitation";
    detectedKeywords.push("consultation", "google-meet");
  } else if (isEmailQuery) {
    primaryIntent = "email_and_document_query";
    detectedKeywords.push("email-pack", "documents");
  } else if (words.length <= 3) {
    primaryIntent = "colloquial_short";
    detectedKeywords.push("short-greeting");
  }

  // Populate secondary intents
  if (isFeeQuery && primaryIntent !== "upfront_fee_concern") secondaryIntents.push("upfront_fee_concern");
  if (isEnglishQuery && primaryIntent !== "english_pte_fear") secondaryIntents.push("english_pte_fear");
  if (isProcessQuery && primaryIntent !== "process_and_timeline") secondaryIntents.push("process_and_timeline");
  if (isFamilyQuery && primaryIntent !== "family_spousal_rights") secondaryIntents.push("family_spousal_rights");

  // 4. Meeting Link Guardrail Check
  // Strict rule: Candidate MUST have an actively booked meeting to receive the Google Meet link!
  const meetingLinkAllowed =
    session.meetingStatus === "booked" ||
    Boolean(session.bookedSlot);

  // 5. Contextual Salutation & Personalization
  const candidateName =
    session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
      ? session.name
      : "there";
  const occupation = session.occupation || "your profession";
  const experience = session.yearsExperience ? `${session.yearsExperience} of experience` : "your experience";
  const candWindow = getCandidateConsultationWindow(session.timeZone, session.timeZoneLabel);

  // 6. Dynamic Empathy Hook & Reassurance Synthesis
  let empathyHook = "";
  let reassurancePoints: string[] = [];
  let recommendedTone = "";
  let curatedReply = "";

  switch (primaryIntent) {
    case "upfront_fee_concern":
      empathyHook = `I completely understand why you'd want complete clarity on payments — it's smart to protect your hard-earned money.`;
      reassurancePoints = [
        "Australian employer covers $7,330+ of expenses ($6,000 embassy fees + $330 work permit + $1,000 flight ticket).",
        "Your total candidate fee is AUD 1,000 in 2 safe milestones: AUD 300 upfront for CV makeover, Case Manager, & weekly PTE coaching.",
        "Remaining AUD 700 is paid STRICTLY AFTER your visa approval & flight tickets are in hand.",
      ];
      recommendedTone = "Empathetic, financially transparent, calm, and reassuring. Do not sound defensive.";
      curatedReply =
        `Hi ${candidateName}! I completely understand your caution around fees. 🛡️\n\n` +
        `• **Australian Employer Pays:** $6,000 embassy fees + $330 work permit + $1,000 flight ticket\n` +
        `• **Your Fee is Protected (AUD 1,000 total):**\n` +
        `  1️⃣ **AUD 300 to start:** Australian CV revamp, dedicated Case Manager & free weekly PTE classes\n` +
        `  2️⃣ **AUD 700 balance:** Paid **strictly AFTER your visa grant & flight tickets in hand!**\n\n` +
        `Would you like to review your CV eligibility in a free 1-on-1 weekend call?`;
      break;

    case "english_pte_fear":
      empathyHook = `Don't worry about English tests right now — you do NOT need an IELTS or PTE score to start this process!`;
      reassurancePoints = [
        "No English exam required upfront; you only take it after securing your official Australian job offer.",
        "TMS provides free weekly PTE coaching classes from week 1 to ensure you easily hit the minimum band.",
        "Required PTE scores are very achievable: Listening 33, Reading 36, Writing 29, Speaking 24 (equivalent to IELTS 5.0).",
      ];
      recommendedTone = "Encouraging, supportive, stress-relieving, and practical.";
      curatedReply =
        `Hi ${candidateName}! Please don't worry about English scores — you do **NOT** need any exam to get started! 📚🇦🇺\n\n` +
        `• **Exam Timing:** You only sit for the test **after** your Australian employer gives you an official job offer.\n` +
        `• **Free Coaching:** TMS provides free weekly PTE preparation classes from Day 1.\n` +
        `• **Very Achievable Score:** Just PTE 33 Listening / 36 Reading / 29 Writing / 24 Speaking (or IELTS 5.0).\n\n` +
        `What's your current English comfort level? We'll guide you step-by-step!`;
      break;

    case "scam_legitimacy_doubt":
      empathyHook = `It is completely natural to be cautious — with so many migration scams around, verifying credentials is the right thing to do.`;
      reassurancePoints = [
        "Officially registered in Australia: 154 Peisley St, Orange NSW (ABN: 75 148 213 076).",
        "Officially registered in India: Groworld Vijatour Pvt Ltd (CIN: U62099HR2024PTC122827).",
        "Direct pre-vetted Australian employer sponsorship with Registered Australian Migration Agent (MARN Holder) handling visa lodgement.",
        "Zero rejection track record and milestone protection (AUD 700 paid only after visa is granted).",
      ];
      recommendedTone = "High authority, fully transparent, grounded in regulatory facts, zero defensiveness.";
      curatedReply =
        `Hi ${candidateName}! It's completely smart to verify credentials with so many unauthorized agents out there. 🏛️\n\n` +
        `• **Australia Office:** 154 Peisley St, Orange NSW | Migration Pty Ltd (ABN: 75 148 213 076)\n` +
        `• **India Corporate:** Groworld Vijatour Pvt Ltd (CIN: U62099HR2024PTC122827)\n` +
        `• **Legal Compliance:** Visas lodged by Registered Migration Agents (MARN)\n` +
        `• **Milestone Safety:** Final AUD 700 paid ONLY after visa approval & flight tickets in hand!\n\n` +
        `Check our details on the Australian ABR registry anytime at www.tmsvisa.com. 🇦🇺`;
      break;

    case "job_sponsorship_guarantee":
      empathyHook = `Great question — securing a genuine, approved Australian employer is the absolute foundation of our entire model.`;
      reassurancePoints = [
        "TMS directly markets your Australian-standard CV to approved Australian employers looking for overseas talent.",
        "Minimum statutory salary threshold is AUD $76,500/year plus 11.5% superannuation.",
        "Direct pre-matched sponsorship guarantees zero visa rejections.",
      ];
      recommendedTone = "Authoritative, industry-expert, confident.";
      curatedReply =
        `Hi ${candidateName}! Our model is built entirely on **direct employer sponsorship** across 691 approved roles. 💼🇦🇺\n\n` +
        `• **Pre-vetted Employers:** We match your profile directly to Australian companies with approved nomination quotas.\n` +
        `• **Statutory Salary:** Legally guaranteed minimum **AUD $76,500/year** + superannuation.\n` +
        `• **Direct Interview:** You interview directly with the employer and receive an official written offer letter.\n\n` +
        `With 2+ years in ${occupation}, you have strong employer demand!`;
      break;

    case "family_spousal_rights":
      empathyHook = `Australia offers some of the most generous family migration benefits in the world, and your immediate family travels with you!`;
      reassurancePoints = [
        "Spouse receives unrestricted full-time work rights in any field or location across Australia.",
        "School-age children attend Australian public schools.",
        "Direct permanent residency pathway (Subclass 186) for your whole family after 2 years.",
      ];
      recommendedTone = "Warm, inspiring, family-focused, reassuring.";
      curatedReply =
        `Hi ${candidateName}! Yes, your entire immediate family travels together to Australia! 👨‍👩‍👧‍👦🇦🇺\n\n` +
        `• **Spouse Work Rights:** Unrestricted full-time work permissions anywhere in Australia\n` +
        `• **Children:** Entitled to attend Australian public schools\n` +
        `• **Direct Permanent Residency (PR):** You and your family transition to Subclass 186 PR after 2 years!\n\n` +
        `Would you like to discuss your family visa roadmap in our free weekend consultation?`;
      break;

    case "salary_financial_benefits":
      empathyHook = `Australia's wage standards are among the highest globally, backed by strict legal government minimums.`;
      reassurancePoints = [
        "Australian Government statutory minimum (TSMIT) is AUD $76,500/year (~INR 42–45 Lakhs/year).",
        "Employer pays additional 11.5% superannuation (retirement pension fund).",
        "Employer also covers $6,000 embassy fees, $330 work permit, and your flight ticket.",
      ];
      recommendedTone = "Clear, inspiring, mathematically accurate, professional.";
      curatedReply =
        `Hi ${candidateName}! Australian salaries under this visa are legally protected by the government. 💰🇦🇺\n\n` +
        `• **Statutory Minimum:** AUD $76,500/year (~INR 42+ Lakhs) threshold\n` +
        `• **Retirement Pension:** Sponsoring employer pays an additional 11.5% superannuation\n` +
        `• **Employer Pays Big Expenses:** $6,000 embassy fees + $330 permit + flight ticket\n\n` +
        `With your background in ${occupation}, what salary package are you aiming for?`;
      break;

    case "process_and_timeline":
      empathyHook = `Here is the transparent 4–5 month journey from your CV review to flying to Australia:`;
      reassurancePoints = [
        "Month 1: Australian CV makeover, assigned Case Manager, free weekly PTE classes.",
        "Months 2-3: Employer marketing & interviews until job offer is secured.",
        "Month 4: Employer lodges nomination; you complete medical & PCC.",
        "Month 4-5: MARN Agent lodges visa; final AUD 700 paid only after visa is approved with flight ticket.",
      ];
      recommendedTone = "Structured, chronological, disciplined, realistic.";
      curatedReply =
        `Hi ${candidateName}! Here is the realistic 4–5 month roadmap: ⏱️🇦🇺\n\n` +
        `1️⃣ **Month 1:** Australian CV revamp + assigned Case Manager + weekly PTE coaching\n` +
        `2️⃣ **Months 2–3:** Employer marketing, interviews & official job offer\n` +
        `3️⃣ **Month 4:** 3 personal docs (Passport, Medical, PCC) + PTE score\n` +
        `4️⃣ **Month 4–5:** Registered Agent lodges visa. Final AUD 700 paid ONLY after visa approval & flight ticket!\n\n` +
        `Total timeline is 4–5 months for official government approvals. Ready to start?`;
      break;

    case "eligibility_experience_doubt":
      empathyHook = `Eligibility for the Australia Employer Sponsored Work Visa is very straightforward if you meet two core criteria.`;
      reassurancePoints = [
        "Minimum 2 years of verifiable full-time work experience in your field.",
        "Role must be on the official 691 Eligible Occupations List.",
        "No English exam needed upfront; TMS coaches you free.",
      ];
      recommendedTone = "Encouraging, analytical, solution-oriented.";
      curatedReply =
        `Hi ${candidateName}! Qualifying for the Australia Employer Sponsored Work Visa takes just 2 primary things: 🇦🇺\n\n` +
        `1️⃣ **Experience:** Minimum 2 years of verifiable full-time work experience in your occupation\n` +
        `2️⃣ **Eligible Role:** Your profession must be on the official 691 occupation list\n\n` +
        `With ${experience} in ${occupation}, you look like a strong candidate! Would you like our Senior Migration Expert to review your CV this weekend?`;
      break;

    case "consultation_booking_hesitation":
      empathyHook = `Our weekend consultation is a 100% free, 1-on-1 strategic session on Google Meet with our Senior Migration Expert.`;
      reassurancePoints = [
        `1-hour private session held Saturdays and Sundays between ${candWindow.displayWindow} in your local time.`,
        "We review your CV across 691 eligible roles, match employer opportunities, and outline your timeline.",
        meetingLinkAllowed
          ? `Your meeting is confirmed! Access link: ${getStaticGoogleMeetLink()}`
          : "The Google Meet link is automatically issued right here as soon as you select your preferred date and slot.",
      ];
      recommendedTone = "Welcoming, informative, privacy-respecting.";
      curatedReply = meetingLinkAllowed
        ? `Hi ${candidateName}! 👋 Your consultation is confirmed!\n\n` +
          `📅 **Date:** ${session.bookedSlot?.date || "This weekend"}\n` +
          `⏰ **Time:** ${session.bookedSlot?.candidateTimeLabel || "Your chosen slot"}\n` +
          `🔗 **Google Meet Link:** ${getStaticGoogleMeetLink()}\n\n` +
          `Our Senior Migration Expert will review your CV live and answer all your questions. See you there! 🇦🇺`
        : `Hi ${candidateName}! Our 1-on-1 consultation is completely free and held live on Google Meet with our Senior Migration Expert! 🇦🇺\n\n` +
          `• We assess your CV against the official 691 occupation list\n` +
          `• Explain active Australian employer vacancies & AUD $76,500+ salaries\n` +
          `• Outline your exact 4-5 month timeline\n\n` +
          `Choose your preferred weekend slot above to receive your personal Google Meet link!`;
      break;

    case "email_and_document_query":
      empathyHook = `We'll make sure you have all documentation and official information packs delivered right away.`;
      reassurancePoints = [
        "Information pack is dispatched to candidate's registered email.",
        "Candidate only needs 3 personal documents: Passport copy, Medical Fitness, Police Clearance (PCC).",
        "Official legal agreements are emailed after the free consultation session.",
      ];
      recommendedTone = "Efficient, helpful, detail-oriented.";
      curatedReply =
        `Hi ${candidateName}! 📧 We send our official Australia Work Visa Information Pack directly to ${session.email ? `**${session.email}**` : "your registered email"}.\n\n` +
        `• Please check your **Inbox** and **Spam/Junk** folder.\n` +
        `• Need to update your email? Reply with: *My email is yourname@example.com*\n` +
        `• You only ever need **3 personal documents**: Valid Passport, Medical Certificate, and Police Clearance (PCC)! 🇦🇺`;
      break;

    case "colloquial_short":
      empathyHook = hasHinglish
        ? `Namaste ${candidateName}! Kaise madad kar sakta hu aapki Australia Work Visa ke liye?`
        : `Hi ${candidateName}! How can I help you with your Australia Work Visa pathway today?`;
      reassurancePoints = [
        "Aria at TMS Visa specializes in Australia Employer Sponsored Work Visas (min AUD $76,500/year).",
        "Free CV assessment across 691 eligible occupations.",
      ];
      recommendedTone = "Friendly, conversational, approachable, concise.";
      curatedReply = hasHinglish
        ? `Namaste ${candidateName}! 🙏 I'm **Aria** from **TMS Visa** 🇦🇺.\n\n` +
          `Hum Australia Employer Sponsored Work Visa me specialize karte hain:\n` +
          `• Min salary: **AUD $76,500/year** (INR 42+ Lakhs)\n` +
          `• Employer embassy fees ($6,000) & flight ticket pay karta hai\n` +
          `• 2 saal baad direct PR pathway (Subclass 186)\n\n` +
          `Aapka profession aur experience kitne saal ka hai? Main turant eligibility check karti hu!`
        : `Hi ${candidateName}! 👋 I'm **Aria**, Senior Migration Counselor at **TMS Visa** 🇦🇺.\n\n` +
          `We assist professionals with Australia Employer Sponsored Work Visas:\n` +
          `• Min salary: **AUD $76,500/year** + super\n` +
          `• Employer covers: $6,000 embassy fees + $330 permit + flight ticket\n` +
          `• Total candidate fee: AUD 300 start, AUD 700 only after visa grant\n\n` +
          `What is your occupation and years of experience?`;
      break;

    default:
      empathyHook = `Thank you for reaching out to The Migration School (TMS Visa).`;
      reassurancePoints = [
        "Direct employer-sponsored work visa across 691 occupations with minimum AUD $76,500/year.",
        "Candidate pays AUD 300 to start; final AUD 700 only after visa approval & flight tickets.",
        "Free weekly PTE coaching and zero visa rejection track record.",
      ];
      recommendedTone = "Professional, helpful, migration-expert authority.";
      curatedReply =
        `Hi ${candidateName}! 👋 I'm **Aria** from **TMS Visa** 🇦🇺 — specializing in Australia Employer Sponsored Work Visas (691 occupations, min AUD $76,500/year).\n\n` +
        `• Employer covers: $6,000 embassy + $330 permit + flight ticket\n` +
        `• Candidate fee: AUD 300 to start; AUD 700 only after visa approval\n` +
        `• Direct PR after 2 years | Zero rejection track record\n\n` +
        `What's your occupation and years of work experience? I'll check your eligibility!`;
      break;
  }

  // 7. Compose dynamic learned directives for the AI system prompt
  const learnedDirectives = `
DYNAMIC LEARNED CANDIDATE INTELLIGENCE & BEHAVIORAL DIRECTIVES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- CANDIDATE CONCERN PROFILE:
  * Primary Intent: "${primaryIntent}"
  * Detected Sentiment: "${sentiment.toUpperCase()}"
  * Linguistic Style: "${linguisticStyle}"
  * Urgency Level: "${hasEagerness ? "HIGH" : "NORMAL"}"

- EMPATHETIC OPENING DIRECTIVE:
  * Do NOT give a dry robotic dump. Start by directly acknowledging their feeling or question:
    "${empathyHook}"

- CORE REASSURANCE POINTS TO WEAVE IN (CRITICAL FACTS):
${reassurancePoints.map((pt) => `  * ${pt}`).join("\n")}

- TONE GUIDELINES:
  * ${recommendedTone}
  * Strictly avoid sounding salesy or defensive. Sound like a caring, seasoned Australian migration expert.
  * If candidate spoke Hinglish, blend natural conversational warmth.

- STRICT SAFETY & POLICY ENFORCEMENT:
  * TIMEZONE RULE: Candidate is located in ${session.countryName} (${candWindow.tzShort}). Always and only state consultation hours as: ${candWindow.displayWindow}. NEVER mention 'IST' or '1-9 PM' unless the candidate is located in India!
  * MEETING LINK PRIVACY: ${
    meetingLinkAllowed
      ? "Candidate HAS a confirmed booked slot. You may confirm their meeting time and provide the Google Meet link."
      : "PRIVACY GUARD: Candidate has NOT booked a consultation slot yet. Under NO circumstances provide the Google Meet link. Instruct them to select a weekend slot first."
  }
  * ZERO PERSONAL NAMES: Never mention staff names like Sumit or Abhay. Refer to staff as 'your dedicated TMS Recruitment Case Manager' or 'our Senior Migration Expert'.
  * STRICT 60-100 WORDS: Keep total WhatsApp reply compact, punchy, bolded, and easy to read on mobile.
`;

  return {
    primaryIntent,
    secondaryIntents,
    sentiment,
    linguisticStyle,
    urgencyLevel: hasEagerness ? "high" : "medium",
    meetingLinkAllowed,
    detectedKeywords,
    empathyHook,
    reassurancePoints,
    recommendedTone,
    learnedDirectives,
    curatedReply: sanitizeStaffNames(curatedReply),
  };
}

/**
 * Trains knowledge and behavioral patterns from past candidate messages in MongoDB.
 * Aggregates candidate questions, top objections, and sentiment distribution,
 * then saves the learned intelligence into `whatsapp_ai_learnings`.
 */
export async function trainKnowledgeFromCandidateMessages(db: Db): Promise<LearnedKnowledgeModel> {
  const startTime = Date.now();
  console.log("[MessageIntelligence] Initiating knowledge training from candidate messages...");

  // 1. Fetch recent candidate messages from whatsapp_messages (last 3,000)
  const candidateMessages = await db
    .collection("whatsapp_messages")
    .find({ sender: "candidate" })
    .sort({ createdAt: -1 })
    .limit(3000)
    .toArray();

  // 2. Fetch session profiles with conversation history
  const candidateSessions = await db
    .collection("whatsapp_sessions")
    .find({ conversationHistory: { $exists: true, $not: { $size: 0 } } })
    .sort({ updatedAt: -1 })
    .limit(500)
    .toArray();

  const intentCounts: Record<CandidateIntentCategory, number> = {
    upfront_fee_concern: 0,
    english_pte_fear: 0,
    scam_legitimacy_doubt: 0,
    job_sponsorship_guarantee: 0,
    eligibility_experience_doubt: 0,
    family_spousal_rights: 0,
    salary_financial_benefits: 0,
    process_and_timeline: 0,
    consultation_booking_hesitation: 0,
    email_and_document_query: 0,
    colloquial_short: 0,
    general_visa_inquiry: 0,
  };

  const sentimentCounts: Record<CandidateSentiment, number> = {
    skeptical: 0,
    anxious: 0,
    frustrated: 0,
    budget_sensitive: 0,
    eager: 0,
    curious: 0,
    neutral: 0,
  };

  const linguisticCounts: Record<LinguisticStyle, number> = {
    hinglish: 0,
    terse: 0,
    detailed: 0,
    standard: 0,
  };

  const frequentQuestionMap = new Map<string, number>();

  // Process unified candidate messages
  for (const doc of candidateMessages) {
    const text = String(doc.text || "").trim();
    if (!text || text.length < 2) continue;

    // Dummy session for message-level analysis
    const dummySession: WhatsAppSession = {
      phone: String(doc.phone || ""),
      countryCode: "IN",
      countryName: "India",
      timeZone: "Asia/Kolkata",
      timeZoneLabel: "IST",
      currentStep: "WELCOME",
      followupCount: 0,
      lastInteractionAt: doc.createdAt || new Date(),
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.createdAt || new Date(),
    };

    const analysis = analyzeCandidateMessage({ message: text, session: dummySession });
    intentCounts[analysis.primaryIntent] = (intentCounts[analysis.primaryIntent] || 0) + 1;
    sentimentCounts[analysis.sentiment] = (sentimentCounts[analysis.sentiment] || 0) + 1;
    linguisticCounts[analysis.linguisticStyle] = (linguisticCounts[analysis.linguisticStyle] || 0) + 1;

    // Cluster frequent short questions
    if (text.length > 5 && text.length < 60) {
      const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      frequentQuestionMap.set(normalized, (frequentQuestionMap.get(normalized) || 0) + 1);
    }
  }

  // Also process conversation history from sessions
  for (const sessionDoc of candidateSessions) {
    const history = sessionDoc.conversationHistory || [];
    for (const item of history) {
      if (item.role === "candidate" && item.message) {
        const text = String(item.message).trim();
        if (text.length > 4) {
          const analysis = analyzeCandidateMessage({
            message: text,
            session: sessionDoc as unknown as WhatsAppSession,
          });
          intentCounts[analysis.primaryIntent] = (intentCounts[analysis.primaryIntent] || 0) + 1;
        }
      }
    }
  }

  const totalAnalyzed = candidateMessages.length;
  const safeTotal = totalAnalyzed > 0 ? totalAnalyzed : 1;

  // Build top objection clusters
  const topObjections: ObjectionCluster[] = [
    {
      intent: "upfront_fee_concern" as CandidateIntentCategory,
      count: intentCounts.upfront_fee_concern,
      percentage: Math.round((intentCounts.upfront_fee_concern / safeTotal) * 100),
      keyThemes: ["Why AUD 300 upfront", "Salary deduction request", "Refund safety", "Is fee guaranteed?"],
      effectiveCounterStrategy:
        "Frame the AUD 300 as professional onboarding (Australian CV revamp, personal Case Manager, free weekly PTE classes) while emphasizing that the Australian employer pays over $7,330 in visa and travel fees, and the final AUD 700 is paid strictly AFTER visa grant with flight tickets in hand.",
    },
    {
      intent: "english_pte_fear" as CandidateIntentCategory,
      count: intentCounts.english_pte_fear,
      percentage: Math.round((intentCounts.english_pte_fear / safeTotal) * 100),
      keyThemes: ["Weak English", "No IELTS", "What if I fail PTE?", "Exam fear"],
      effectiveCounterStrategy:
        "Immediately remove exam anxiety: Explain that NO exam is required to start. The test is taken only AFTER securing an official job offer from an Australian employer, and TMS provides free weekly PTE coaching classes every weekend from Day 1.",
    },
    {
      intent: "scam_legitimacy_doubt" as CandidateIntentCategory,
      count: intentCounts.scam_legitimacy_doubt,
      percentage: Math.round((intentCounts.scam_legitimacy_doubt / safeTotal) * 100),
      keyThemes: ["Scam accusations", "How to trust", "ABN/CIN lookup", "Office proof"],
      effectiveCounterStrategy:
        "Provide factual corporate transparency: Australia Registered Office in Orange NSW (ABN: 75 148 213 076) and India Corporate CIN, MARN-regulated visa lodgement, and our 2-stage fee protection structure. Never be defensive.",
    },
    {
      intent: "job_sponsorship_guarantee" as CandidateIntentCategory,
      count: intentCounts.job_sponsorship_guarantee,
      percentage: Math.round((intentCounts.job_sponsorship_guarantee / safeTotal) * 100),
      keyThemes: ["Will I get job?", "What if rejected?", "Salary guarantee"],
      effectiveCounterStrategy:
        "Explain direct employer matching across 691 approved occupations with legally protected minimum salary of AUD $76,500/year plus superannuation. Highlight zero visa rejection track record due to pre-vetted sponsorship.",
    },
  ].sort((a, b) => b.count - a.count);

  // Extract top frequent questions
  const frequentQueries = Array.from(frequentQuestionMap.entries())
    .filter(([q, count]) => count >= 2 && q.length > 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({
      query,
      count,
      recommendedSolution: "Address directly in first sentence, avoid robotic greetings, state key figures clearly.",
    }));

  const synthesizedPromptGuidance = `
LEARNED INSTITUTIONAL INTELLIGENCE (TRAINED FROM ${totalAnalyzed} REAL CANDIDATE MESSAGES):
- #1 CANDIDATE FRICTION: Upfront fee doubt (${topObjections[0]?.percentage || 0}% of objections). Emphasize that the employer covers $7,330+ and candidate only pays AUD 700 AFTER visa approval with tickets in hand.
- #2 CANDIDATE FRICTION: English test fear. Constantly reassure that no exam is needed upfront; TMS coaches them free every weekend until they secure an offer.
- #3 CANDIDATE FRICTION: Scam skepticism. Provide corporate registration facts (Orange NSW ABN 75 148 213 076) calmly and confidently.
- LINGUISTIC BALANCE: ${linguisticCounts.hinglish > 0 ? "Candidates frequently communicate in Hinglish. Match with warm, respectful, easily understood phrasing." : "Keep tone warm, crisp, and professional."}
`;

  const learnedModel: LearnedKnowledgeModel = {
    version: 1,
    lastTrainedAt: new Date(),
    totalAnalyzedMessages: totalAnalyzed,
    totalAnalyzedSessions: candidateSessions.length,
    topObjections,
    sentimentBreakdown: sentimentCounts,
    linguisticBreakdown: linguisticCounts,
    frequentQueries,
    synthesizedPromptGuidance,
  };

  // 3. Persist to MongoDB collection whatsapp_ai_learnings
  try {
    await db.collection("whatsapp_ai_learnings").updateOne(
      { _id: "active_learnings" as any },
      { $set: learnedModel },
      { upsert: true }
    );
    console.log(`[MessageIntelligence] Successfully trained knowledge model in ${Date.now() - startTime}ms.`);
  } catch (err) {
    console.warn("[MessageIntelligence] Failed to write learned intelligence to DB:", err);
  }

  // Update in-memory cache
  cachedKnowledge = learnedModel;
  lastCacheRefresh = Date.now();

  return learnedModel;
}

/**
 * Retrieves the currently active learned knowledge model from memory or DB.
 */
export async function getLearnedKnowledge(db?: Db): Promise<LearnedKnowledgeModel | null> {
  const now = Date.now();
  if (cachedKnowledge && now - lastCacheRefresh < CACHE_TTL_MS) {
    return cachedKnowledge;
  }

  if (db) {
    try {
      const doc = await db.collection("whatsapp_ai_learnings").findOne({ _id: "active_learnings" as any });
      if (doc) {
        cachedKnowledge = doc as unknown as LearnedKnowledgeModel;
        lastCacheRefresh = now;
        return cachedKnowledge;
      }
    } catch (err) {
      console.warn("[MessageIntelligence] Failed to load learned knowledge from DB:", err);
    }
  }

  return cachedKnowledge;
}

/**
 * Automatically invoked whenever a candidate sends a WhatsApp message.
 * Analyzes the incoming message, updates incremental learning counters in MongoDB,
 * records frequent question patterns, and triggers background knowledge retraining if stale (> 2 hours).
 */
export async function recordCandidateMessageLearning(params: {
  db: Db;
  phone: string;
  text: string;
  senderName?: string;
  session?: WhatsAppSession;
}): Promise<void> {
  const { db, phone, text, senderName, session } = params;
  if (!text || text.trim().length < 2) return;

  try {
    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");

    // 1. Analyze candidate message intent & sentiment
    const dummySession: WhatsAppSession = session || {
      phone: cleanPhone,
      countryCode: "IN",
      countryName: "India",
      timeZone: "Asia/Kolkata",
      timeZoneLabel: "IST",
      currentStep: "WELCOME",
      followupCount: 0,
      lastInteractionAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insight = analyzeCandidateMessage({ message: text, session: dummySession });

    // 2. Incremental atomic tally in MongoDB
    const incObj: Record<string, number> = {
      totalAnalyzedMessages: 1,
      [`intentCounts.${insight.primaryIntent}`]: 1,
      [`sentimentCounts.${insight.sentiment}`]: 1,
      [`linguisticCounts.${insight.linguisticStyle}`]: 1,
    };

    const normalizedQuery = text.trim().slice(0, 140);

    await db.collection("whatsapp_ai_learnings").updateOne(
      { _id: "active_learnings" as any },
      {
        $inc: incObj,
        $set: {
          lastLearnedMessageAt: new Date(),
          lastCandidateQuery: normalizedQuery,
        },
        $push: {
          recentCandidateQueries: {
            $each: [
              {
                text: normalizedQuery,
                intent: insight.primaryIntent,
                sentiment: insight.sentiment,
                at: new Date(),
              },
            ],
            $slice: -250, // Keep rolling buffer of last 250 candidate queries
          },
        } as any,
      },
      { upsert: true }
    );

    // 3. Auto-retrain if the model has not been trained yet or is older than 2 hours
    const activeLearned = await getLearnedKnowledge(db);
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    if (!activeLearned || !activeLearned.lastTrainedAt || new Date(activeLearned.lastTrainedAt).getTime() < twoHoursAgo) {
      trainKnowledgeFromCandidateMessages(db).catch((e) =>
        console.warn("[MessageIntelligence] Background auto-training error:", e)
      );
    }
  } catch (err) {
    console.warn("[MessageIntelligence] recordCandidateMessageLearning failed:", err);
  }
}

/**
 * Checks if the learned knowledge model is stale (> 2 hours old or not yet generated),
 * and triggers background re-training from candidate interactions.
 */
export async function autoTrainIfStale(db: Db): Promise<void> {
  try {
    const active = await getLearnedKnowledge(db);
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    if (!active || !active.lastTrainedAt || new Date(active.lastTrainedAt).getTime() < twoHoursAgo) {
      console.log("[MessageIntelligence] Auto-training knowledge base from candidate messages...");
      await trainKnowledgeFromCandidateMessages(db);
    }
  } catch (err) {
    console.warn("[MessageIntelligence] autoTrainIfStale failed:", err);
  }
}

/**
 * Returns dynamic candidate insights and prompt guidance for ai.ts.
 */
export function getCandidateMessageInsights(params: {
  message: string;
  session: WhatsAppSession;
}): CandidateMessageInsight {
  const insight = analyzeCandidateMessage(params);

  // If collective learned intelligence is cached in memory, enrich the behavioral directives
  if (cachedKnowledge?.synthesizedPromptGuidance) {
    insight.learnedDirectives += `\n${cachedKnowledge.synthesizedPromptGuidance}\n`;
  }

  return insight;
}
