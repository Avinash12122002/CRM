import { WhatsAppSession } from "./types";
import { TMS_VISA_KNOWLEDGE, FAQ_FALLBACKS } from "./knowledge";
import { findEligibleOccupation } from "./occupations";

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
      `I cannot delete any personal data, chat history, or CRM profiles. 🔒\n\n` +
      `Candidates cannot perform data deletion, profile removal, or conversation resets through this chat. All account modifications and data management operations are strictly restricted and handled exclusively by our authorized CRM Administrator for verification and compliance.\n\n` +
      `For official administrative inquiries, please contact our team at info@tmsvisa.com.`
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
      `Under our institutional data protection and compliance protocol, individual staff member personal names (such as Sumit or Abhay) are not shared. 🔒\n\n` +
      `At The Migration School (TMS Visa), your profile is overseen by a structured team of specialists:\n` +
      `• **Aria:** Senior Registered Migration Counselor (your initial guidance & program advisor)\n` +
      `• **Dedicated TMS Recruitment Case Manager:** Allocated immediately upon enrollment to handle your Australian CV makeover, free weekly PTE classes, and direct marketing to approved Australian employers\n` +
      `• **Senior Migration Expert:** Conducts your free 1-on-1 weekend consultation on Google Meet\n` +
      `• **Registered Australian Migration Agent (MARN Holder):** Prepares and lodges your official employer nomination and visa application with the Department of Home Affairs\n\n` +
      `All official communications are coordinated securely via info@tmsvisa.com and recruitment@tmsvisa.com.`
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
- Known Occupation: ${session.occupation || "Not specified yet"}${session.occupationSector ? ` (Sector: ${session.occupationSector})` : ""}
- Current Job Title: ${session.currentJobTitle || "Not specified"}
- Current Employer: ${session.currentEmployer || "Not specified"}
- Work Experience: ${session.yearsExperience || "Not specified yet"}
- Current Salary: ${session.currentSalary || "Not specified"}
- Desired Salary in Australia: ${session.desiredSalary || "Not specified"}
- Educational Qualification: ${session.highestQualification || "Not specified yet"}
- English Language Status: ${session.englishTestStatus || "Preparing with TMS / Pending"}
- Passport Status: ${session.hasPassport === true ? "Has valid passport ✅" : session.hasPassport === false ? "No passport ❌" : "Not specified"}

