import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  processIncomingWhatsAppMessage,
  getOrCreateSession,
} from "@/lib/whatsapp/stateMachine";

/**
 * POST /api/whatsapp/simulate
 * Simulates incoming WhatsApp actions from the visual simulator screen
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, senderName, textBody, selectedId, messageType, action } = body;

    const { db } = await connectToDatabase();

    // Reset session action for clean re-testing
    if (action === "reset") {
      const cleanPhone = (phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
      await db.collection("whatsapp_sessions").deleteOne({ phone: cleanPhone });
      const session = await getOrCreateSession(db, cleanPhone, senderName);
      return NextResponse.json({ success: true, session });
    }

    const cleanPhone = (phone || "2348012345678").replace(/[^\d]/g, "").replace(/^00/, "");

    const result = await processIncomingWhatsAppMessage({
      phone: cleanPhone,
      senderName: senderName || "Test Candidate",
      messageType: messageType || "text",
      textBody,
      selectedId,
    });

    const updatedSession = await getOrCreateSession(db, cleanPhone, senderName);

    return NextResponse.json({
      success: true,
      result,
      session: updatedSession,
    });
  } catch (err) {
    console.error("[WhatsApp Simulator Error]", err);
    return NextResponse.json(
      { error: "Simulator Error", details: String(err) },
      { status: 500 },
    );
  }
}
