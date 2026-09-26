import { WhatsAppSession } from "./types";
import { TMS_VISA_KNOWLEDGE, FAQ_FALLBACKS } from "./knowledge";
import { findEligibleOccupation } from "./occupations";

/**
 * Generates an intelligent, human-like response tailored to the candidate's exact CRM state.
 */
export async function generateAiResponse(params: {
  message: string;
  session: WhatsAppSession;
}): Promise<string> {
  const { message, session } = params;
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.GEMINI_API_KEY;

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
- Target Visa Pathway: Australia Subclass 482 Skills in Demand Work Visa (Direct Employer Sponsored)
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
- Status: CONFIRMED on the official 691 Australia Subclass 482 Eligible Occupation List.
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
- CRITICAL INSTRUCTION: Candidate's meeting was cancelled. Remind candidate that their consultation was cancelled and encourage them to reschedule for an upcoming weekend (Saturdays & Sundays, 01:00 PM – 09:00 PM IST in 1-hour slots) in their local time.
`;
  }

  if (session.meetingHistory && session.meetingHistory.length > 0) {
    contextBlock += `
MEETING TIMELINE & HISTORY:
${session.meetingHistory.map((h) => `  * [${new Date(h.timestamp).toISOString().split('T')[0]}] ${h.action.toUpperCase()}: ${h.date || ""} ${h.candidateTime || ""} ${h.reason ? `(Reason: ${h.reason})` : ""}`).join("\n")}
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

  // Inject last 15 messages from conversation history for full context
  if (session.conversationHistory && session.conversationHistory.length > 0) {
    const recentHistory = session.conversationHistory.slice(-15); // last 15 messages
    contextBlock += `
RECENT CONVERSATION HISTORY (Last ${recentHistory.length} messages — use this for personalized context):
${recentHistory.map((h, i) => `  [${i + 1}] ${h.role === "candidate" ? "CANDIDATE" : "TMS BOT"} (${h.step}) [${new Date(h.timestamp).toLocaleDateString()}]: "${h.message.slice(0, 200)}"`).join("\n")}

IMPORTANT: Use the conversation history above to:
1. Understand what the candidate has already told you (occupation, experience, goals, family, etc.)
2. Never ask for information the candidate has already provided.
3. Reference their specific details when answering (e.g. "Since you mentioned you're a ${session.occupation || "skilled professional"} with ${session.yearsExperience || "relevant experience"}...")
4. Give fully personalized answers, not generic ones.
`;
  }

  if (session.adminNotes) {
    contextBlock += `
ADMIN NOTES (Internal CRM notes about this candidate):
${session.adminNotes}
`;
  }

  const LENGTH_DIRECTIVE = `
CRITICAL WHATSAPP MESSAGE LENGTH & ZERO CUT-OFF RULES:
- Target length: STRICTLY UNDER 500 CHARACTERS total (approx. 60–80 words).
- DO NOT cut off or leave sentences incomplete! Always finish your sentence, thought, and call-to-action completely.
- Deliver the full, accurate core answer concisely without conversational filler.
- Recommended structure:
  1) Friendly, direct 1-sentence answer.
  2) 2-3 short bullet points with key numbers/facts (e.g. AUD $76,500 salary, AUD 300 + 700 fee, 4-5 months, 691 occupations).
  3) 1 brief closing question or call-to-action.
`;

  if (apiKey) {
    try {
      // 1. Groq Cloud (Primary Engine - Ultra-fast LPU inference via GROQ_API_KEY)
      const groqKey = process.env.GROQ_API_KEY || (apiKey?.startsWith("gsk_") ? apiKey : undefined);
      if (groqKey) {
        const models = [
          process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
          "openai/gpt-oss-120b",
          "openai/gpt-oss-20b",
          "allam-2-7b",
        ];

        for (const model of models) {
          try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${groqKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: `${TMS_VISA_KNOWLEDGE}\n\n${LENGTH_DIRECTIVE}\n\n${contextBlock}` },
                  { role: "user", content: message },
                ],
                max_tokens: 350,
                temperature: 0.5,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const replyText = data.choices?.[0]?.message?.content;
              if (replyText) {
                return replyText.trim();
              }
            } else {
              const errBody = await res.text();
              console.warn(`[WhatsApp AI] Groq (${model}) returned ${res.status}:`, errBody);
            }
          } catch (modelErr) {
            console.warn(`[WhatsApp AI] Groq (${model}) error:`, modelErr);
          }
        }
      }

      // 2. Google Gemini Flash
      if (apiKey.startsWith("AIza") || process.env.GEMINI_API_KEY) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${TMS_VISA_KNOWLEDGE}\n\n${LENGTH_DIRECTIVE}\n\n${contextBlock}\n\nCandidate says: "${message}"\n\nProvide your concise WhatsApp reply as Aria (STRICTLY UNDER 500 CHARACTERS, complete and never cut off):`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 350,
              temperature: 0.5,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const replyText =
            data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            return replyText.trim();
          }
        }
      }

      // 3. OpenAI GPT models
      if (apiKey.startsWith("sk-") || process.env.OPENAI_API_KEY) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: `${TMS_VISA_KNOWLEDGE}\n\n${LENGTH_DIRECTIVE}\n\n${contextBlock}` },
              { role: "user", content: message },
            ],
            max_tokens: 350,
            temperature: 0.5,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const replyText = data.choices?.[0]?.message?.content;
          if (replyText) {
            return replyText.trim();
          }
        }
      }
    } catch (err) {
      console.warn("[WhatsApp AI] Remote API call failed, falling back to local engine:", err);
    }
  }

  // Graceful rule-based context-aware local fallback
  const lower = message.toLowerCase();

  const meetUrl = process.env.GOOGLE_MEET_LINK || "https://meet.google.com/qpj-ntbh-ieu";

  // 1. If candidate is specifically asking for the meeting link / Google Meet link
  const isAskingLink =
    lower.includes("meeting link") ||
    lower.includes("meet link") ||
    lower.includes("google meet") ||
    lower.includes("room link") ||
    lower.includes("where to join") ||
    lower.includes("how to join") ||
    lower.includes("give me link") ||
    lower.includes("send link") ||
    (lower.includes("link") && (lower.includes("meeting") || lower.includes("consultation") || lower.includes("call")));

  if (isAskingLink) {
    if (session.bookedSlot) {
      return (
        `Hi ${session.name || "there"}! 👋\n\n` +
        `Your 1-on-1 consultation is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
        `🔗 **Google Meet Room Link:**\n${meetUrl}\n\n` +
        `*(Tap the link above at your scheduled time to join. Please have your CV ready!)* 🇦🇺`
      );
    } else {
      return (
        `Hello ${session.name || "there"}! 👋\n\n` +
        `Our 1-on-1 consultations are held live on Google Meet with our senior visa expert.\n\n` +
        `🔗 **Official Google Meet Link:**\n${meetUrl}\n\n` +
        `Consultations run on weekends in 1-hour sessions. Would you like to select a slot in your local time?`
      );
    }
  }

  // 1b. If candidate is specifically asking for the video link
  const videoUrl =
    process.env.VIDEO_482_URL ||
    "https://drive.google.com/file/d/17-migz0VwryoP_vLU28NhF1EjNhd570e/view?usp=sharing";

  const isAskingVideoLink =
    lower.includes("video link") ||
    lower.includes("video url") ||
    lower.includes("watch video") ||
    lower.includes("send video") ||
    lower.includes("share video") ||
    lower.includes("give video") ||
    lower.includes("explainer video") ||
    lower.includes("process video") ||
    lower.includes("482 video") ||
    (lower.includes("link") && lower.includes("video")) ||
    (lower.includes("video") &&
      (lower.includes("where") ||
        lower.includes("how") ||
        lower.includes("send") ||
        lower.includes("give") ||
        lower.includes("watch") ||
        lower.includes("share") ||
        lower.includes("can you") ||
        lower.includes("please")));

  if (isAskingVideoLink) {
    return (
      `Here is our Australia Employer Sponsored Work Visa explainer video! 🎥🇦🇺\n\n` +
      `▶️ **Watch the Video:**\n${videoUrl}\n\n` +
      `It covers employer sponsorship, 691 eligible jobs, AUD $76,500+ salary, and PR pathways.\n\n` +
      `*(Tap above to watch anytime)*`
    );
  }

  // If candidate is asking when their meeting is scheduled
  const isAskingMyMeeting =
    lower.includes("my meeting") ||
    lower.includes("my consultation") ||
    lower.includes("my slot") ||
    ((lower.includes("meeting") || lower.includes("consultation")) &&
      (lower.includes("when") || lower.includes("time") || lower.includes("where") || lower.includes("status")));

  if (isAskingMyMeeting && session.bookedSlot) {
    return (
      `Hi ${session.name || "there"}! Your consultation is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
      `🔗 **Join via Google Meet:**\n${meetUrl}\n\n` +
      `Please have your CV ready! 🇦🇺`
    );
  }

  // 1c. If candidate is asking why we need their email or about email usage
  const isAskingAboutEmail =
    lower.includes("why email") ||
    lower.includes("why do you need my email") ||
    lower.includes("why ask email") ||
    lower.includes("why you want email") ||
    lower.includes("send me email") ||
    (lower.includes("email") &&
      (lower.includes("why") || lower.includes("how") || lower.includes("send me") || lower.includes("did you send")));

  if (isAskingAboutEmail) {
    return (
      `We collect your email so our team can officially send your consultation evaluation, migration agreement, and onboarding documents **after your 1-on-1 meeting**! 📧🇦🇺\n\n` +
      `Pre-meeting coordination and Google Meet access are handled on WhatsApp for instant convenience. All official documents are emailed after the call.`
    );
  }

  // 2. Specific questions about out-of-scope topics, other countries, non-work visas, cost, fees, or timeline
  const isOutOfScopeOrFaq =
    lower.includes("canada") ||
    lower.includes("uk") ||
    lower.includes("united kingdom") ||
    lower.includes("usa") ||
    lower.includes("united states") ||
    lower.includes("america") ||
    lower.includes("europe") ||
    lower.includes("germany") ||
    lower.includes("dubai") ||
    lower.includes("new zealand") ||
    lower.includes("tourist") ||
    lower.includes("visitor") ||
    lower.includes("student visa") ||
    lower.includes("study visa") ||
    lower.includes("python") ||
    lower.includes("coding") ||
    lower.includes("homework") ||
    lower.includes("weather") ||
    lower.includes("cost") ||
    lower.includes("fee") ||
    lower.includes("price") ||
    lower.includes("charge") ||
    lower.includes("payment") ||
    lower.includes("pay") ||
    lower.includes("timeline") ||
    lower.includes("how long") ||
    lower.includes("how much time") ||
    lower.includes("duration");

  if (isOutOfScopeOrFaq) {
    for (const faq of FAQ_FALLBACKS) {
      if (faq.keywords.some((k) => lower.includes(k))) {
        return faq.answer;
      }
    }
  }

  // 3. If candidate mentioned a specific eligible occupation from the official 691 list
  if (matchedOcc) {
    return (
      `Great news, ${session.name || "there"}! 🎉\n\n` +
      `**${matchedOcc.role}** is **CONFIRMED ELIGIBLE** under **${matchedOcc.category}** on the official Australian Employer Sponsored Work Visa Eligible Occupation List!\n\n` +
      `With 2+ years experience, you can qualify for employer sponsorship with a minimum **AUD $76,500/year** salary.\n\n` +
      `Would you like to book a free 1-on-1 weekend consultation to assess your CV?`
    );
  }

  // 4. Check remaining general FAQ keywords
  for (const faq of FAQ_FALLBACKS) {
    if (faq.keywords.some((k) => lower.includes(k))) {
      return faq.answer;
    }
  }

  // 5. If consultation is completed and candidate asks about next steps
  if (session.meetingCompleted && (lower.includes("next step") || lower.includes("proceed") || lower.includes("enroll") || lower.includes("agreement"))) {
    return (
      `Hello ${session.name || "there"}! Great having you in the consultation session! 🇦🇺\n\n` +
      `To proceed with your Australian employer sponsorship file, please complete the enrollment steps in your agreement. If you need any assistance with payment details, let us know here!`
    );
  }

  // Generic guidance based on funnel state
  if (!session.email) {
    return (
      `Hello! Welcome to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `We specialize in employer-sponsored work visas for Australia (Australia Employer Sponsored Work Visa). To register your profile in our CRM, **could you please share your Email Address?**`
    );
  }

  // If candidate asks for consultation or general next steps
  if (lower.includes("book") || lower.includes("slot") || lower.includes("call") || lower.includes("consult")) {
    const isIndia = session.countryCode === "IN";
    const timePrompt = isIndia
      ? "between 01:00 PM and 09:00 PM IST"
      : `in your local time (${session.timeZoneLabel})`;
    return (
      `Thank you for contacting The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `Our senior visa expert holds free 1-on-1 consultations this weekend ${timePrompt}.\n\n` +
      `Would you like to select an available time slot?`
    );
  }

  // General conversational greeting fallback
  return (
    `Hello! 👋 Thank you for reaching out to The Migration School (TMS Visa) 🇦🇺.\n\n` +
    `How can I assist you with your Australia Employer Sponsored Work Visa today? Feel free to ask about eligibility, the 5-step process, or booking a free weekend consultation!`
  );
}
