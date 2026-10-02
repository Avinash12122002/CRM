export type CandidateIntentCategory =
  | "upfront_fee_concern"          // "Why pay €300 upfront?", "Is it refundable?", "Can employer pay all?"
  | "english_pte_fear"             // "My English is weak", "Is IELTS mandatory?", "What if I fail?"
  | "scam_legitimacy_doubt"        // "Is TMS real?", "Why WhatsApp?", "Show proof", "Frauds happen"
  | "job_sponsorship_guarantee"    // "Will I really get a job in Ireland?", "Salary guarantee"
  | "eligibility_experience_doubt" // "No degree", "Only 2 years experience", "Age over 40"
  | "family_spousal_rights"        // "Can spouse work in Ireland?", "Kids school fee?", "Stamp 4 PR"
  | "salary_financial_benefits"    // "Is €45,000 real?", "Savings in Ireland?", "Taxes"
  | "process_and_timeline"         // "How many months?", "Step-by-step procedure", "When will I travel?"
  | "consultation_booking_hesitation" // "Why video call?", "Who takes it?", "Send link", "Is it free?"
  | "email_and_document_query"     // "Didn't get email", "Spam folder", "What 3 documents are needed?"
  | "colloquial_short"             // "Ok", "k", "tell me", "how", "sir", "namaste", "fees?"
  | "general_visa_inquiry";

import { Db } from "mongodb";
import { WhatsAppSession } from "./types";

export type CandidateSentiment =
  | "skeptical"
  | "anxious"
  | "frustrated"
  | "budget_sensitive"
  | "eager"
  | "curious"
  | "neutral";

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