FUNNEL STATUS:
- Current Funnel Step: ${session.currentStep}
- Meeting Lifecycle Status: ${session.meetingStatus || (session.bookedSlot ? "booked" : "none")}
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

  if (session.bookedSlot) {
    contextBlock += `
ACTIVE CONFIRMED CONSULTATION:
- Date: ${session.bookedSlot.date}
- Candidate Local Time: ${session.bookedSlot.candidateTimeLabel}
- Consultant: TMS Visa Senior Migration Expert
- Status: ${session.meetingStatus || "booked"}
- Rescheduled Count: ${session.meetingRescheduledCount || 0} times
- TIMEZONE RULE: Always state the candidate's time as ${session.bookedSlot.candidateTimeLabel}. Do NOT mention IST to international candidates.
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

  if (session.meetingCompleted || session.meetingStatus === "completed") {
    contextBlock += `
CONSULTATION OUTCOME:
- Status: Consultation Successfully Completed
- Completed On: ${session.meetingCompletedAt ? new Date(session.meetingCompletedAt).toISOString().split('T')[0] : "Recently"}
- CRITICAL INSTRUCTION: The 1-on-1 consultation has ALREADY been completed! Under NO circumstances offer, prompt, or mention booking or rescheduling a meeting. Inform candidate that their file is in onboarding/documentation review.
- Enrollment Payment Status: ${session.paymentPending ? "Pending (Awaiting AUD 300 Initial Service Fee)" : "Settled / In Progress"}
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

  const SYSTEM_PROMPT = `
You are Aria, Senior Registered Migration Counselor at The Migration School (TMS Visa).
You speak like a knowledgeable, warm, empathetic, and authoritative human visa expert.

${TMS_VISA_KNOWLEDGE}

${contextBlock}

RESPONSE DIRECTIVES:
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

3. COMPLETE & ACCURATE INFORMATION (CONCISE, STRUCTURED, NEVER CUT OFF):
- Deliver complete, accurate, and full information with "a little extra" valuable context, but keep it well-structured and concise (under 280 words) for easy WhatsApp reading.
- Key figures to include where relevant:
  * Minimum statutory salary: AUD $76,500/year threshold plus 11.5% superannuation and overtime.
  * Australian employer covers: $330 work permit + $6,000 embassy fees + $1,000 flight ticket to Australia.
  * Candidate fee: Exactly AUD 1,000 total (AUD 300 to start; AUD 700 balance only after visa approval & flight tickets in hand).
  * 3 candidate documents: only Passport copy, Medical Fitness, and Police Clearance (PCC).
  * English requirements: No exam needed to start; TMS provides free weekly PTE coaching from week 1; exam taken after job offer (PTE Academic L:33, R:36, W:29, S:24 or IELTS 5.0).
  * Timeline: 4 to 5 months total from raw CV to visa approval and travel.
  * PR pathway: Direct Australian Permanent Residency (Subclass 186) after 2 years.
  * Rejection guarantee: Direct pre-vetted employer sponsorship ensures work visas with TMS never get rejected.
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
`;

  // 3. Attempt Remote LLM Inference (Groq, Gemini, OpenAI) with 5s timeout
  if (apiKey) {
    try {
      // 3a. Groq Cloud (Primary Engine - Ultra-fast LPU inference)
      const groqKey = process.env.GROQ_API_KEY || (apiKey?.startsWith("gsk_") ? apiKey : undefined);
      if (groqKey) {
        const groqModels = [
          process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          "llama-3.1-8b-instant",
          "gemma2-9b-it",
          "mixtral-8x7b-32768",
        ];

        for (const model of groqModels) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500);

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
                max_tokens: 650,
                temperature: 0.35,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              const replyText = data.choices?.[0]?.message?.content;
              if (replyText && replyText.trim().length > 10) {
                return sanitizeStaffNames(replyText.trim());
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
          const timeoutId = setTimeout(() => controller.abort(), 4500);

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
                      text: `${SYSTEM_PROMPT}\n\nCandidate says: "${rawMsg}"\n\nProvide your WhatsApp reply as Aria (Under 280 words, complete and never cut off):`,
                    },
                  ],
                },
              ],
              generationConfig: {
                maxOutputTokens: 600,
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
              return sanitizeStaffNames(replyText.trim());
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
          const timeoutId = setTimeout(() => controller.abort(), 4500);

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
              max_tokens: 600,
              temperature: 0.35,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const replyText = data.choices?.[0]?.message?.content;
            if (replyText && replyText.trim().length > 10) {
              return sanitizeStaffNames(replyText.trim());
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
  return generateHumanVisaExpertReply({ message: rawMsg, session, matchedOcc });
}

/**
 * Advanced Local Human Visa Expert Cognitive Engine
 * Produces deep, empathetic, and authoritative migration consultation responses.
 */
function generateHumanVisaExpertReply(params: {
  message: string;
  session: WhatsAppSession;
  matchedOcc?: { role: string; category: string } | null;
}): string {
  const { message, session, matchedOcc } = params;
  const lower = message.toLowerCase();
  const candidateName =
    session.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
      ? session.name
      : "";
  const nameSalutation = candidateName ? ` ${candidateName}` : "";

  const meetUrl = process.env.GOOGLE_MEET_LINK || "https://meet.google.com/qpj-ntbh-ieu";
  const videoUrl =
    process.env.VIDEO_482_URL ||
    "https://drive.google.com/file/d/17-migz0VwryoP_vLU28NhF1EjNhd570e/view?usp=sharing";

  // 0A. Inquiries about Bot / AI / Robot / Counselor Identity
  if (
    lower.includes("are you a bot") ||
    lower.includes("are you bot") ||
    lower.includes("are you ai") ||
    lower.includes("are you an ai") ||
    lower.includes("is this ai") ||
    lower.includes("is this bot") ||
    lower.includes("is this automated") ||
    lower.includes("am i talking to a bot") ||
    lower.includes("am i talking to a robot") ||
    lower.includes("robot") ||
    lower.includes("artificial intelligence") ||
    lower.includes("who is this") ||
    lower.includes("who are you") ||
    lower.includes("your name") ||
    lower.includes("who am i talking to")
  ) {
    return (
      `Hello${nameSalutation}! 👋 I'm **Aria**, Senior Registered Migration Counselor at **The Migration School (TMS Visa)** 🇦🇺.\n\n` +
      `You are communicating directly with our official visa guidance desk! I review and coordinate candidate profiles together with our team of Senior Migration Experts and Registered Australian Migration Agents (MARN Holders).\n\n` +
      `We specialize in direct Australian employer-sponsored work visas across 691 eligible occupations with minimum statutory salaries of **AUD $76,500/year** and direct Permanent Residency.\n\n` +
      `How can I assist you with your Australia career and visa roadmap today?`
    );
  }

  // 0B. Contact Origin / "How did you get my number?" / "I never applied" / "Who gave you my number"
  if (
    lower.includes("how did you get my number") ||
    lower.includes("how did you get my contact") ||
    lower.includes("who gave you my number") ||
    lower.includes("where did you get my number") ||
    lower.includes("where did you get my contact") ||
    lower.includes("how do you know me") ||
    lower.includes("why are you messaging me") ||
    lower.includes("who are you to message") ||
    lower.includes("i didn't apply") ||
    lower.includes("i never applied") ||
    lower.includes("did i apply") ||
    lower.includes("not applied")
  ) {
    return (
      `Hello${nameSalutation}! 👋 Thank you for asking.\n\n` +
      `Our recruitment team received your contact profile through our international skilled migration career portal, an overseas employment inquiry, or a registered profile on professional job networks seeking Australian career opportunities.\n\n` +
      `We specialize exclusively in the **Australia Employer Sponsored Work Visa** (minimum statutory salary **AUD $76,500/year**, employer-covered embassy & permit fees, and direct PR after 2 years).\n\n` +
      `If you are not interested in exploring overseas careers in Australia right now, simply reply **"Not Right Now"** and we will not message you again. However, if you have 2+ years of professional or trade experience, we'd be delighted to evaluate your CV for free!`
    );
  }

  // 0C. Frustration, Skepticism, Insults, Abusive Language
  if (
    lower.includes("idiot") ||
    lower.includes("stupid") ||
    lower.includes("fool") ||
    lower.includes("nonsense") ||
    lower.includes("rubbish") ||
    lower.includes("useless") ||
    lower.includes("shut up") ||
    lower.includes("get lost") ||
    lower.includes("fuck") ||
    lower.includes("bitch") ||
    lower.includes("bastard") ||
    lower.includes("bakwas") ||
    lower.includes("pagal") ||
    lower.includes("chutiya")
  ) {
    return (
      `I completely understand your frustration and caution${nameSalutation}. 🤝\n\n` +
      `There is unfortunately a tremendous amount of misinformation and unauthorized operators in the overseas immigration space, so healthy skepticism is completely warranted.\n\n` +
      `Please rest assured that **The Migration School (TMS Visa)** is an institutional, legally compliant consultancy:\n` +
      `• **Australia Registered Office:** 154 Peisley Street, Orange, NSW 2800 (ABN: 75 148 213 076)\n` +
      `• **India Corporate Office:** Delhi NCR (Groworld Vijatour Pvt Ltd, CIN: U62099HR2024PTC122827)\n` +
      `• **Regulated Applications:** Prepared and lodged strictly by **Registered Australian Migration Agents (MARN Holders)**\n` +
      `• **Two-Stage Milestone Safety:** AUD 300 to start; balance AUD 700 payable **strictly after your visa is approved** and flight tickets are in hand.\n\n` +
      `If you would ever like to review your genuine options with our Senior Migration Expert in a live Google Meet consultation, we are here to support you with complete transparency.`
    );
  }

  // 0D. Opt-Out / Stop / Unsubscribe / Don't Message
  if (
    lower === "stop" ||
    lower === "unsubscribe" ||
    lower.includes("don't message") ||
    lower.includes("do not message") ||
    lower.includes("stop messaging") ||
    lower.includes("stop sending") ||
    lower.includes("leave me alone") ||
    lower.includes("remove my number")
  ) {
    return (
      `Understood${nameSalutation}. We have paused all automated outreach for your number (+${session.phone}). 🛑\n\n` +
      `If your career plans change in the future and you would like to explore Australian employer-sponsored work visas, feel free to message us back anytime.\n\n` +
      `Wishing you the very best in your professional endeavors!`
    );
  }

  // 1. Inquiries about meeting link / room access
  if (
    lower.includes("meeting link") ||
    lower.includes("meet link") ||
    lower.includes("google meet") ||
    lower.includes("room link") ||
    lower.includes("where to join") ||
    lower.includes("how to join") ||
    lower.includes("give me link") ||
    lower.includes("send link") ||
    (lower.includes("link") && (lower.includes("meeting") || lower.includes("consultation") || lower.includes("call")))
  ) {
    if (session.bookedSlot) {
      return (
        `Hi${nameSalutation}! 👋\n\n` +
        `Your 1-on-1 consultation with our senior migration expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
        `🔗 **Google Meet Room Link:**\n${meetUrl}\n\n` +
        `*(Tap the link above at your scheduled time to join. Please have your CV ready!)* 🇦🇺`
      );
    }
    return (
      `Hello${nameSalutation}! 👋\n\n` +
      `Our 1-on-1 consultations are held live on Google Meet with our senior visa expert.\n\n` +
      `🔗 **Official Google Meet Link:**\n${meetUrl}\n\n` +
      `Consultations run on weekends in 1-hour sessions. Would you like to select a slot in your local time?`
    );
  }

  // 2. Inquiries about explainer video
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
      `Hello${nameSalutation}! I completely understand your desire to speak live! 📞🇦🇺\n\n` +
      `Because an Australian Employer Sponsored Work Visa assessment requires reviewing your exact occupation code (ANZSCO), CV credentials, salary thresholds, and sponsorship eligibility, our official technical consultations are conducted **1-on-1 on Google Meet**.\n\n` +
      `On Google Meet, our Senior Migration Expert shares their screen, audits your CV directly with you, and walks you through the step-by-step roadmap.\n\n` +
      `Sessions run on Saturdays and Sundays in 1-hour slots in your local time. Would you like to book a weekend session?`
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
      `Great question,${nameSalutation}! Here are the Australian Government age regulations for employer-sponsored visas: 🇦🇺\n\n` +
      `• **Primary Age Window:** Candidates **under 45 years of age** are fully eligible for direct employer sponsorship and the subsequent transition to Permanent Residency (Subclass 186).\n` +
      `• **Age 45 to 50:** Certain specialized regional pathways, high-income threshold earners, and designated skills can qualify for age exemptions.\n` +
      `• **Minimum Age:** At least 18 years of age with 2+ years of verifiable work experience.\n\n` +
      `Australian employers value mature, hands-on experience! Would you like to review your CV in our free weekend consultation?`
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
      `Hello${nameSalutation}! A 4-year university degree is **NOT always mandatory** for Australian employer sponsorship! 🇦🇺\n\n` +
      `• **Trade & Technical Roles (Chefs, Mechanics, Electricians, Fitters, Welders, Technicians):** A Diploma, ITI certificate, or formal apprenticeship combined with 3+ years of verifiable experience is recognized under Australian Recognition of Prior Learning (RPL).\n` +
      `• **White-Collar Roles (Engineers, IT, Finance, Healthcare):** A relevant Bachelor's or Master's degree plus 2+ years of experience is standard.\n\n` +
      `What is your specific job title and how many years of experience do you have? I can check your exact occupation code on the 691 list!`
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
      `Regarding work experience and verification,${nameSalutation}: 💼🇦🇺\n\n` +
      `• **Required Duration:** A minimum of **2 years of full-time verifiable experience** in your nominated occupation is required by Australian immigration law.\n` +
      `• **Verification:** Acceptable proofs include work contracts, experience/service letters, bank statements showing salary credits, tax filings (ITR / Form 16 / GOSI / WPS), or official payslips.\n` +
      `• **Career Gaps:** Brief gaps between jobs are completely acceptable provided you have 2+ cumulative years of verifiable history.\n\n` +
      `Our team helps format your experience into Australian market standards. How many total years do you have in your field?`
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
      `Under Australian immigration law, your salary is legally protected: 💼🇦🇺\n\n` +
      `• **Statutory Minimum Salary (TSMIT):** Australian sponsoring employers are legally required to pay a minimum of **AUD $76,500 per year** (approx. AUD $6,375/month) plus allowances.\n` +
      `• **Superannuation (Retirement Fund):** Employer pays an additional **11.5%** into your Australian retirement fund on top of your base salary.\n` +
      `• **Cost of Living & Savings:** Average monthly living costs for a couple range from AUD $2,500–$3,200, enabling substantial monthly savings.\n` +
      `• **Taxes:** The first AUD $18,200/year is 100% tax-free in Australia, with progressive brackets thereafter.\n\n` +
      `Would you like to schedule a free consultation to review compensation for your occupation?`
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
      `Our financial structure is 100% transparent with zero hidden costs! 🇦🇺\n\n` +
      `💼 **Covered Entirely by Your Australian Sponsoring Employer:**\n` +
      `• **$330** Work Permit / Nomination Fee\n` +
      `• **$6,000** Australian Government Embassy & Visa Fees\n` +
      `• **$1,000** Flight Ticket to Australia\n\n` +
      `👤 **Candidate Total Professional Service Charge: AUD 1,000 Only** (in 2 safe milestones):\n` +
      `1️⃣ **AUD 300 Upfront:** Paid after signing the 1-Year Agreement. Covers profile audit, Australian CV makeover, assigned dedicated TMS Recruitment Case Manager, and free weekly PTE English classes.\n` +
      `2️⃣ **AUD 700 Balance:** Paid **strictly after your visa is approved** and flight tickets are in hand!\n\n` +
      `Our weekend 1-on-1 consultation is completely free. Would you like to schedule your slot?`
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
      `You do NOT need an English test score to begin! 🇦🇺\n\n` +
      `You take the English exam **only after securing your official Australian job offer**.\n\n` +
      `📚 **TMS provides free weekly live PTE classes every weekend from your very first week after joining!**\n\n` +
      `Approved tests and minimum scores across all 4 bands (Listening, Reading, Writing, Speaking):\n` +
      `• **PTE Academic:** L:33, R:36, W:29, S:24 (Very achievable with our coaching)\n` +
      `• **IELTS General / Academic:** 5.0 in each band\n` +
      `• **Exemptions:** Available if you completed 5+ years of secondary/tertiary education taught in English.\n\n` +
      `Have you taken any English test previously?`
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
      `Yes, absolutely! Your entire immediate family can accompany you to Australia! 👨‍👩‍👧‍👦🇦🇺\n\n` +
      `• **Spouse / Partner:** Receives unrestricted full-time work rights in Australia across any company or sector.\n` +
      `• **Children:** Entitled to attend high-standard Australian public schools and access healthcare.\n` +
      `• **Permanent Residency:** When you transition to PR (Subclass 186) after 2 years, your spouse and children receive Australian Permanent Residency together with you.\n\n` +
      `Would you like to discuss your family visa roadmap during our free weekend consultation?`
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
      `Regarding parents and extended family: 🇦🇺\n\n` +
      `• **During Work Visa Stage:** Parents can travel to visit you on long-stay Australian Visitor Visas (Subclass 600) with stay periods of up to 12 months.\n` +
      `• **After Permanent Residency (PR):** Once you transition to Australian Permanent Residency after 2 years, you can officially sponsor your parents for permanent parent visas.\n\n` +
      `Your spouse and dependent children travel directly with you on your work visa from Day 1.`
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
      `Yes! The Australia Employer Sponsored Work Visa provides a direct, legislation-backed pathway to **Australian Permanent Residency (PR Subclass 186)**! 🇦🇺\n\n` +
      `• **2-Year Transition:** After completing 2 years of full-time work with your sponsoring employer, you and your family are eligible to apply for Permanent Residency.\n` +
      `• **PR Benefits:** Subsidized Medicare healthcare, free education, social security, and freedom to live anywhere in Australia.\n` +
      `• **Citizenship:** After holding PR for 12 months (4 years total legal residence), you can apply for Australian Citizenship and an Australian passport.\n\n` +
      `Would you like to review your career pathway with our Senior Migration Expert this weekend?`
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
      `Here is how relocation and accommodation are arranged,${nameSalutation}: ✈️🇦🇺\n\n` +
      `• **Flight Ticket:** Your sponsoring Australian employer covers your flight ticket (worth ~$1,000 AUD) to Australia.\n` +
      `• **Initial Accommodation:** Most sponsoring Australian employers provide initial temporary accommodation (2 to 4 weeks in corporate apartments or hotels) or airport pickup to ensure a smooth transition.\n` +
      `• **Settling In:** Your dedicated TMS Recruitment Case Manager provides pre-departure briefings and guidance on long-term rental leasing in your Australian city.\n\n` +
      `You are supported throughout your journey until you are comfortably settled!`
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
      `You are fully protected under Australian Fair Work Ombudsman legislation with the exact same workplace rights as Australian citizens! 🇦🇺\n\n` +
      `• **Grace Period:** Under updated Australian Migration regulations, if you ever need to change employers, you have a **60 to 180-day grace period** to transfer your sponsorship to another approved sponsor without having to depart Australia.\n` +
      `• **TMS Ongoing Support:** During your 1-Year Professional Services Agreement, TMS assists you with sponsor transfer coordination if necessary.\n` +
      `• **No Bondage:** You are an employee, not bound to unsafe conditions. Australian laws prohibit any exploitative employer practices.`
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
      `I completely appreciate your due diligence,${nameSalutation}! The Migration School (TMS Visa) is a registered migration and recruitment consultancy operating under strict compliance: 🏛️🇦🇺\n\n` +
      `🇦🇺 **Australia Registered Entity:**\n154 Peisley Street, Orange, NSW 2800, Australia | Migration Pty Ltd. (ABN: 75 148 213 076)\n\n` +
      `🇮🇳 **India Corporate Entity:**\nDelhi NCR, India | Groworld Vijatour Pvt. Ltd. (Trade Name: The Migration School, CIN: U62099HR2024PTC122827)\n\n` +
      `• All visa applications are prepared by licensed **Registered Australian Migration Agents (MARN Holders)**.\n` +
      `• Milestone protection: AUD 300 to start; AUD 700 only after visa approval & flight tickets in hand.\n\n` +
      `Would you like to speak face-to-face with our Senior Migration Expert in a Google Meet consultation this weekend?`
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
      `Work visas with TMS **never get rejected**! 🛡️🇦🇺\n\n` +
      `Here is why:\n` +
      `• We do NOT lodge blind applications. We connect you directly with pre-vetted Australian employers who issue government-approved nomination letters.\n` +
      `• Your file is audited and lodged strictly by a **Registered Australian Migration Agent (MARN Holder)** who ensures 100% compliance with Department of Home Affairs regulations before submission.\n` +
      `• Milestone safety: Your balance of AUD 700 is payable **only after** your visa is granted and flight ticket is in hand.`
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
      `As a candidate, you only need to arrange **3 personal documents**: 📄🇦🇺\n\n` +
      `1️⃣ **Valid Passport Copy**\n` +
      `2️⃣ **Medical Fitness Certificate** (completed at an approved Australian Embassy panel clinic)\n` +
      `3️⃣ **Police Clearance Certificate (PCC)**\n\n` +
      `TMS and your sponsoring Australian employer handle all complex company filings, sponsorship approvals, labor market testing, and visa lodgement paperwork with the Australian Government!`
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
      `Our complete process takes approximately **4 to 5 months** from raw CV to visa approval and travel! ⏱️🇦🇺\n\n` +
      `1️⃣ **Step 1 — Raw CV Review:** Free assessment against 691 eligible occupations\n` +
      `2️⃣ **Step 2 — Agreement & Case Manager (AUD 300):** Australian CV makeover, assigned Case Manager, and free weekly PTE classes from Day 1\n` +
      `3️⃣ **Step 3 — Employer Marketing:** TMS presents your profile to approved Australian employers and coordinates interviews until an offer letter is issued\n` +
      `4️⃣ **Step 4 — English Exam & 3 Documents:** Take PTE (prepared by TMS); arrange Passport, Medicals, and PCC\n` +
      `5️⃣ **Step 5 — Sponsorship & Nomination:** Australian employer lodges nomination\n` +
      `6️⃣ **Step 6 — Visa Lodgement & Medicals:** Registered Migration Agent lodges visa\n` +
      `7️⃣ **Step 7 — Visa Grant & Flight Tickets (AUD 700):** Pay final fee only once visa & tickets are in hand!\n\n` +
      `Would you like to schedule a free 1-on-1 consultation to begin?`
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
      `Yes, absolutely! The Australia Employer Sponsored Work Visa is an international recruitment pathway. 🌏🇦🇺\n\n` +
      `Skilled professionals residing across the Gulf (UAE, Saudi Arabia, Qatar, Kuwait, Oman, Bahrain), India, Nepal, Sri Lanka, and worldwide can apply directly from their current location.\n\n` +
      `Employer interviews are held virtually, and visa medicals are completed at your local Australian Embassy-approved VFS center. You fly directly to Australia once approved!\n\n` +
      `What is your occupation and current location?`
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
      `TMS Visa specializes **exclusively in Australia Employer Sponsored Work Visas**! 🇦🇺\n\n` +
      `We focus on Australia because it offers guaranteed minimum statutory wages (AUD $76,500/year), employer-covered embassy fees ($6,000) and flight tickets, full family work rights, and direct Permanent Residency.\n\n` +
      `We do not process tourist or student visas. If you have 2+ years of professional or trade experience, we would love to assess your CV for Australia!`
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
      `Namaste${nameSalutation}! Hum bilkul aapki poori madad karenge. 🇦🇺\n\n` +
      `Australia Employer Sponsored Work Visa ek direct employment visa hai jisme Australian company aapko sponsor karti hai:\n` +
      `• **Minimum Salary:** AUD $76,500/year (approx ₹42–45 Lakhs saal ka)\n` +
      `• **Employer Kharcha Uthata Hai:** $6,000 embassy fees, $330 work permit aur flight ticket\n` +
      `• **Aapka Fee:** Sirf AUD 1,000 total (AUD 300 shuru me aur AUD 700 visa aur ticket aane ke baad)\n` +
      `• **Family:** Wife ko full work rights aur bachho ki padhai free/subsidized hoti hai\n` +
      `• **PR:** 2 saal kaam karne ke baad permanent residency (PR) milti hai.\n\n` +
      `Aapka profession kya hai aur kitne saal ka experience hai?`
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
      `Australia's official Employer Sponsored Eligible Occupation List encompasses **691 approved occupations** with guaranteed statutory minimum salaries of **AUD $76,500/year** (approx ₹42–45 Lakhs): 🇦🇺📋\n\n` +
      `Key high-demand industry sectors include:\n` +
      `• **Trades & Technical:** Auto Mechanics, Diesel Fitters, Electricians, Welders, Carpenters, Chefs, Cooks, Bakers, HVAC Technicians, Plumbers\n` +
      `• **Engineering & Construction:** Civil, Mechanical, Electrical, Mining, Structural Engineers, Site Supervisors, Project Managers\n` +
      `• **IT & Software:** Software Developers, Cloud Architects, Cyber Security Specialists, Network Engineers, Systems Analysts\n` +
      `• **Healthcare & Social Care:** Registered Nurses, Aged Care, Physiotherapists, Medical Technologists\n` +
      `• **Hospitality & Agriculture:** Hotel/Restaurant Managers, Farm Supervisors, Food Technologists\n\n` +
      `Sponsoring employers cover $6,000 embassy fees, $330 work permit fees, and flight tickets.\n\n` +
      `What is your exact trade or profession and how many years of experience do you have? I can look up your exact ANZSCO occupation code!`
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
      `Regarding experience requirements,${nameSalutation}: 💼🇦🇺\n\n` +
      `Under Australian Department of Home Affairs regulations, direct employer-sponsored work visas require a minimum of **2 years of full-time verifiable work experience** in your nominated occupation.\n\n` +
      `• **If you have less than 2 years:** We recommend accumulating 2 continuous years in your field with verifiable proof (payslips, service letters, or bank salary deposits) before applying.\n` +
      `• **Alternative:** If you are a recent graduate, Australian higher education or student visa pathways can be explored to gain Australian work rights and graduate visas.\n\n` +
      `How many months or years of practical experience, apprenticeships, or internships do you currently have?`
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
      `You do not need a passport in hand right this moment to get started! 🛂🇦🇺\n\n` +
      `• **Immediate Action:** We can begin your initial CV evaluation against the 691 eligible occupations, Australian CV makeover, and free weekly live PTE coaching immediately.\n` +
      `• **Timeline:** The complete process takes **4 to 5 months**. A valid passport is only required when your approved Australian employer lodges your formal visa nomination with the Department of Home Affairs.\n\n` +
      `You can apply for a new or Tatkal/expedited passport at your local passport office in parallel while our team works on your profile!`
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
      `Please do not worry at all about English! 📚🇦🇺\n\n` +
      `• **No Exam Needed Now:** You do NOT need any test score to begin with TMS. The exam is taken only AFTER you receive your official Australian job offer!\n` +
      `• **Free Weekly Live Classes:** TMS provides free weekly live PTE classes every weekend from your very first week after joining.\n` +
      `• **Easily Achievable Requirement:** The required score under employer sponsorship is very modest:\n` +
      `  - **PTE Academic:** Listening: 33, Reading: 36, Writing: 29, Speaking: 24 (most candidates pass easily within 2–3 weeks of our targeted coaching!)\n` +
      `  - **IELTS General:** 5.0 in each band.\n\n` +
      `Our trainers give you exact proven templates, scoring shortcuts, and mock evaluations so you pass on your first attempt!`
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
      `Here is the clear strategic difference between Direct PR (189/190) and the Employer Sponsored Work Visa: 🇦🇺🎯\n\n` +
      `• **Point-Tested PR (Subclass 189/190):** Requires 85–95+ points based on age, superior English (IELTS 8+), full skill assessments, and state invitation rounds that can take 1 to 3 years with zero guarantee of selection.\n` +
      `• **Employer Sponsored Work Visa:** **NO points test, NO lottery, NO waiting for invites!** You are hired directly by a pre-vetted Australian employer with a guaranteed minimum statutory salary of **AUD $76,500/year** plus superannuation.\n` +
      `• **Guaranteed PR Conversion (Subclass 186):** After 2 years of working with your Australian sponsor, you and your family transition directly to Australian Permanent Residency!\n\n` +
      `It is the fastest and most secure route to settle in Australia with a guaranteed job from Day 1.`
    );
  }

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
      `**The Migration School (TMS Visa)** is an international migration consultancy specializing in Australian Employer Sponsored Work Visas: 🏛️🇦🇺\n\n` +
      `• **Australia Registered Office:** 154 Peisley Street, Orange, NSW 2800, Australia | Migration Pty Ltd (ABN: 75 148 213 076)\n` +
      `• **India Corporate Office:** Delhi NCR | Groworld Vijatour Pvt Ltd (Trade Name: The Migration School, CIN: U62099HR2024PTC122827)\n` +
      `• **Legal Compliance:** All filings are audited and lodged strictly by licensed **Registered Australian Migration Agents (MARN Holders)**\n` +
      `• **Track Record:** Direct corporate employer partnerships across Australia ensuring zero visa rejection track record\n` +
      `• **Transparent Milestones:** AUD 300 to begin; AUD 700 balance only after visa approval & flight tickets in hand.\n\n` +
      `Would you like to schedule a free 1-on-1 consultation on Google Meet with our Senior Migration Expert this weekend?`
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
    return (
      `Wonderful,${nameSalutation}! Here is how you take the next step: 🇦🇺🚀\n\n` +
      `1️⃣ **Share Your Current Occupation & Years of Experience:** I will immediately check your ANZSCO code on the official 691 Australia Employer Sponsored Eligible list.\n` +
      `2️⃣ **Send Your CV / Resume:** You can attach your PDF or Word CV right here in WhatsApp for our senior migration specialists to audit.\n` +
      `3️⃣ **Free Weekend 1-on-1 Consultation:** We schedule a live Google Meet with our Senior Migration Expert to present your custom 4-5 month migration roadmap.\n\n` +
      `What is your current job title and how many years of experience do you have?`
    );
  }

  // 22. If candidate mentioned an eligible occupation from the official 691 list
  if (matchedOcc) {
    return (
      `Great news${nameSalutation}! 🎉\n\n` +
      `**${matchedOcc.role}** is **CONFIRMED ELIGIBLE** under **${matchedOcc.category}** on the official Australian Employer Sponsored Work Visa Eligible Occupation List!\n\n` +
      `With 2+ years experience, you can qualify for direct employer sponsorship with a minimum statutory salary of **AUD $76,500/year** plus superannuation.\n\n` +
      `Approved Australian employers cover $6,000 embassy fees, $330 permit fees, and flight tickets, with direct PR after 2 years.\n\n` +
      `Would you like to book a free 1-on-1 weekend consultation to review your CV?`
    );
  }

  // 23. Check general FAQ fallback keywords
  for (const faq of FAQ_FALLBACKS) {
    if (faq.keywords.some((k) => lower.includes(k))) {
      return faq.answer;
    }
  }

  // 24. If consultation is completed and candidate asks about next steps
  if (session.meetingCompleted || session.meetingStatus === "completed") {
    return (
      `Hello${nameSalutation}! Great having you in the consultation session! 🇦🇺\n\n` +
      `Your Australia Employer Sponsored Work Visa profile is currently in our onboarding review. Our recruitment team evaluates your CV against active employer vacancies with minimum AUD $76,500+ statutory salaries.\n\n` +
      `If you have any questions about documentation, agreement terms, or PTE preparation, feel free to reply right here!`
    );
  }

  // 25. If candidate is awaiting consultation decision or selecting slots
  if (session.currentStep === "SELECTING_DAY" || session.currentStep === "SELECTING_SLOT") {
    return (
      `Hello${nameSalutation}! 👋\n\n` +
      `I'm here to assist you with every aspect of your Australia Employer Sponsored Work Visa file.\n\n` +
      `You can choose your preferred weekend consultation slot from the interactive menu above, or let me know what questions you have about eligible jobs, salaries, or the 4-5 month timeline!`
    );
  }

  // 26. General human visa expert answer for open-ended or out-of-context questions
  return (
    `Hello${nameSalutation}! 👋 I'm **Aria**, Senior Registered Migration Counselor at **The Migration School (TMS Visa)** 🇦🇺.\n\n` +
    `We specialize in direct employer-sponsored work visas for Australia across 691 in-demand occupations with a minimum statutory salary of **AUD $76,500/year** plus superannuation.\n\n` +
    `• **Zero Rejection Track Record:** Pre-vetted corporate employer sponsorship\n` +
    `• **Employer Covers:** $6,000 embassy fees, $330 permit fees, and flight tickets\n` +
    `• **Candidate Fee:** AUD 300 to start; AUD 700 only after visa approval\n` +
    `• **PR Pathway:** Direct transition to Australian Permanent Residency (PR 186) after 2 years\n\n` +
    `Could you tell me your occupation and how many years of work experience you have? I'd be delighted to evaluate your eligibility!`
  );
}
