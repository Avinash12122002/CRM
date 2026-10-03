import { NextRequest, NextResponse } from "next/server";
import { processIncomingWhatsAppMessage } from "@/lib/whatsapp/stateMachine";
import { processIncomingWhatsAppMessage as processIncomingWhatsAppIrelandMessage } from "@/lib/whatsapp-ireland/stateMachine";

/**
 * GET: Meta Webhook Verification Handshake
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const validTokens = [
    process.env.WHATSAPP_VERIFY_TOKEN,
    process.env.WHATSAPP_IRELAND_VERIFY_TOKEN,
    "tms_visa_webhook_secret_2026",
    "tms_ireland_webhook_secret_2026",
    "TMS_WHATSAPP_TOKEN_2026",
  ].filter(Boolean);

  if (mode === "subscribe" && token && validTokens.includes(token)) {
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
 * Automatically routes messages to Australia or Ireland state machine based on
 * the recipient Meta phone_number_id or display_phone_number.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const entries = body?.entry || [];
    let processedCount = 0;
    let hasIreland = false;
    let hasAustralia = false;

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages || [];
        const contact = value?.contacts?.[0];
        const defaultSenderName = contact?.profile?.name || "Candidate";

        const incomingPhoneId = String(value?.metadata?.phone_number_id || "");
        const incomingDisplayPhone = String(value?.metadata?.display_phone_number || "").replace(/[^\d]/g, "");

        const irelandPhoneId = process.env.WHATSAPP_IRELAND_PHONE_NUMBER_ID || "1366657749867122";
        const australiaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";

        // Base check from Meta phone metadata
        const isIrelandBase =
          (Boolean(irelandPhoneId) && incomingPhoneId === irelandPhoneId) ||
          incomingDisplayPhone.endsWith("8685081010");
        const isAustraliaBase = Boolean(australiaPhoneId && incomingPhoneId === australiaPhoneId);

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

          // Resolve country destination:
          // 1. Meta phone_number_id check
          // 2. Button ID context (e.g. BTN_IRELAND_YES, BTN_482_YES)
          // 3. Database session or CRM lead check
          let isIreland = isIrelandBase;
          if (!isIreland && !isAustraliaBase) {
            if (selectedId && (selectedId.includes("IRELAND") || selectedId.includes("IRISH"))) {
              isIreland = true;
            }
          }

          let sessionsCollection = isIreland ? "whatsapp_ireland_sessions" : "whatsapp_sessions";
          let incomingLogsCollection = isIreland ? "whatsapp_ireland_incoming_logs" : "whatsapp_incoming_logs";
          let messagesCollection = isIreland ? "whatsapp_ireland_messages" : "whatsapp_messages";

          // 1. Log message to DB for auditing and debugging
          let db;
          let effectiveSenderName = senderName;
          try {
            const { connectToDatabase } = await import("@/lib/mongodb");
            const dbConn = await connectToDatabase();
            db = dbConn.db;

            // If destination is still uncertain, inspect candidate's active sessions and CRM lead
            if (!isIrelandBase && !isAustraliaBase) {
              const existingIeSession = await db.collection("whatsapp_ireland_sessions").findOne({ phone });
              const existingAuSession = await db.collection("whatsapp_sessions").findOne({ phone });
              if (existingIeSession && !existingAuSession) {
                isIreland = true;
                sessionsCollection = "whatsapp_ireland_sessions";
                incomingLogsCollection = "whatsapp_ireland_incoming_logs";
                messagesCollection = "whatsapp_ireland_messages";
              }
            }

            if (isIreland) hasIreland = true;
            else hasAustralia = true;

            console.log(`[WhatsApp Webhook ${isIreland ? "🇮🇪 Ireland" : "🇦🇺 Australia"}] Incoming from +${phone} (${senderName}): "${textBody || selectedId || msgType}"`);

            // Check if existing session or CRM lead already has candidate's verified name
            const last10 = phone.slice(-10);
            const leadPhoneQueries: any[] = [
              { phone },
              { phone: `+${phone}` },
            ];
            if (phone.length >= 8 && !isNaN(Number(phone))) {
              leadPhoneQueries.push({ phone: Number(phone) });
            }
            if (last10.length === 10) {
              leadPhoneQueries.push(
                { phone: last10 },
                { phone: `+91${last10}` },
                { phone: { $regex: `${last10}$` } }
              );
              if (!isNaN(Number(last10))) {
                leadPhoneQueries.push({ phone: Number(last10) });
              }
            }
            const existingSession = await db.collection(sessionsCollection).findOne({ phone });
            let existingLead = await db.collection("leads").findOne({ $or: leadPhoneQueries });

            const isValidPersonName = (n?: string): boolean => {
              if (!n) return false;
              const t = n.trim();
              const l = t.toLowerCase();
              return (
                t.length > 2 &&
                l !== "candidate" &&
                l !== "at" &&
                !l.includes("test") &&
                !l.includes("@") &&
                !/^(hi|hello|hey|namaste|sir|madam|mr|mrs|ms|ok|okay)$/i.test(l)
              );
            };

            // Priority: Session verified name > CRM Lead verified name > Meta contact profile name > "Candidate"
            if (isValidPersonName(existingSession?.name)) {
              effectiveSenderName = existingSession!.name;
            } else if (isValidPersonName(existingLead?.name)) {
              effectiveSenderName = existingLead!.name;
              await db.collection(sessionsCollection).updateOne(
                { phone },
                { $set: { name: existingLead!.name } }
              );
            } else if (isValidPersonName(effectiveSenderName)) {
              await db.collection(sessionsCollection).updateOne(
                { phone, $or: [{ name: { $exists: false } }, { name: "Candidate" }, { name: "at" }, { name: "" }] },
                { $set: { name: effectiveSenderName } }
              );
            } else {
              effectiveSenderName = "Candidate";
            }

            // AUTO-CREATE CRM LEAD on first message if none exists yet (status: "new-lead")
            if (!existingLead) {
              try {
                if (isIreland) {
                  const { syncOrCreateCrmLead } = await import("@/lib/whatsapp-ireland/leadLookup");
                  existingLead = (await syncOrCreateCrmLead(
                    db,
                    phone,
                    {
                      name: isValidPersonName(effectiveSenderName) ? effectiveSenderName : undefined,
                      phone,
                      countryName: "Ireland",
                    },
                    {
                      destination: "Ireland",
                      sessionsCollection: "whatsapp_ireland_sessions",
                    }
                  )) as any;
                } else {
                  const { syncOrCreateCrmLead } = await import("@/lib/whatsapp/leadLookup");
                  existingLead = (await syncOrCreateCrmLead(
                    db,
                    phone,
                    {
                      name: isValidPersonName(effectiveSenderName) ? effectiveSenderName : undefined,
                      phone,
                      countryName: phone.startsWith("91") ? "India" : "Australia",
                    },
                    {
                      destination: "Australia",
                      sessionsCollection: "whatsapp_sessions",
                    }
                  )) as any;
                }
                console.log(`[WhatsApp Webhook] Auto-created CRM lead #${existingLead?.id} (status: ${existingLead?.status}) for +${phone}`);
              } catch (createErr) {
                console.warn("[WhatsApp Webhook] Could not auto-create CRM lead on first message:", createErr);
              }
            } else {
              // Ensure existing session has leadId linked
              if (existingSession && !existingSession.leadId && existingLead?.id) {
                await db.collection(sessionsCollection).updateOne(
                  { phone },
                  { $set: { leadId: existingLead.id } }
                ).catch(() => {});
              }
              // If lead has generic name but we now have candidate's verified name, update lead
              if (
                isValidPersonName(effectiveSenderName) &&
                (!existingLead.name || existingLead.name === "Candidate" || String(existingLead.name).startsWith("WhatsApp Candidate"))
              ) {
                await db.collection("leads").updateOne(
                  { id: existingLead.id },
                  { $set: { name: effectiveSenderName, updatedAt: new Date() } }
                ).catch(() => {});
              }
            }

            await db.collection(incomingLogsCollection).insertOne({
              phone,
              senderName: effectiveSenderName,
              msgType,
              textBody,
              selectedId,
              rawMessage: message,
              destination: isIreland ? "ireland" : "australia",
              createdAt: new Date(),
            });

            // 2. Log to live chat collection
            if (isIreland) {
              const { logWhatsAppIrelandMessage } = await import("@/lib/whatsapp-ireland/messageLogger");
              await logWhatsAppIrelandMessage({
                db,
                phone,
                sender: "candidate",
                senderName: effectiveSenderName,
                text: textBody || (selectedId ? `[Button clicked: ${selectedId}]` : `[${msgType}]`),
                msgType: type,
                messageId: message.id,
              });
            } else {
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
            }
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

              let mediaResult: { filePath?: string; filename?: string } | null = null;
              if (isIreland) {
                const { handleIncomingWhatsAppIrelandMedia } = await import("@/lib/whatsapp-ireland/media");
                mediaResult = await handleIncomingWhatsAppIrelandMedia({
                  db,
                  phone,
                  senderName: effectiveSenderName,
                  mediaType: msgType,
                  mediaObj: {
                    id: mediaObj.id,
                    filename: mediaObj.filename,
                    mime_type: mediaObj.mime_type,
                    caption: mediaObj.caption,
                  },
                });
              } else {
                const { handleIncomingWhatsAppMedia } = await import("@/lib/whatsapp/media");
                mediaResult = await handleIncomingWhatsAppMedia({
                  db,
                  phone,
                  senderName: effectiveSenderName,
                  mediaType: msgType,
                  mediaObj: {
                    id: mediaObj.id,
                    filename: mediaObj.filename,
                    mime_type: mediaObj.mime_type,
                    caption: mediaObj.caption,
                  },
                });
              }

              if (mediaResult?.filePath) {
                try {
                  await db.collection(messagesCollection).updateOne(
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

          // 4. Process regular messages through candidate state machine
          try {
            const stateMessageType: "text" | "interactive_button" | "interactive_list" =
              type === "interactive_button" || type === "interactive_list"
                ? type
                : "text";

            if (isIreland) {
              await processIncomingWhatsAppIrelandMessage({
                phone,
                senderName: effectiveSenderName,
                messageType: stateMessageType,
                textBody,
                selectedId,
              });
            } else {
              await processIncomingWhatsAppMessage({
                phone,
                senderName: effectiveSenderName,
                messageType: stateMessageType,
                textBody,
                selectedId,
              });
            }
          } catch (stateErr) {
            console.error(`[WhatsApp Webhook] State machine error for +${phone}:`, stateErr);
          }

          processedCount++;
        }
      }
    }

    if (processedCount > 0) {
      import("@/lib/mongodb")
        .then(({ connectToDatabase }) => connectToDatabase())
        .then(({ db }) => {
          if (hasAustralia) {
            import("@/lib/whatsapp/followupEngine")
              .then(({ runWhatsAppFollowupEngine }) => runWhatsAppFollowupEngine(db))
              .catch((e) => console.warn("[webhook] Australia follow-up check error:", e));
          }
          if (hasIreland) {
            import("@/lib/whatsapp-ireland/followupEngine")
              .then(({ runWhatsAppIrelandFollowupEngine }) => runWhatsAppIrelandFollowupEngine(db))
              .catch((e) => console.warn("[webhook] Ireland follow-up check error:", e));
          }
        })
        .catch((e) => console.warn("[webhook] Background check error:", e));
    }

    return NextResponse.json({ status: "success", processedMessages: processedCount }, { status: 200 });
  } catch (err) {
    console.error("[WhatsApp Webhook Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