export function analyzeCandidateMessage(params: {
  message: string;
  session: WhatsAppSession;
}): CandidateMessageInsight {
  const { message, session } = params;
  const rawMsg = (message || "").trim();
  const lower = rawMsg.toLowerCase();

  const detectedKeywords: string[] = [];
  const secondaryIntents: CandidateIntentCategory[] = [];
  let primaryIntent: CandidateIntentCategory = "general_visa_inquiry";
  let sentiment: CandidateSentiment = "neutral";
  let linguisticStyle: LinguisticStyle = "standard";
  const urgencyLevel: "high" | "medium" | "low" = "medium";

  // Check language & linguistic style
  if (
    lower.includes("kya") ||
    lower.includes("kaise") ||
    lower.includes("kitna") ||
    lower.includes("batao") ||
    lower.includes("karo") ||
    lower.includes("nhi") ||
    lower.includes("hain") ||
    lower.includes("mujhe")
  ) {
    linguisticStyle = "hinglish";
  } else if (rawMsg.length <= 10) {
    linguisticStyle = "terse";
  } else if (rawMsg.length > 150) {
    linguisticStyle = "detailed";
  }

  // Fees / Cost intent
  if (
    lower.includes("fee") ||
    lower.includes("cost") ||
    lower.includes("charge") ||
    lower.includes("price") ||
    lower.includes("300") ||
    lower.includes("700") ||
    lower.includes("1000") ||
    lower.includes("euro") ||
    lower.includes("paisa") ||
    lower.includes("rupee") ||
    lower.includes("salary deduction")
  ) {
    primaryIntent = "upfront_fee_concern";
    detectedKeywords.push("fees", "cost");
    sentiment = "budget_sensitive";
  } else if (
    lower.includes("english") ||
    lower.includes("pte") ||
    lower.includes("ielts") ||
    lower.includes("test") ||
    lower.includes("exam") ||
    lower.includes("band")
  ) {
    primaryIntent = "english_pte_fear";
    detectedKeywords.push("english", "pte");
    sentiment = "anxious";
  } else if (
    lower.includes("fake") ||
    lower.includes("scam") ||
    lower.includes("fraud") ||
    lower.includes("proof") ||
    lower.includes("real") ||
    lower.includes("trust") ||
    lower.includes("guarantee")
  ) {
    primaryIntent = "scam_legitimacy_doubt";
    detectedKeywords.push("scam", "proof");
    sentiment = "skeptical";
  } else if (
    lower.includes("stamp 4") ||
    lower.includes("pr") ||
    lower.includes("permanent") ||
    lower.includes("family") ||
    lower.includes("wife") ||
    lower.includes("husband") ||
    lower.includes("spouse") ||
    lower.includes("kids") ||
    lower.includes("children")
  ) {
    primaryIntent = "family_spousal_rights";
    detectedKeywords.push("stamp4", "family");
  } else if (
    lower.includes("eligible") ||
    lower.includes("eligibility") ||
    lower.includes("qualify") ||
    lower.includes("qualification") ||
    lower.includes("experience") ||
    lower.includes("csol") ||
    lower.includes("iol") ||
    lower.includes("gep") ||
    lower.includes("csep") ||
    lower.includes("critical skills") ||
    lower.includes("occupation") ||
    lower.includes("profession") ||
    lower.includes("my job")
  ) {
    primaryIntent = "eligibility_experience_doubt";
    detectedKeywords.push("eligibility", "experience", "occupation");
    sentiment = "curious";
  } else if (
    lower.includes("job guarantee") ||
    lower.includes("will i get a job") ||
    lower.includes("sponsorship") ||
    lower.includes("sponsor") ||
    lower.includes("employer") ||
    lower.includes("interview")
  ) {
    primaryIntent = "job_sponsorship_guarantee";
    detectedKeywords.push("job", "sponsorship");
  } else if (
    lower.includes("timeline") ||
    lower.includes("how long") ||
    lower.includes("how many month") ||
    lower.includes("when will i go") ||
    lower.includes("process")
  ) {
    primaryIntent = "process_and_timeline";
    detectedKeywords.push("timeline", "process");
  }

  const meetingLinkAllowed = session.meetingStatus === "booked" || Boolean(session.bookedSlot);

  let empathyHook = "I completely understand your query.";
  const reassurancePoints: string[] = [];

  if (primaryIntent === "upfront_fee_concern") {
    empathyHook = "I understand cost transparency is essential.";
    reassurancePoints.push("Irish employers cover the €1,000 permit fee, visa charges, and flights.");
    reassurancePoints.push("Candidate fee is strictly €1,000 split in 2 stages (€300 start / €700 after visa in hand).");
  } else if (primaryIntent === "english_pte_fear") {
    empathyHook = "Don't worry about English at this stage!";
    reassurancePoints.push("You do NOT need an English test to start or apply.");
    reassurancePoints.push("TMS provides free weekly English communication coaching starting immediately upon enrollment — to help you impress employers. No PTE exam is required for the Ireland visa.");
  } else if (primaryIntent === "scam_legitimacy_doubt") {
    empathyHook = "It's completely natural to verify credentials.";
    reassurancePoints.push("TMS Visa operates with registered corporate and migration legal entities.");
    reassurancePoints.push("All client funds are protected by our 1-year agreement and 100% money-back guarantee.");
  } else if (primaryIntent === "eligibility_experience_doubt") {
    empathyHook = "Let's check your eligibility against Ireland's official occupation lists!";
    reassurancePoints.push("Ireland uses a 3-way system: CSOL (Critical Skills), Ineligible (IOL), and General Employment (GEP).");
    reassurancePoints.push("A minimum of 2 years of relevant work experience is required for both CSEP and GEP.");
    reassurancePoints.push("TMS evaluates your CV during our free assessment with zero commitment.");
  } else if (primaryIntent === "job_sponsorship_guarantee") {
    empathyHook = "TMS connects your profile directly with vetted Irish employers.";
    reassurancePoints.push("TMS arranges your virtual interviews with hiring employers who sponsor the work permit.");
    reassurancePoints.push("All services backed by a 100% money-back guarantee if the visa is rejected for any reason.");
  }

  return {
    primaryIntent,
    secondaryIntents,
    sentiment,
    linguisticStyle,
    urgencyLevel,
    meetingLinkAllowed,
    detectedKeywords,
    empathyHook,
    reassurancePoints,
    recommendedTone: sentiment === "skeptical" ? "reassuring and legally precise" : "friendly, clear, and proactive",
    learnedDirectives: "Always emphasize direct Irish employer sponsorship and Stamp 4 PR pathway in 2 years.",
    curatedReply: "",
  };
}

