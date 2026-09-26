import { Db } from "mongodb";

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

    if (sender === "candidate") {
      // Increment unread count for admin review
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
              $slice: -30, // Keep last 30 messages in session context for AI
            },
          } as any,
          $setOnInsert: {
            createdAt,
            countryCode: cleanPhone.startsWith("91") ? "IN" : "",
            countryName: cleanPhone.startsWith("91") ? "India" : "",
            timeZone: cleanPhone.startsWith("91") ? "Asia/Kolkata" : "UTC",
            timeZoneLabel: cleanPhone.startsWith("91") ? "IST (India Standard Time)" : "Local Time",
            currentStep: "WELCOME",
            followupCount: 0,
          },
        },
        { upsert: true }
      );
    } else {
      // Outgoing message (bot or admin)
      await db.collection("whatsapp_sessions").updateOne(
        { phone: cleanPhone },
        {
          $set: updateQuery,
          $push: {
            conversationHistory: {
              $each: [
                {
                  role: "assistant",
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
            countryCode: cleanPhone.startsWith("91") ? "IN" : "",
            countryName: cleanPhone.startsWith("91") ? "India" : "",
            timeZone: cleanPhone.startsWith("91") ? "Asia/Kolkata" : "UTC",
            timeZoneLabel: cleanPhone.startsWith("91") ? "IST (India Standard Time)" : "Local Time",
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
