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
    }

    // Process through state machine
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