export interface TopObjectionAnalysis {
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
  topObjections: TopObjectionAnalysis[];
  sentimentBreakdown: Record<CandidateSentiment, number>;
  linguisticBreakdown: Record<LinguisticStyle, number>;
  frequentQueries: Array<{ query: string; count: number; recommendedSolution: string }>;
  synthesizedPromptGuidance: string;
}

let cachedKnowledge: LearnedKnowledgeModel | null = null;
let lastCacheRefresh: number = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function trainKnowledgeFromCandidateMessages(db: Db): Promise<LearnedKnowledgeModel> {
  // 1. Fetch direct candidate messages from whatsapp_ireland_messages
  const directCandidateMessages = await db
    .collection("whatsapp_ireland_messages")
    .find({ sender: "candidate" })
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray();

  // 2. Fetch from whatsapp_ireland_sessions (both conversationHistory and chatHistory)
  const sessions = await db
    .collection("whatsapp_ireland_sessions")
    .find({
      $or: [
        { "conversationHistory.role": "candidate" },
        { "chatHistory.sender": { $in: ["user", "candidate"] } },
      ],
    })
    .limit(500)
    .toArray();

  let totalAnalyzed = 0;
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

  for (const m of directCandidateMessages) {
    if (typeof m.text === "string" && m.text.trim()) {
      totalAnalyzed++;
      const dummySession: WhatsAppSession = {
        phone: m.phone || "",
        countryCode: "IE",
        countryName: "Ireland",
        timeZone: "Europe/Dublin",
        timeZoneLabel: "IST/GMT",
        currentStep: "WELCOME",
        followupCount: 0,
        lastInteractionAt: m.createdAt || new Date(),
        createdAt: m.createdAt || new Date(),
        updatedAt: m.createdAt || new Date(),
        interestedCountry: "Ireland",
      };
      const insight = analyzeCandidateMessage({ message: m.text, session: dummySession });
      intentCounts[insight.primaryIntent] = (intentCounts[insight.primaryIntent] || 0) + 1;
      sentimentCounts[insight.sentiment] = (sentimentCounts[insight.sentiment] || 0) + 1;
      linguisticCounts[insight.linguisticStyle] = (linguisticCounts[insight.linguisticStyle] || 0) + 1;

      const cleanQ = m.text.trim().toLowerCase().slice(0, 80);
      frequentQuestionMap.set(cleanQ, (frequentQuestionMap.get(cleanQ) || 0) + 1);
    }
  }

  for (const sess of sessions) {
    const convHistory = Array.isArray(sess.conversationHistory) ? sess.conversationHistory : [];
    for (const msg of convHistory) {
      if (msg.role === "candidate" && typeof msg.message === "string" && msg.message.trim()) {
        totalAnalyzed++;
        const dummySession: WhatsAppSession = sess as any;
        const insight = analyzeCandidateMessage({ message: msg.message, session: dummySession });
        intentCounts[insight.primaryIntent] = (intentCounts[insight.primaryIntent] || 0) + 1;
        sentimentCounts[insight.sentiment] = (sentimentCounts[insight.sentiment] || 0) + 1;
        linguisticCounts[insight.linguisticStyle] = (linguisticCounts[insight.linguisticStyle] || 0) + 1;

        const cleanQ = msg.message.trim().toLowerCase().slice(0, 80);
        frequentQuestionMap.set(cleanQ, (frequentQuestionMap.get(cleanQ) || 0) + 1);
      }
    }

    const legacyHistory = Array.isArray(sess.chatHistory) ? sess.chatHistory : [];
    for (const msg of legacyHistory) {
      if ((msg.sender === "user" || msg.sender === "candidate") && typeof msg.text === "string" && msg.text.trim()) {
        totalAnalyzed++;
        const dummySession: WhatsAppSession = sess as any;
        const insight = analyzeCandidateMessage({ message: msg.text, session: dummySession });
        intentCounts[insight.primaryIntent] = (intentCounts[insight.primaryIntent] || 0) + 1;
        sentimentCounts[insight.sentiment] = (sentimentCounts[insight.sentiment] || 0) + 1;
        linguisticCounts[insight.linguisticStyle] = (linguisticCounts[insight.linguisticStyle] || 0) + 1;

        const cleanQ = msg.text.trim().toLowerCase().slice(0, 80);
        frequentQuestionMap.set(cleanQ, (frequentQuestionMap.get(cleanQ) || 0) + 1);
      }
    }
  }

  const safeTotal = totalAnalyzed || 1;
  const topObjections: TopObjectionAnalysis[] = [
    {
      intent: "upfront_fee_concern" as CandidateIntentCategory,
      count: intentCounts.upfront_fee_concern,
      percentage: Math.round((intentCounts.upfront_fee_concern / safeTotal) * 100),
      keyThemes: ["Why pay €300 upfront?", "Is it refundable?", "Can employer pay all?"],
      effectiveCounterStrategy:
        "Irish employers sponsor the €1,000 permit fee, visa charges, and flight. Candidate only pays €300 start / €700 final fee after visa is issued.",
    },
    {
      intent: "english_pte_fear" as CandidateIntentCategory,
      count: intentCounts.english_pte_fear,
      percentage: Math.round((intentCounts.english_pte_fear / safeTotal) * 100),
      keyThemes: ["Weak English", "PTE required?", "What if score low?"],
      effectiveCounterStrategy:
        "No English exam or PTE score is required for the Ireland Employer Sponsored Work Visa. TMS provides free English coaching purely to help you impress employers during interviews.",
    },
    {
      intent: "scam_legitimacy_doubt" as CandidateIntentCategory,
      count: intentCounts.scam_legitimacy_doubt,
      percentage: Math.round((intentCounts.scam_legitimacy_doubt / safeTotal) * 100),
      keyThemes: ["Is TMS real?", "Why WhatsApp?", "Show proof"],
      effectiveCounterStrategy:
        "TMS Visa operates with corporate legal registration and 100% money-back service agreements for Ireland applications.",
    },
  ].sort((a, b) => b.count - a.count);

  const frequentQueries = Array.from(frequentQuestionMap.entries())
    .filter(([q, count]) => count >= 2 && q.length > 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({
      query,
      count,
      recommendedSolution: "Address directly in first sentence with transparent €300/€700 milestone facts.",
    }));

  const synthesizedPromptGuidance = `
LEARNED INSTITUTIONAL INTELLIGENCE (IRELAND MIGRATION MODEL - ${totalAnalyzed} MESSAGES):
- #1 CANDIDATE FRICTION: Upfront €300 cost concern. Emphasize employer covers €1,000 permit + flights. Candidate only pays €300 start / €700 after visa in hand.
- #2 CANDIDATE FRICTION: English language concern. Reassure: NO PTE or IELTS required for Ireland work visa at any stage. TMS provides free weekly English communication coaching only to help candidate impress employers during interviews. It is a value-added benefit, not a requirement.
- #3 PATHWAY ADVANTAGE: Stamp 4 PR pathway in 2 years for Critical Skills Employment Permit holders.
- #4 ELIGIBILITY & EXPERIENCE: Ireland 3-way system: CSOL (Critical Skills CSEP — 3-4 months, Stamp 4 in 2 years), IOL (Ineligible — permit cannot be issued), neither (General GEP — 4-5 months). Minimum 2 years of relevant work experience required for both CSEP and GEP.
- LINGUISTIC BALANCE: Keep tone warm, transparent, reassuring, and professional.
`;

  const learnedModel: LearnedKnowledgeModel = {
    version: 1,
    lastTrainedAt: new Date(),
    totalAnalyzedMessages: totalAnalyzed,
    totalAnalyzedSessions: sessions.length,
    topObjections,
    sentimentBreakdown: sentimentCounts,
    linguisticBreakdown: linguisticCounts,
    frequentQueries,
    synthesizedPromptGuidance,
  };

  try {
    await db.collection("whatsapp_ireland_ai_learnings").updateOne(
      { _id: "active_learnings" as any },
      { $set: learnedModel },
      { upsert: true }
    );
  } catch (err) {
    console.warn("[MessageIntelligence Ireland] Failed to save learned knowledge to DB:", err);
  }

  cachedKnowledge = learnedModel;
  lastCacheRefresh = Date.now();
  return learnedModel;
}

