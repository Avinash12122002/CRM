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
    }

    // 1. Fetch from unified whatsapp_messages (primary source of truth)
    const messages = await db
      .collection("whatsapp_messages")
      .find({
        $or: [
          { phone: { $in: phoneVariations } },
          { from: { $in: phoneVariations } },
          { to: { $in: phoneVariations } },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();

    // 2. Fetch candidate session details
    const session = await db.collection("whatsapp_sessions").findOne({
      $or: [{ phone: { $in: phoneVariations } }],
    });

    // 3. Resilient merge: Check whatsapp_incoming_logs to ensure no candidate message was missed
    const incomingLogs = await db
      .collection("whatsapp_incoming_logs")
      .find({
        $or: [
          { phone: { $in: phoneVariations } },
          { from: { $in: phoneVariations } },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();

    const existingMessageIds = new Set(messages.map((m) => m.messageId).filter(Boolean));
    const existingCandidateTexts = new Set(
      messages
        .filter((m) => m.sender === "candidate")
        .map((m) => `${(m.text || "").trim()}_${new Date(m.createdAt).getMinutes()}`)
    );

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
      const key = `${(text || "").trim()}_${new Date(inc.createdAt).getMinutes()}`;

      if (incId && existingMessageIds.has(incId)) {
        continue;
      }
      if (existingCandidateTexts.has(key)) {
        continue;
      }

      messages.push({
        phone: cleanPhone,
        sender: "candidate",
        senderName: inc.senderName || "Candidate",
        text,
        msgType: inc.msgType || "text",
        messageId: incId,
        createdAt: inc.createdAt,
      } as any);
      existingCandidateTexts.add(key);
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
        // NEVER merge messages across different senders (candidate vs bot/admin)
        if (m.sender !== prev.sender) {
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
