import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { sendTextMessage } from "@/lib/whatsapp/client";

export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { phone, message, candidateName } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Candidate phone number is required" }, { status: 400 });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message text cannot be empty" }, { status: 400 });
    }

    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const trimmedMsg = message.trim();

    // 1. Dispatch WhatsApp message via official Meta Cloud API client
    const sendResult = await sendTextMessage(cleanPhone, trimmedMsg);

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || "Failed to send WhatsApp message via Meta Cloud API" },
        { status: 502 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    // 2. Log outgoing message into database
    await db.collection("whatsapp_outgoing_logs").insertOne({
      phone: cleanPhone,
      recipientName: candidateName || "Candidate",
      message: trimmedMsg,
      sentByName: payload.name || "Admin",
      sentById: payload.id,
      sentByRole: payload.role,
      messageId: sendResult.messageId || null,
      simulated: Boolean(sendResult.simulated),
      createdAt: now,
    });

    // 3. Update WhatsApp session if exists
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          lastOutboundMessage: trimmedMsg,
          lastOutboundAt: now,
          updatedAt: now,
        },
      }
    );

    // 4. Update CRM lead history if lead matches candidate phone
    const lead = await db.collection("leads").findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
      ],
    });

    if (lead) {
      await db.collection("leads").updateOne(
        { id: lead.id },
        {
          $push: {
            history: {
              action: "whatsapp_message_sent",
              performedByName: payload.name || "Admin",
              timestamp: now,
              details: `Admin sent WhatsApp message to candidate (+${cleanPhone}): "${trimmedMsg.slice(0, 100)}${trimmedMsg.length > 100 ? "..." : ""}"`,
            } as any,
          },
          $set: {
            updatedAt: now,
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      simulated: sendResult.simulated,
      phone: cleanPhone,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp/send Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