export async function getLearnedKnowledge(db?: Db): Promise<LearnedKnowledgeModel | null> {
  const now = Date.now();
  if (cachedKnowledge && now - lastCacheRefresh < CACHE_TTL_MS) {
    return cachedKnowledge;
  }

  if (db) {
    try {
      const doc = await db.collection("whatsapp_ireland_ai_learnings").findOne({ _id: "active_learnings" as any });
      if (doc) {
        cachedKnowledge = doc as unknown as LearnedKnowledgeModel;
        lastCacheRefresh = now;
        return cachedKnowledge;
      }
    } catch (err) {
      console.warn("[MessageIntelligence Ireland] Failed to load learned knowledge from DB:", err);
    }
  }

  return cachedKnowledge;
}

export async function recordCandidateMessageLearning(params: {
  db: Db;
  phone: string;
  text: string;
  senderName?: string;
  session?: WhatsAppSession;
}): Promise<void> {
  const { db, phone, text, session } = params;
  if (!text || text.trim().length < 2) return;

  try {
    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
    const dummySession: WhatsAppSession = session || {
      phone: cleanPhone,
      countryCode: "IE",
      countryName: "Ireland",
      timeZone: "Europe/Dublin",
      timeZoneLabel: "IST/GMT",
      currentStep: "WELCOME",
      followupCount: 0,
      lastInteractionAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      interestedCountry: "Ireland",
    };

    const insight = analyzeCandidateMessage({ message: text, session: dummySession });
    const incObj: Record<string, number> = {
      totalAnalyzedMessages: 1,
      [`intentCounts.${insight.primaryIntent}`]: 1,
      [`sentimentCounts.${insight.sentiment}`]: 1,
      [`linguisticCounts.${insight.linguisticStyle}`]: 1,
    };

    const normalizedQuery = text.trim().slice(0, 140);
    await db.collection("whatsapp_ireland_ai_learnings").updateOne(
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
            $slice: -250,
          },
        } as any,
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("[MessageIntelligence Ireland] recordCandidateMessageLearning failed:", err);
  }
}

export async function autoTrainIfStale(db: Db): Promise<void> {
  try {
    const active = await getLearnedKnowledge(db);
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    if (!active || !active.lastTrainedAt || new Date(active.lastTrainedAt).getTime() < twoHoursAgo) {
      await trainKnowledgeFromCandidateMessages(db);
    }
  } catch (err) {
    console.warn("[MessageIntelligence Ireland] autoTrainIfStale failed:", err);
  }
}

/**
 * Enriches candidate message insights with dynamically synthesized knowledge directives.
 */
export async function getCandidateMessageInsights(params: {
  message: string;
  session: WhatsAppSession;
}): Promise<CandidateMessageInsight> {
  const insight = analyzeCandidateMessage(params);
  if (cachedKnowledge?.synthesizedPromptGuidance) {
    insight.learnedDirectives += `\n${cachedKnowledge.synthesizedPromptGuidance}\n`;
  }
  return insight;
}
