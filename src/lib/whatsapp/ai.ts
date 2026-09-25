import { WhatsAppSession } from "./types";
import { TMS_VISA_KNOWLEDGE, FAQ_FALLBACKS } from "./knowledge";

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

  // Build candidate live context
  let contextBlock = `
CANDIDATE LIVE CRM PROFILE:
- Name: ${session.name || "Candidate"}
- Phone: +${session.phone}
- Location: ${session.countryName} (${session.timeZoneLabel})
- Email: ${session.email || "Not shared yet"}
- Current Funnel State: ${session.currentStep}
`;

  if (session.bookedSlot) {
    contextBlock += `
- MEETING WITH SENIOR VISA EXPERT:
  * Status: Confirmed & Scheduled
  * Date: ${session.bookedSlot.date}
  * Candidate Local Time: ${session.bookedSlot.candidateTimeLabel}
  * India IST Time: ${session.bookedSlot.istTimeLabel}
  * Consultant: TMS Visa Senior Migration Expert
`;
  }

  if (session.meetingCompleted) {
    contextBlock += `
- MEETING STATUS: Completed.
  * Status: Consultation Completed
  * PAYMENT STATUS: ${session.paymentPending ? "Pending (Awaiting Enrollment Payment)" : "Settled / In Progress"}
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
                max_tokens: 500,
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
                    text: `${TMS_VISA_KNOWLEDGE}\n\n${contextBlock}\n\nCandidate says: "${message}"\n\nProvide your concise WhatsApp reply as Aria:`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 500,
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
            max_tokens: 500,
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

  // 1. Check general FAQ keywords first so questions like "how much time" or "what is the cost" get exact answers
  for (const faq of FAQ_FALLBACKS) {
    if (faq.keywords.some((k) => lower.includes(k))) {
      return faq.answer;
    }
  }

  // 2. If candidate is specifically asking about their booked meeting schedule/link
  const isAskingMyMeeting =
    lower.includes("my meeting") ||
    lower.includes("meeting link") ||
    lower.includes("my consultation") ||
    lower.includes("my slot") ||
    ((lower.includes("meeting") || lower.includes("consultation")) &&
      (lower.includes("when") || lower.includes("time") || lower.includes("link") || lower.includes("where") || lower.includes("status")));

  if (isAskingMyMeeting && session.bookedSlot) {
    return (
      `Hi ${session.name || "there"}! Your 1-on-1 consultation with our senior visa expert is confirmed for **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**.\n\n` +
      `You can join via your Google Meet room link. Please have your CV ready! 🇦🇺`
    );
  }

  // 3. If consultation is completed and candidate asks about next steps
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
      `We specialize in employer-sponsored work visas for Australia (Subclass 482). To check your eligibility and send you our detailed 482 sponsorship guide and video, **could you please share your Email Address?**`
    );
  }

  // If candidate asks for consultation or general next steps
  if (lower.includes("book") || lower.includes("slot") || lower.includes("call") || lower.includes("consult")) {
    return (
      `Thank you for contacting The Migration School (TMS Visa) 🇦🇺.\n\n` +
      `Our senior visa expert is conducting free 30-minute 1-on-1 consultations this weekend between 11:00 AM and 07:00 PM IST (converted to your local time: ${session.timeZoneLabel}). Would you like to select an available slot?`
    );
  }

  // General conversational greeting fallback
  return (
    `Hello! 👋 Thank you for reaching out to The Migration School (TMS Visa) 🇦🇺.\n\n` +
    `How can I assist you with your Australia Subclass 482 Work Visa inquiry today? Feel free to ask about eligibility requirements, the 5-step process, or booking a free weekend consultation!`
  );
}
