import { Db } from "mongodb";
import { detectCountryFromPhone } from "./timezone";

export interface LogWhatsAppIrelandMessageParams {
  db: Db;
  phone: string;
  sender: "candidate" | "admin" | "bot";
  senderName?: string;
  text: string;
  msgType?: "text" | "interactive_button" | "interactive_list" | "document" | "image" | "video";
  mediaUrl?: string;
  mediaFileName?: string;
  buttons?: Array<{ id: string; title: string }>;
  messageId?: string;
  createdAt?: Date;
}

/**
 * Unified logger for all Ireland WhatsApp incoming & outgoing messages.
 * Stores every message in `whatsapp_ireland_messages`, updates `whatsapp_ireland_sessions`,
 * and manages candidate unread badges. Completely isolated from Australia.
 */
export async function logWhatsAppIrelandMessage(params: LogWhatsAppIrelandMessageParams): Promise<void> {
  const {
    db,
    phone,
    sender,
    senderName,
    text,
    msgType = "text",
    mediaUrl,
    mediaFileName,
    buttons,
    messageId,
    createdAt = new Date(),
  } = params;

  const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
  if (!cleanPhone || cleanPhone.length < 8) return;

  const messageDoc = {
    phone: cleanPhone,
    sender,
    senderName: senderName || (sender === "candidate" ? "Candidate" : sender === "bot" ? "TMS Automation (Ireland)" : "Admin"),
    text: text.trim(),
    msgType,
    mediaUrl: mediaUrl || null,
    mediaFileName: mediaFileName || null,
    buttons: buttons || null,
    messageId: messageId || null,
    createdAt,
  };

  try {
    // 0. Deduplication check: prevent multiple logs of the same dispatch
    if (messageId) {
      const existing = await db.collection("whatsapp_ireland_messages").findOne({ messageId });
      if (existing) {
        if (existing.sender === "bot" && sender === "admin") {
          await db.collection("whatsapp_ireland_messages").updateOne(
            { _id: existing._id },
            { $set: { sender: "admin", senderName: messageDoc.senderName } }
          );
        }
        return;
      }
    }

    if (sender !== "candidate") {
      const recentThreshold = new Date(createdAt.getTime() - 4000);
      const recentDuplicate = await db.collection("whatsapp_ireland_messages").findOne({
        phone: cleanPhone,
        sender,
        text: text.trim(),
        createdAt: { $gte: recentThreshold },
      });

      if (recentDuplicate) {
        if (recentDuplicate.sender === "bot" && sender === "admin") {
          await db.collection("whatsapp_ireland_messages").updateOne(
            { _id: recentDuplicate._id },
            { $set: { sender: "admin", senderName: messageDoc.senderName } }
          );
        }
        return;
      }
    }

    // 1. Insert into unified messages collection
    await db.collection("whatsapp_ireland_messages").insertOne(messageDoc);

    // 2. Update conversation session summary
    const updateQuery: Record<string, unknown> = {
      lastMessage: text.trim(),
      lastMessageAt: createdAt,
      lastSender: sender,
      lastMsgType: msgType,
      updatedAt: createdAt,
    };

    if (sender === "candidate") {
      const countryInfo = detectCountryFromPhone(cleanPhone);
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        {
          $set: updateQuery,
          $inc: { unreadCount: 1 },
          $setOnInsert: {
            phone: cleanPhone,
            name: senderName || "Candidate",
            countryCode: countryInfo.countryCode,
            countryName: countryInfo.countryName,
            interestedCountry: "Ireland",
            timeZone: countryInfo.timeZone,
            timeZoneLabel: countryInfo.label,
            currentStep: "WELCOME",
            followupCount: 0,
            lastInteractionAt: createdAt,
            createdAt,
          },
          $push: {
            conversationHistory: {
              $each: [
                {
                  role: "candidate",
                  message: text.trim(),
                  timestamp: createdAt,
                  step: "CANDIDATE_MSG",
                },
              ],
              $slice: -40,
            } as any,
          },
        },
        { upsert: true }
      );

      // Automatically learn from this candidate message and incrementally train intelligence
      import("./messageIntelligence")
        .then(({ recordCandidateMessageLearning }) => {
          recordCandidateMessageLearning({
            db,
            phone: cleanPhone,
            text,
            senderName: messageDoc.senderName,
          }).catch((learnErr) =>
            console.warn("[MessageLogger Ireland] Candidate learning hook error:", learnErr)
          );
        })
        .catch((importErr) =>
          console.warn("[MessageLogger Ireland] Failed to import messageIntelligence:", importErr)
        );
    } else {
      const countryInfo = detectCountryFromPhone(cleanPhone);
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        {
          $set: updateQuery,
          $push: {
            conversationHistory: {
              $each: [
                {
                  role: "system",
                  message: text.trim(),
                  timestamp: createdAt,
                  step: sender === "admin" ? "ADMIN_MSG" : "BOT_MSG",
                },
              ],
              $slice: -40,
            } as any,
          },
          $setOnInsert: {
            createdAt,
            name: "Candidate",
            countryCode: countryInfo.countryCode,
            countryName: countryInfo.countryName,
            interestedCountry: "Ireland",
            timeZone: countryInfo.timeZone,
            timeZoneLabel: countryInfo.label,
            currentStep: "WELCOME",
            followupCount: 0,
            unreadCount: 0,
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error(`[WhatsApp Ireland MessageLogger Error] +${cleanPhone}:`, err);
  }
}
