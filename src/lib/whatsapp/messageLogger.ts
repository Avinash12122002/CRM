import { Db } from "mongodb";
import { detectCountryFromPhone } from "./timezone";

export interface LogWhatsAppMessageParams {
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
 * Unified logger for all WhatsApp incoming & outgoing messages.
 * Stores every message in `whatsapp_messages`, updates `whatsapp_sessions`,
 * and manages candidate unread badges.
 */
export async function logWhatsAppMessage(params: LogWhatsAppMessageParams): Promise<void> {
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
    senderName: senderName || (sender === "candidate" ? "Candidate" : sender === "bot" ? "TMS Automation" : "Admin"),
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
      const existing = await db.collection("whatsapp_messages").findOne({ messageId });
      if (existing) {
        if (existing.sender === "bot" && sender === "admin") {
          await db.collection("whatsapp_messages").updateOne(
            { _id: existing._id },
            { $set: { sender: "admin", senderName: messageDoc.senderName } }
          );
        }
        return;
      }
    }

    // NEVER drop candidate messages by text comparison! Candidates can legitimately send repeat messages or match bot prompts.
    // Only deduplicate bot/admin outbound messages if dispatched to the same phone with identical text within 4 seconds.
    if (sender !== "candidate") {
      const recentThreshold = new Date(createdAt.getTime() - 4000);
      const recentDuplicate = await db.collection("whatsapp_messages").findOne({
        phone: cleanPhone,
        sender,
        text: text.trim(),
        createdAt: { $gte: recentThreshold },
      });

      if (recentDuplicate) {
        if (recentDuplicate.sender === "bot" && sender === "admin") {
          await db.collection("whatsapp_messages").updateOne(
            { _id: recentDuplicate._id },
            { $set: { sender: "admin", senderName: messageDoc.senderName } }
          );
        }
        return;
      }
    }

    // 1. Insert into unified messages collection
    await db.collection("whatsapp_messages").insertOne(messageDoc);

    // 2. Update conversation session summary
    const updateQuery: Record<string, unknown> = {
      phone: cleanPhone,
      lastMessage: text.trim(),
      lastMessageAt: createdAt,
      lastSender: sender,
      lastMsgType: msgType,
      updatedAt: createdAt,
    };

    if (sender === "candidate" && senderName && senderName !== "Candidate" && !senderName.toLowerCase().includes("test")) {
      updateQuery.name = senderName;
    }

    if (sender === "candidate") {
      // Increment unread count for admin review
      const detectedCountry = detectCountryFromPhone(cleanPhone);
      await db.collection("whatsapp_sessions").updateOne(
        { phone: cleanPhone },
        {
          $set: updateQuery,
          $inc: { unreadCount: 1 },
          $push: {
            conversationHistory: {
              $each: [
                {
                  role: "candidate",
                  message: text.trim(),
                  timestamp: createdAt,
                  step: "LIVE",
                },
              ],
              $slice: -30,
            },
          } as any,
          $setOnInsert: {
            createdAt,
            name: senderName && senderName !== "Candidate" ? senderName : "Candidate",
            countryCode: detectedCountry.countryCode,
            countryName: detectedCountry.countryName,
            timeZone: detectedCountry.timeZone,
            timeZoneLabel: detectedCountry.label,
            currentStep: "WELCOME",
            followupCount: 0,
          },
        },
        { upsert: true }
      );
    } else {
      // Outgoing message (bot or admin)
      const detectedCountryOut = detectCountryFromPhone(cleanPhone);
      await db.collection("whatsapp_sessions").updateOne(
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
                  step: "LIVE",
                },
              ],
              $slice: -30,
            },
          } as any,
          $setOnInsert: {
            createdAt,
            countryCode: detectedCountryOut.countryCode,
            countryName: detectedCountryOut.countryName,
            timeZone: detectedCountryOut.timeZone,
            timeZoneLabel: detectedCountryOut.label,
            currentStep: "WELCOME",
            followupCount: 0,
            unreadCount: 0,
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn(`[WhatsApp Logger] Failed to record message for +${cleanPhone}:`, err);
  }
}
