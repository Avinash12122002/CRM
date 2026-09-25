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
    process.env.AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY;

  const matchedOcc = findEligibleOccupation(message);

  // Build rich candidate live profile
  let contextBlock = `
CANDIDATE LIVE CRM PROFILE & DOSSIER:
- Candidate Name: ${session.name || "Candidate"}
- Phone Number: +${session.phone}
- Email Address: ${session.email || "Not shared yet"}
- Country of Residence: ${session.countryName} (${session.timeZoneLabel})
- Destination of Interest: ${session.interestedCountry || "Australia"}
- Target Visa Pathway: Australia Subclass 482 Skills in Demand Work Visa (Direct Employer Sponsored)
- Known Occupation: ${session.occupation || "Not specified yet"}${session.occupationSector ? ` (Sector: ${session.occupationSector})` : ""}
- Work Experience: ${session.yearsExperience || "Not specified yet"}
- Educational Qualification: ${session.highestQualification || "Not specified yet"}
- English Language Status: ${session.englishTestStatus || "Preparing with TMS / Pending"}
- Funnel State: ${session.currentStep}
- Meeting Lifecycle Status: ${session.meetingStatus || (session.bookedSlot ? "booked" : "none")}
`;

  if (matchedOcc) {
    contextBlock += `
- INQUIRED OCCUPATION MATCH:
  * Role: "${matchedOcc.role}"
  * Sector: "${matchedOcc.category}"
  * Status: CONFIRMED on the official 691 Australia Subclass 482 Eligible Occupation List.
  * Instruction: Confidently confirm to the candidate that their role "${matchedOcc.role}" is on the official list under ${matchedOcc.category}!
`;
  }

  if (session.bookedSlot) {
    contextBlock += `
- ACTIVE CONFIRMED CONSULTATION:
  * Date: ${session.bookedSlot.date}
  * Candidate Local Time: ${session.bookedSlot.candidateTimeLabel}
  * Consultant: TMS Visa Senior Migration Expert
  * Status: ${session.meetingStatus || "booked"}
  * Rescheduled Count: ${session.meetingRescheduledCount || 0} times
  * TIMEZONE RULE: Always state the candidate's time as ${session.bookedSlot.candidateTimeLabel}. Do NOT mention IST to international candidates.
`;
  } else if (session.meetingStatus === "canceled") {
    contextBlock += `
- CONSULTATION CANCELLATION DETAILS:
  * Status: Canceled
  * Canceled At: ${session.meetingCanceledAt ? new Date(session.meetingCanceledAt).toISOString().split('T')[0] : "Recently"}
  * Reason: ${session.meetingCancellationReason || "Requested by candidate"}
  * Note: Candidate can rebook anytime for a weekend slot in their local time.
`;
  }

  if (session.meetingHistory && session.meetingHistory.length > 0) {
    contextBlock += `
- MEETING TIMELINE & HISTORY:
${session.meetingHistory.map((h) => `  * [${new Date(h.timestamp).toISOString().split('T')[0]}] ${h.action.toUpperCase()}: ${h.date || ""} ${h.candidateTime || ""} ${h.reason ? `(Reason: ${h.reason})` : ""}`).join("\n")}
`;
  }

  if (session.meetingCompleted) {
    contextBlock += `
- CONSULTATION OUTCOME:
  * Status: Consultation Successfully Completed
  * Completed On: ${session.meetingCompletedAt ? new Date(session.meetingCompletedAt).toISOString().split('T')[0] : "Recently"}
  * Enrollment Payment Status: ${session.paymentPending ? "Pending (Awaiting AUD 300 Initial Service Fee)" : "Settled / In Progress"}
`;
  }

  if (apiKey) {
    try {
      // 1. Groq (Ultra-fast, uses key already in .env)
      if (apiKey.startsWith("gsk_") || process.env.GROQ_API_KEY) {
        const groqKey = apiKey.startsWith("gsk_") ? apiKey : process.env.GROQ_API_KEY;
        const models = [
          process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
          "openai/gpt-oss-120b",
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
                  { role: "system", content: `${TMS_VISA_KNOWLEDGE}\n\n${contextBlock}` },
                  { role: "user", content: message },
                ],
                max_tokens: 1500,
                temperature: 0.7,
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
                    text: `${TMS_VISA_KNOWLEDGE}\n\n${contextBlock}\n\nCandidate says: "${message}"\n\nProvide your complete WhatsApp reply as Aria:`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1500,
              temperature: 0.7,
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
              { role: "system", content: `${TMS_VISA_KNOWLEDGE}\n\n${contextBlock}` },
              { role: "user", content: message },
            ],
            max_tokens: 1500,
            temperature: 0.7,
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
        `Your 1-on-1 consultation with our senior visa expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
        `🔗 **Google Meet Room Link:**\n${meetUrl}\n\n` +
        `*(Tap the link above at your scheduled time to join the call. Please have your CV ready!)* 🇦🇺`
      );
    } else {
      return (
        `Hello ${session.name || "there"}! 👋\n\n` +
        `Our 1-on-1 consultations are held live on Google Meet with our senior visa expert.\n\n` +
        `🔗 **Official Google Meet Link:**\n${meetUrl}\n\n` +
        `Consultations are scheduled on Saturdays and Sundays in 30-minute intervals. Would you like to select an available time slot in your local time?`
      );
    }
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
      `Hi ${session.name || "there"}! Your 1-on-1 consultation with our senior visa expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
      `🔗 **Join via Google Meet:**\n${meetUrl}\n\n` +
      `Please have your CV ready! 🇦🇺`
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
      `**${matchedOcc.role}** is **CONFIRMED ELIGIBLE** under **${matchedOcc.category}** on the official Australian Subclass 482 Skills in Demand Eligible Occupation List (691 Roles)!\n\n` +
      `With at least 2 years of verifiable full-time work experience, you can qualify for Australian employer sponsorship with a minimum salary threshold of **AUD $76,500/year**.\n\n` +
      `Would you like to book a free 30-minute 1-on-1 consultation this weekend with our senior visa expert to assess your CV?`
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
      `Hello ${session.name || "there"}! It was great having you in the consultation session with our visa expert.\n\n` +
      `To proceed with your Australian employer sponsorship file, please complete the enrollment steps outlined in your agreement. If you need any assistance with payment details, let us know here!`
    );
  }

  // Generic guidance based on funnel state
  if (!session.email) {
    return (
      `Hello! Welcome to The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `We specialize in employer-sponsored work visas for Australia (Subclass 482). To register your profile in our CRM system and review your eligibility, **could you please share your Email Address?**`
    );
  }

  // If candidate asks for consultation or general next steps
  if (lower.includes("book") || lower.includes("slot") || lower.includes("call") || lower.includes("consult")) {
    const isIndia = session.countryCode === "IN";
    const timePrompt = isIndia
      ? "between 11:00 AM and 07:00 PM IST"
      : `in your local time (${session.timeZoneLabel})`;
    return (
      `Thank you for contacting The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `Our senior visa expert is conducting free 30-minute 1-on-1 consultations this weekend ${timePrompt}. Would you like to select an available slot?`
    );
  }

  // General conversational greeting fallback
  return (
    `Hello! 👋 Thank you for reaching out to The Migration School (TMS Visa) 🇦🇺.\n\n` +
    `How can I assist you with your Australia Subclass 482 Work Visa inquiry today? Feel free to ask about eligibility requirements, the 5-step process, or booking a free weekend consultation!`
  );
}
