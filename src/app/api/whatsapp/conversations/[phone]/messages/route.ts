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

    const phoneVariations = [cleanPhone, `+${cleanPhone}`];
    if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
      phoneVariations.push(cleanPhone.slice(2));
      phoneVariations.push(`0${cleanPhone.slice(2)}`);
      phoneVariations.push(`+91${cleanPhone.slice(2)}`);
    } else if (cleanPhone.length === 10) {
      phoneVariations.push(`91${cleanPhone}`);
      phoneVariations.push(`+91${cleanPhone}`);
      phoneVariations.push(`0${cleanPhone}`);
    }

    const last10Digits = cleanPhone.slice(-10);
    const phoneRegex = last10Digits.length >= 7 ? new RegExp(`${last10Digits}$`) : null;

    const phoneFilter: Record<string, unknown> = {
      $or: [
        { phone: { $in: phoneVariations } },
        { from: { $in: phoneVariations } },
        { to: { $in: phoneVariations } },
        ...(phoneRegex
          ? [
              { phone: phoneRegex },
              { from: phoneRegex },
              { to: phoneRegex },
            ]
          : []),
      ],
    };

    // 1. Fetch from unified whatsapp_messages (primary source of truth)
    const messages = await db
      .collection("whatsapp_messages")
      .find(phoneFilter)
      .sort({ createdAt: 1 })
      .toArray();

    // 2. Fetch candidate session details
    const session = await db.collection("whatsapp_sessions").findOne({
      $or: [
        { phone: { $in: phoneVariations } },
        ...(phoneRegex ? [{ phone: phoneRegex }] : []),
      ],
    });

    // 3. Resilient merge: Check whatsapp_incoming_logs to ensure no candidate message was missed
    const incomingLogs = await db
      .collection("whatsapp_incoming_logs")
      .find({
        $or: [
          { phone: { $in: phoneVariations } },
          { from: { $in: phoneVariations } },
          ...(phoneRegex ? [{ phone: phoneRegex }, { from: phoneRegex }] : []),
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();

    const existingMessageIds = new Set(messages.map((m) => m.messageId).filter(Boolean));

    for (const inc of incomingLogs) {
      const incId = inc.rawMessage?.id || (inc._id ? inc._id.toString() : undefined);
      const text =
        inc.textBody ||
        inc.selectedId ||
        (inc.msgType === "document"
          ? "[Document]"
          : inc.msgType === "image"
          ? "[Image]"
          : `[${inc.msgType}]`);

      // If messageId is already in messages, skip
      if (incId && existingMessageIds.has(incId)) {
        continue;
      }

      // Check if message with same text was already logged within 5 seconds
      const incTime = new Date(inc.createdAt).getTime();
      const normIncText = (text || "").trim();
      const alreadyLogged = messages.some((m) => {
        if (m.sender !== "candidate") return false;
        if ((m.text || "").trim() !== normIncText) return false;
        return Math.abs(new Date(m.createdAt).getTime() - incTime) < 5000;
      });

      if (alreadyLogged) {
        continue;
      }

      messages.push({
        _id: inc._id,
        phone: cleanPhone,
        sender: "candidate",
        senderName: inc.senderName || "Candidate",
        text,
        msgType: inc.msgType || "text",
        messageId: incId,
        createdAt: inc.createdAt,
      } as any);
      if (incId) existingMessageIds.add(incId);
    }

    // 4. Safe Deduplication:
    // - Two messages with identical messageId are merged.
    // - Candidate messages are NEVER merged with bot or admin messages!
    // - Messages from candidate are never dropped by text match.
    const deduplicatedMessages: typeof messages = [];
    for (const m of messages) {
      const normText = (m.text || "").trim();
      const mTime = new Date(m.createdAt).getTime();

      const dupIndex = deduplicatedMessages.findIndex((prev) => {
        if (m.messageId && prev.messageId && m.messageId === prev.messageId) {
          return true;
        }
        // NEVER merge candidate messages with outbound bot/admin messages
        if (m.sender !== prev.sender) {
          // If one was logged as 'bot' and the other as 'admin' for the same outbound text within 10 seconds, merge them!
          if (
            ((m.sender === "admin" && prev.sender === "bot") || (m.sender === "bot" && prev.sender === "admin")) &&
            (prev.text || "").trim() === normText &&
            Math.abs(new Date(prev.createdAt).getTime() - mTime) < 10000
          ) {
            return true;
          }
          return false;
        }
        // If candidate sent message, only merge if identical within 2 seconds (rapid network duplicate)
        if (m.sender === "candidate") {
          return (prev.text || "").trim() === normText && Math.abs(new Date(prev.createdAt).getTime() - mTime) < 2000;
        }
        // For bot/admin outbound messages, debounce within 6 seconds
        const sameNormText = (prev.text || "").trim() === normText;
        const timeDiff = Math.abs(new Date(prev.createdAt).getTime() - mTime);
        return sameNormText && timeDiff < 6000;
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

    // Also check incoming logs for contact profile name from WhatsApp
    const incomingLog = await db.collection("whatsapp_incoming_logs").findOne({
      phone: cleanPhone,
      senderName: { $exists: true, $nin: ["Candidate", "candidate", ""] },
    });

    const candidateResolvedName =
      (session?.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") ? session.name : null) ||
      lead?.name ||
      incomingLog?.senderName ||
      "Candidate";

    // Self-heal session name in DB if resolved
    if (candidateResolvedName !== "Candidate" && (!session?.name || session.name === "Candidate" || session.name.toLowerCase().includes("test"))) {
      await db.collection("whatsapp_sessions").updateOne(
        { phone: cleanPhone },
        { $set: { name: candidateResolvedName, leadId: lead?.id || session?.leadId || undefined } }
      );
    }

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
            name: candidateResolvedName,
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
            name: candidateResolvedName,
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
    const { text, message, name } = body;

    const { db } = await connectToDatabase();
    const now = new Date();

    if (name && typeof name === "string" && name.trim()) {
      const trimmedName = name.trim();
      await db.collection("whatsapp_sessions").updateOne(
        { phone: cleanPhone },
        { $set: { name: trimmedName, updatedAt: now } }
      );
      await db.collection("leads").updateOne(
        {
          $or: [
            { phone: cleanPhone },
            { phone: `+${cleanPhone}` },
            { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
          ],
        },
        { $set: { name: trimmedName, updatedAt: now } }
      );
      if (!text && !message) {
        return NextResponse.json({ success: true, name: trimmedName });
      }
    }

    const msgToSend = (text || message || "").trim();
    if (!msgToSend) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    // 1. Dispatch WhatsApp message via official Meta Cloud API client (with skipLog: true so client.ts doesn't duplicate-log as bot)
    const sendResult = await sendTextMessage(cleanPhone, msgToSend, { skipLog: true });

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || "Failed to send WhatsApp message via Meta Cloud API" },
        { status: 502 }
      );
    }

    // 2. Log message as sender: "admin"
    await logWhatsAppMessage({
      db,
      phone: cleanPhone,
      sender: "admin",
      senderName: payload.name || "Admin",
      text: msgToSend,
      messageId: sendResult.messageId,
      createdAt: now,
    });

    // 3. Record in whatsapp_outgoing_logs for audit
    await db.collection("whatsapp_outgoing_logs").insertOne({
      phone: cleanPhone,
      recipientName: "Candidate",
      message: msgToSend,
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
              details: `Admin replied on WhatsApp (+${cleanPhone}): "${msgToSend.slice(0, 100)}${msgToSend.length > 100 ? "..." : ""}"`,
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
        text: msgToSend,
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
