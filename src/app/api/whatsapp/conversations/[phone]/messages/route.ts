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

    // 1. Fetch from unified whatsapp_messages (primary source of truth)
    const messages = await db
      .collection("whatsapp_messages")
      .find({ phone: cleanPhone })
      .sort({ createdAt: 1 })
      .toArray();

    // 2. Fetch candidate session details
    const session = await db.collection("whatsapp_sessions").findOne({ phone: cleanPhone });

    // 3. Fallback only if whatsapp_messages is completely empty (historical migration)
    if (messages.length === 0) {
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

      const existingTexts = new Set<string>();

      for (const inc of incomingLogs) {
        const text = inc.textBody || inc.selectedId || `[${inc.msgType}]`;
        if (text && !existingTexts.has(text.trim())) {
          messages.push({
            phone: cleanPhone,
            sender: "candidate",
            senderName: inc.senderName || "Candidate",
            text,
            msgType: inc.msgType || "text",
            createdAt: inc.createdAt,
          } as any);
          existingTexts.add(text.trim());
        }
      }

      for (const out of outgoingLogs) {
        const text = out.message || "";
        if (text && !existingTexts.has(text.trim())) {
          const sender = out.sentByRole === "admin" ? "admin" : "bot";
          messages.push({
            phone: cleanPhone,
            sender,
            senderName: out.sentByName || (sender === "admin" ? "Admin" : "TMS Automation"),
            text,
            msgType: "text",
            createdAt: out.createdAt,
          } as any);
          existingTexts.add(text.trim());
        }
      }
    }

    // 4. Strict Deduplication:
    // If two messages have identical text within 2 minutes (120,000ms), or identical messageId, merge into one.
    // If one is 'admin' and one is 'bot', always prefer 'admin'.
    const deduplicatedMessages: typeof messages = [];
    for (const m of messages) {
      const normText = (m.text || "").trim();
      const mTime = new Date(m.createdAt).getTime();

      const dupIndex = deduplicatedMessages.findIndex((prev) => {
        if (m.messageId && prev.messageId && m.messageId === prev.messageId) {
          return true;
        }
        const sameNormText = (prev.text || "").trim() === normText;
        const timeDiff = Math.abs(new Date(prev.createdAt).getTime() - mTime);
        return sameNormText && timeDiff < 120000; // 2 minutes window
      });

      if (dupIndex === -1) {
        deduplicatedMessages.push(m);
      } else {
        // Upgrade existing 'bot' entry to 'admin' if the incoming is 'admin'
        if (m.sender === "admin" && deduplicatedMessages[dupIndex].sender !== "admin") {
          deduplicatedMessages[dupIndex] = {
            ...deduplicatedMessages[dupIndex],
            sender: "admin",
            senderName: m.senderName || "Admin",
          };
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
