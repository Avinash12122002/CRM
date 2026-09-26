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

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    // Ignore status notifications (sent, delivered, read receipts)
    if (!message) {
      return NextResponse.json({ status: "ignored_no_message" }, { status: 200 });
    }

    const phone = message.from; // Sender's phone number e.g. "2348012345678"
    const senderName = contact?.profile?.name || "Candidate";
    const msgType = message.type;

    let textBody: string | undefined = undefined;
    let selectedId: string | undefined = undefined;
    let type: "text" | "interactive_button" | "interactive_list" = "text";

    if (msgType === "text") {
      textBody = message.text?.body;
      type = "text";
    } else if (msgType === "interactive") {
      const interactive = message.interactive;
      if (interactive.type === "button_reply") {
        selectedId = interactive.button_reply?.id;
        textBody = interactive.button_reply?.title;
        type = "interactive_button";
      } else if (interactive.type === "list_reply") {
        selectedId = interactive.list_reply?.id;
        textBody = interactive.list_reply?.title;
        type = "interactive_list";
      }
    } else if (msgType === "button") {
      selectedId = message.button?.payload;
      textBody = message.button?.text;
      type = "interactive_button";
    }

    console.log(`[WhatsApp Webhook] Incoming message from +${phone} (${senderName}): "${textBody || selectedId || msgType}"`);

    // Log message to DB for auditing and debugging
    let db;
    try {
      const { connectToDatabase } = await import("@/lib/mongodb");
      const dbConn = await connectToDatabase();
      db = dbConn.db;

      await db.collection("whatsapp_incoming_logs").insertOne({
        phone,
        senderName,
        msgType,
        textBody,
        selectedId,
        rawMessage: message,
        createdAt: new Date(),
      });
    } catch (dbLogErr) {
      console.warn("[WhatsApp Webhook] Could not save incoming log:", dbLogErr);
    }

    // Handle Document (PDF) and Image uploads from candidate
    // Saves to folder cv/<candidate_phone_number>/ and public/cv/<candidate_phone_number>/
    if (msgType === "document" || msgType === "image") {
      const mediaObj = msgType === "document" ? message.document : message.image;
      if (mediaObj?.id) {
        if (!db) {
          const { connectToDatabase } = await import("@/lib/mongodb");
          const dbConn = await connectToDatabase();
          db = dbConn.db;
        }

        const { handleIncomingWhatsAppMedia } = await import("@/lib/whatsapp/media");
        await handleIncomingWhatsAppMedia({
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

        return NextResponse.json({ status: "media_processed" }, { status: 200 });
      }
    }

    // Check if incoming message is an OTP / verification code (e.g. from Instagram, Facebook, Meta)
    const isOtp =
      textBody &&
      (/\b(otp|code|verification|verify|confirm|instagram|facebook|meta|security code)\b/i.test(textBody) ||
        /^\s*(\d{4,8}|[A-Z0-9]{4,8})\s*$/i.test(textBody));

    if (isOtp) {
      console.log(`🚨 [WHATSAPP OTP / VERIFICATION CODE RECEIVED] From +${phone}: "${textBody}"`);

      if (db) {
        // Store in dedicated whatsapp_otps collection
        await db.collection("whatsapp_otps").insertOne({
          phone,
          senderName,
          code: textBody,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });

        // Trigger in-app notification for admin
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

      // Return immediately so this OTP message does not trigger the candidate visa booking flow
      return NextResponse.json({ status: "otp_received", message: textBody }, { status: 200 });
    }

    // Process regular messages through candidate state machine
    await processIncomingWhatsAppMessage({
      phone,
      senderName,
      messageType: type,
      textBody,
      selectedId,
    });

    return NextResponse.json({ status: "success" }, { status: 200 });
  } catch (err) {
    console.error("[WhatsApp Webhook Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
