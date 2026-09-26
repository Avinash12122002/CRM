import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { logWhatsAppMessage } from "@/lib/whatsapp/messageLogger";

/**
 * GET /api/whatsapp/conversations/[phone]/messages
 * Fetches the entire conversation history for a given candidate phone number.
 * Automatically marks the conversation as read (resets unreadCount = 0).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ phone: string }> }
) {
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

    const { phone: rawPhone } = await context.params;
    const cleanPhone = String(rawPhone || "").replace(/[^\d]/g, "").replace(/^00/, "");

    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // 1. Fetch from unified whatsapp_messages
    const messages = await db
      .collection("whatsapp_messages")
      .find({ phone: cleanPhone })
      .sort({ createdAt: 1 })
      .toArray();

    // 2. Fetch candidate session details
    const session = await db.collection("whatsapp_sessions").findOne({ phone: cleanPhone });

    // 3. Backwards compatibility: Check incoming/outgoing logs if messages collection is empty or partial
    const incomingLogs = await db
      .collection("whatsapp_incoming_logs")
      .find({
        $or: [
          { phone: cleanPhone },
          { phone: `+${cleanPhone}` },
          { phone: cleanPhone.startsWith("91") ? cleanPhone.slice(2) : cleanPhone },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();

    const outgoingLogs = await db
      .collection("whatsapp_outgoing_logs")
      .find({
        $or: [
          { phone: cleanPhone },
          { phone: `+${cleanPhone}` },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();

    // Merge without duplicates (using text + timestamp proximity)
    const existingIds = new Set(messages.map((m) => m.messageId).filter(Boolean));
    const existingTexts = new Set(messages.map((m) => m.text));

    for (const inc of incomingLogs) {
      const text = inc.textBody || inc.selectedId || `[${inc.msgType}]`;
      if (!existingTexts.has(text) && (!inc.messageId || !existingIds.has(inc.messageId))) {
        messages.push({
          phone: cleanPhone,
          sender: "candidate",
          senderName: inc.senderName || "Candidate",
          text,
          msgType: inc.msgType || "text",
          createdAt: inc.createdAt,
        } as any);
        existingTexts.add(text);
      }
    }

    for (const out of outgoingLogs) {
      const text = out.message || "";
      if (!existingTexts.has(text) && (!out.messageId || !existingIds.has(out.messageId))) {
        const sender = out.sentByRole === "admin" ? "admin" : "bot";
        messages.push({
          phone: cleanPhone,
          sender,
          senderName: out.sentByName || (sender === "admin" ? "Admin" : "TMS Automation"),
          text,
          msgType: "text",
          createdAt: out.createdAt,
        } as any);
        existingTexts.add(text);
      }
    }

    // Filter any remaining adjacent duplicate texts within 15 seconds
    const deduplicatedMessages: typeof messages = [];
    for (const m of messages) {
      const isDup = deduplicatedMessages.some((prev) => {
        const sameText = prev.text === m.text;
        const timeDiff = Math.abs(new Date(prev.createdAt).getTime() - new Date(m.createdAt).getTime());
        return sameText && timeDiff < 15000;
      });

      if (!isDup) {
        deduplicatedMessages.push(m);
      } else {
        // If the duplicate is 'admin' and existing is 'bot', upgrade the existing to 'admin'
        const idx = deduplicatedMessages.findIndex(
          (prev) => prev.text === m.text && Math.abs(new Date(prev.createdAt).getTime() - new Date(m.createdAt).getTime()) < 15000
        );
        if (idx !== -1 && m.sender === "admin" && deduplicatedMessages[idx].sender === "bot") {
          deduplicatedMessages[idx] = m;
        }
      }
    }

    // Sort all chronologically
    deduplicatedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // 4. Mark conversation as READ
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      { $set: { unreadCount: 0, lastReadAt: new Date() } }
    );

    // 5. Check if candidate exists in CRM Leads
    const lead = await db.collection("leads").findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
      ],
    });

    return NextResponse.json({
      success: true,
      phone: cleanPhone,
      messages: deduplicatedMessages.map((m) => ({
        id: String(m._id || m.messageId || `${m.sender}_${new Date(m.createdAt).getTime()}`),
        sender: m.sender,
        senderName: m.senderName,
        text: m.text,
        msgType: m.msgType || "text",
        mediaUrl: m.mediaUrl || null,
        mediaFileName: m.mediaFileName || null,
        buttons: m.buttons || null,
        createdAt: m.createdAt,
      })),
      session: session
        ? {
            name: session.name || lead?.name || "Candidate",
            email: session.email || lead?.email || null,
            countryName: session.countryName,
            countryCode: session.countryCode,
            timeZone: session.timeZone,
            timeZoneLabel: session.timeZoneLabel,
            currentStep: session.currentStep,
            bookedSlot: session.bookedSlot || null,
            cvFileName: session.cvFileName || null,
            cvFileUrl: session.cvFileUrl || null,
            cvReceivedAt: session.cvReceivedAt || null,
            infoEmailSentAt: session.infoEmailSentAt || null,
            leadId: lead?.id || session.leadId || null,
          }
        : {
            name: lead?.name || "Candidate",
            email: lead?.email || null,
            countryName: cleanPhone.startsWith("91") ? "India" : "International",
            countryCode: cleanPhone.startsWith("91") ? "IN" : "",
            timeZone: "Asia/Kolkata",
            timeZoneLabel: "IST",
            currentStep: "WELCOME",
            bookedSlot: null,
            leadId: lead?.id || null,
          },
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            status: lead.status,
            assignedToName: lead.assignedToName,
          }
        : null,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp/conversations/[phone]/messages Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/conversations/[phone]/messages
 * Admin sends a direct manual message to this candidate.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ phone: string }> }
) {
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

    const { phone: rawPhone } = await context.params;
    const cleanPhone = String(rawPhone || "").replace(/[^\d]/g, "").replace(/^00/, "");

    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    const trimmedMsg = message.trim();

    // 1. Dispatch WhatsApp message via official Meta Cloud API client (with skipLog: true so client.ts doesn't duplicate-log as bot)
    const sendResult = await sendTextMessage(cleanPhone, trimmedMsg, { skipLog: true });

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || "Failed to send WhatsApp message via Meta Cloud API" },
        { status: 502 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    // 2. Log message as sender: "admin"
    await logWhatsAppMessage({
      db,
      phone: cleanPhone,
      sender: "admin",
      senderName: payload.name || "Admin",
      text: trimmedMsg,
      messageId: sendResult.messageId,
      createdAt: now,
    });

    // 3. Record in whatsapp_outgoing_logs for audit
    await db.collection("whatsapp_outgoing_logs").insertOne({
      phone: cleanPhone,
      recipientName: "Candidate",
      message: trimmedMsg,
      sentByName: payload.name || "Admin",
      sentById: payload.id,
      sentByRole: payload.role,
      messageId: sendResult.messageId || null,
      simulated: Boolean(sendResult.simulated),
      createdAt: now,
    });

    // 4. Update CRM lead timeline if lead exists
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
              details: `Admin replied on WhatsApp (+${cleanPhone}): "${trimmedMsg.slice(0, 100)}${trimmedMsg.length > 100 ? "..." : ""}"`,
            } as any,
          },
          $set: { updatedAt: now },
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: sendResult.messageId || `msg_${Date.now()}`,
        sender: "admin",
        senderName: payload.name || "Admin",
        text: trimmedMsg,
        msgType: "text",
        createdAt: now,
      },
      simulated: sendResult.simulated,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp/conversations/[phone]/messages Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
