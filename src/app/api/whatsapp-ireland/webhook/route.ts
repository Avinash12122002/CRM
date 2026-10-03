import { NextRequest, NextResponse } from "next/server";
import { processIncomingWhatsAppMessage } from "@/lib/whatsapp-ireland/stateMachine";

/**
 * GET: Meta Webhook Verification Handshake for Ireland WhatsApp
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const validTokens = [
    process.env.WHATSAPP_IRELAND_VERIFY_TOKEN,
    process.env.WHATSAPP_VERIFY_TOKEN,
    "tms_ireland_webhook_secret_2026",
    "tms_visa_webhook_secret_2026",
    "TMS_WHATSAPP_TOKEN_2026",
  ].filter(Boolean);

  if (mode === "subscribe" && token && validTokens.includes(token)) {
    console.log("[WhatsApp Ireland Webhook] Handshake verified successfully!");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST: Incoming Message Events from Meta Cloud API for Ireland WhatsApp
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

          console.log(`[WhatsApp Ireland Webhook] Incoming message from +${phone} (${senderName}): "${textBody || selectedId || msgType}"`);

          // ── DEDUP GUARD ─────────────────────────────────────────────────────
          // WhatsApp retries failed deliveries with the same message.id.
          // Check if already processed; skip if duplicate.
          if (message.id) {
            const { connectToDatabase: getDb } = await import("@/lib/mongodb");
            const { db: dedupDb } = await getDb();
            const alreadyProcessed = await dedupDb.collection("whatsapp_processed_messages").findOne({ messageId: message.id });
            if (alreadyProcessed) {
              console.log(`[WhatsApp Ireland Webhook] Skipping duplicate message ${message.id} from +${phone}`);
              processedCount++;
              continue;
            }
            // Record processed messageId (fire-and-forget)
            dedupDb.collection("whatsapp_processed_messages").insertOne({
              messageId: message.id,
              phone,
              destination: "ireland",
              createdAt: new Date(),
            }).catch(() => {});
          }
          // ────────────────────────────────────────────────────────────────────

          // 1. Log message to Ireland DB for auditing

          let db;
          let effectiveSenderName = senderName;
          try {
            const { connectToDatabase } = await import("@/lib/mongodb");
            const dbConn = await connectToDatabase();
            db = dbConn.db;

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
            const existingSession = await db.collection("whatsapp_ireland_sessions").findOne({ phone });
            let existingLead = await db.collection("leads").findOne({ $or: leadPhoneQueries });

            const isValidPersonName = (n?: string): boolean => {
              if (!n) return false;
              const t = n.trim();
              const l = t.toLowerCase();
              return (
                t.length > 2 &&
                !l.includes("candidate") &&
                !l.includes("whatsapp") &&
                !l.includes("applicant") &&
                !l.includes("client") &&
                l !== "at" &&
                l !== "there" &&
                !l.includes("test") &&
                !l.includes("@") &&
                !/^(hi|hello|hey|namaste|sir|madam|mr|mrs|ms|ok|okay)$/i.test(l)
              );
            };

            if (isValidPersonName(existingSession?.name)) {
              effectiveSenderName = existingSession!.name;
            } else if (isValidPersonName(existingLead?.name)) {
              effectiveSenderName = existingLead!.name;
              await db.collection("whatsapp_ireland_sessions").updateOne(
                { phone },
                { $set: { name: existingLead!.name } }
              );
            } else if (isValidPersonName(effectiveSenderName)) {
              await db.collection("whatsapp_ireland_sessions").updateOne(
                { phone, $or: [{ name: { $exists: false } }, { name: "Candidate" }, { name: "at" }, { name: "" }] },
                { $set: { name: effectiveSenderName } }
              );
            } else {
              effectiveSenderName = "Candidate";
            }

            // AUTO-CREATE CRM LEAD on first message if none exists yet (status: "new-lead")
            if (!existingLead) {
              try {
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
                console.log(`[WhatsApp Ireland Webhook] Auto-created CRM lead #${existingLead?.id} (status: ${existingLead?.status}) for +${phone}`);
              } catch (createErr) {
                console.warn("[WhatsApp Ireland Webhook] Could not auto-create CRM lead on first message:", createErr);
              }
            } else {
              if (existingSession && !existingSession.leadId && existingLead?.id) {
                await db.collection("whatsapp_ireland_sessions").updateOne(
                  { phone },
                  { $set: { leadId: existingLead.id } }
                ).catch(() => {});
              }
              if (
                isValidPersonName(effectiveSenderName) &&
                (!existingLead.name || existingLead.name === "Candidate" || String(existingLead.name).startsWith("Ireland WhatsApp Candidate"))
              ) {
                await db.collection("leads").updateOne(
                  { id: existingLead.id },
                  { $set: { name: effectiveSenderName, updatedAt: new Date() } }
                ).catch(() => {});
              }
            }

            await db.collection("whatsapp_ireland_incoming_logs").insertOne({
              phone,
              senderName: effectiveSenderName,
              msgType,
              textBody,
              selectedId,
              rawMessage: message,
              destination: "ireland",
              createdAt: new Date(),
            });

            // 2. Log to Ireland unified live chat collection
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
          } catch (dbLogErr) {
            console.warn("[WhatsApp Ireland Webhook] Could not save incoming log:", dbLogErr);
          }

          // 3. Handle Document (PDF) and Image uploads
          if (msgType === "document" || msgType === "image") {
            const mediaObj = msgType === "document" ? message.document : message.image;
            if (mediaObj?.id) {
              if (!db) {
                const { connectToDatabase } = await import("@/lib/mongodb");
                const dbConn = await connectToDatabase();
                db = dbConn.db;
              }

              const { handleIncomingWhatsAppIrelandMedia } = await import("@/lib/whatsapp-ireland/media");
              const mediaResult = await handleIncomingWhatsAppIrelandMedia({
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

              if (mediaResult?.filePath) {
                try {
                  await db.collection("whatsapp_ireland_messages").updateOne(
                    { messageId: message.id },
                    {
                      $set: {
                        mediaUrl: mediaResult.filePath,
                        mediaFileName: mediaResult.filename || mediaObj.filename,
                      },
                    }
                  );
                } catch (updateErr) {
                  console.warn("[WhatsApp Ireland Webhook] Could not update mediaUrl:", updateErr);
                }
              }

              processedCount++;
              continue;
            }
          }

          // 4. Process regular messages through Ireland state machine
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
            console.error(`[WhatsApp Ireland Webhook] State machine error for +${phone}:`, stateErr);
          }

          processedCount++;
        }
      }
    }

    if (processedCount > 0) {
      import("@/lib/mongodb")
        .then(({ connectToDatabase }) => connectToDatabase())
        .then(({ db }) => {
          return import("@/lib/whatsapp-ireland/followupEngine").then(({ runWhatsAppIrelandFollowupEngine }) =>
            runWhatsAppIrelandFollowupEngine(db)
          );
        })
        .catch((e) => console.warn("[webhook] WhatsApp Ireland engine check error:", e));
    }

    return NextResponse.json({ status: "success", processedMessages: processedCount }, { status: 200 });
  } catch (err) {
    console.error("[WhatsApp Ireland Webhook Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
