import { NextRequest, NextResponse } from "next/server";
import { processIncomingWhatsAppMessage } from "@/lib/whatsapp/stateMachine";

/**
 * GET: Meta Webhook Verification Handshake
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken =
    process.env.WHATSAPP_VERIFY_TOKEN || "TMS_WHATSAPP_TOKEN_2026";

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[WhatsApp Webhook] Handshake verified successfully!");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST: Incoming Message Events from Meta Cloud API
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const entries = body?.entry || [];
    let processedCount = 0;

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages || [];
        const contact = value?.contacts?.[0];
        const defaultSenderName = contact?.profile?.name || "Candidate";

        for (const message of messages) {
          if (!message || !message.from) continue;

          const rawPhone = String(message.from || "");
          const phone = rawPhone.replace(/[^\d]/g, "").replace(/^00/, "");
          const senderName = defaultSenderName;
          const msgType = message.type;

          let textBody: string | undefined = undefined;
          let selectedId: string | undefined = undefined;
          let type: "text" | "interactive_button" | "interactive_list" | "document" | "image" | "video" = "text";

          if (msgType === "text") {
            textBody = message.text?.body;
            type = "text";
          } else if (msgType === "interactive") {
            const interactive = message.interactive;
            if (interactive?.type === "button_reply") {
              selectedId = interactive.button_reply?.id;
              textBody = interactive.button_reply?.title;
              type = "interactive_button";
            } else if (interactive?.type === "list_reply") {
              selectedId = interactive.list_reply?.id;
              textBody = interactive.list_reply?.title;
              type = "interactive_list";
            }
          } else if (msgType === "button") {
            selectedId = message.button?.payload;
            textBody = message.button?.text;
            type = "interactive_button";
          } else if (msgType === "document") {
            textBody = message.document?.caption || message.document?.filename || "[Document / CV]";
            type = "document";
          } else if (msgType === "image") {
            textBody = message.image?.caption || "[Image]";
            type = "image";
          } else if (msgType === "video") {
            textBody = message.video?.caption || "[Video]";
            type = "video";
          } else if (msgType === "audio" || msgType === "voice") {
            textBody = "[Voice Note / Audio]";
            type = "text";
          } else if (msgType === "location") {
            const locName = message.location?.name || message.location?.address || "";
            textBody = locName ? `[Location: ${locName}]` : `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
            type = "text";
          } else if (msgType === "reaction") {
            textBody = message.reaction?.emoji ? `[Reaction: ${message.reaction.emoji}]` : "[Reaction]";
            type = "text";
          }

          console.log(`[WhatsApp Webhook] Incoming message from +${phone} (${senderName}): "${textBody || selectedId || msgType}"`);

          // 1. Log message to DB for auditing and debugging
          let db;
          let effectiveSenderName = senderName;
          try {
            const { connectToDatabase } = await import("@/lib/mongodb");
            const dbConn = await connectToDatabase();
            db = dbConn.db;

            // If profile name is generic "Candidate", check if candidate exists in CRM Leads
            if (!effectiveSenderName || effectiveSenderName === "Candidate") {
              const lead = await db.collection("leads").findOne({
                $or: [
                  { phone },
                  { phone: `+${phone}` },
                  { phone: { $regex: `${phone.slice(-10)}$` } },
                ],
              });
              if (lead?.name) {
                effectiveSenderName = lead.name;
              } else {
                const s = await db.collection("whatsapp_sessions").findOne({ phone });
                if (s?.name && s.name !== "Candidate") {
                  effectiveSenderName = s.name;
                }
              }
            }

            // If we have an actual candidate name, ensure session has it
            if (effectiveSenderName && effectiveSenderName !== "Candidate") {
              await db.collection("whatsapp_sessions").updateOne(
                { phone },
                { $set: { name: effectiveSenderName } }
              );
            }

            await db.collection("whatsapp_incoming_logs").insertOne({
              phone,
              senderName: effectiveSenderName,
              msgType,
              textBody,
              selectedId,
              rawMessage: message,
              createdAt: new Date(),
            });

            // 2. Log to unified live chat collection (always logs candidate message!)
            const { logWhatsAppMessage } = await import("@/lib/whatsapp/messageLogger");
            await logWhatsAppMessage({
              db,
              phone,
              sender: "candidate",
              senderName: effectiveSenderName,
              text: textBody || (selectedId ? `[Button clicked: ${selectedId}]` : `[${msgType}]`),
              msgType: type,
              messageId: message.id,
            });
          } catch (dbLogErr) {
            console.warn("[WhatsApp Webhook] Could not save incoming log:", dbLogErr);
          }

          // 3. Handle Document (PDF) and Image uploads from candidate
          if (msgType === "document" || msgType === "image") {
            const mediaObj = msgType === "document" ? message.document : message.image;
            if (mediaObj?.id) {
              if (!db) {
                const { connectToDatabase } = await import("@/lib/mongodb");
                const dbConn = await connectToDatabase();
                db = dbConn.db;
              }

              const { handleIncomingWhatsAppMedia } = await import("@/lib/whatsapp/media");
              const mediaResult = await handleIncomingWhatsAppMedia({
                db,
                phone,
                senderName,
                mediaType: msgType,
                mediaObj: {
                  id: mediaObj.id,
                  filename: mediaObj.filename,
                  mime_type: mediaObj.mime_type,
                  caption: mediaObj.caption,
                },
              });

              // If media was saved, update the message document in whatsapp_messages with mediaUrl
              if (mediaResult?.filePath) {
                try {
                  await db.collection("whatsapp_messages").updateOne(
                    { messageId: message.id },
                    {
                      $set: {
                        mediaUrl: mediaResult.filePath,
                        mediaFileName: mediaResult.filename || mediaObj.filename,
                      },
                    }
                  );
                } catch (updateErr) {
                  console.warn("[WhatsApp Webhook] Could not update mediaUrl on message:", updateErr);
                }
              }

              processedCount++;
              continue;
            }
          }

          // 4. Check if incoming message is a genuine third-party verification OTP / security code
          // (e.g. Meta / Facebook / WhatsApp login codes sent to the business phone).
          // CRITICAL: Must NEVER swallow candidate messages containing words like "confirm", "verify", "meeting", etc.
          const cleanTrimmed = (textBody || "").trim();
          const hasConversationalWords =
            /\b(please|plz|can you|could you|meeting|consultation|appointment|visa|work|job|eligible|eligibility|process|cv|resume|details|salary|weekend|slot|call|australia|documents?|fee|charges?|how|what|when|where|why|help|hello|hi|hey|thanks|thank you|email|name|change|update)\b/i.test(
              cleanTrimmed
            );

          const isExplicitOtpMessage =
            /\b((your|is your)\s+(whatsapp|meta|facebook|instagram|verification|security|login|otp)\s+code|(whatsapp|meta|facebook|instagram|security)\s+code\s*:\s*\d{4,8}|use\s+\d{4,8}\s+to\s+(verify|log in)|(verification|security|login|otp)\s+code\s+is\s*:?\s*\d{4,8})\b/i.test(
              cleanTrimmed
            );

          // Standalone 6-8 digit code (e.g. "123456" or "123-456") without conversational context
          const isStandaloneOtpCode =
            !hasConversationalWords &&
            /^\s*(\d{3}[-\s]\d{3}|\d{6,8})\s*$/.test(cleanTrimmed) &&
            // Exclude common 4-digit years like 1990-2030 or slot numbers 1-16
            !/^\s*(19\d\d|20\d\d|[1-9]|1[0-6])\s*$/.test(cleanTrimmed);

          const isOtp = Boolean(textBody && !hasConversationalWords && (isExplicitOtpMessage || isStandaloneOtpCode));

          if (isOtp) {
            console.log(`🚨 [WHATSAPP OTP / VERIFICATION CODE RECEIVED] From +${phone}: "${textBody}"`);

            if (db) {
              await db.collection("whatsapp_otps").insertOne({
                phone,
                senderName,
                code: textBody,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
              });

              try {
                const { createNotification } = await import("@/lib/notifications");
                const adminUsers = await db.collection("users").find({ role: "admin" }).toArray();
                for (const admin of adminUsers) {
                  await createNotification({
                    userId: admin.id,
                    title: "🔑 WhatsApp OTP / Verification Code Received",
                    message: `Code / Message: "${textBody}" (From: +${phone})`,
                    type: "whatsapp_otp",
                    link: "/dashboard",
                  });
                }
              } catch (notifErr) {
                console.warn("[WhatsApp Webhook] Could not dispatch OTP notification:", notifErr);
              }
            }

            processedCount++;
            continue;
          }

          // 5. Process regular messages through candidate state machine
          try {
            const stateMessageType: "text" | "interactive_button" | "interactive_list" =
              type === "interactive_button" || type === "interactive_list"
                ? type
                : "text";

            await processIncomingWhatsAppMessage({
              phone,
              senderName: effectiveSenderName,
              messageType: stateMessageType,
              textBody,
              selectedId,
            });
          } catch (stateErr) {
            console.error(`[WhatsApp Webhook] State machine error for +${phone}:`, stateErr);
          }

          processedCount++;
        }
      }
    }

    return NextResponse.json({ status: "success", processedMessages: processedCount }, { status: 200 });
  } catch (err) {
    console.error("[WhatsApp Webhook Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
