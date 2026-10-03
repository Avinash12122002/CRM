import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { sendTextMessage } from "@/lib/whatsapp-ireland/client";
import { logWhatsAppIrelandMessage } from "@/lib/whatsapp-ireland/messageLogger";
import { findMatchingCrmLead } from "@/lib/whatsapp-ireland/leadLookup";

/**
 * GET /api/whatsapp-ireland/conversations/[phone]/messages
 * Fetches the entire conversation history for a given Ireland candidate phone number.
 * Automatically marks conversation read (resets unreadCount = 0).
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
    if (cleanPhone.startsWith("353") && cleanPhone.length >= 10) {
      phoneVariations.push(cleanPhone.slice(3));
      phoneVariations.push(`0${cleanPhone.slice(3)}`);
      phoneVariations.push(`+353${cleanPhone.slice(3)}`);
    } else if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
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

    // 1. Fetch from whatsapp_ireland_messages
    const messages = await db
      .collection("whatsapp_ireland_messages")
      .find(phoneFilter)
      .sort({ createdAt: 1 })
      .toArray();

    // 2. Fetch candidate session details
    const session = await db.collection("whatsapp_ireland_sessions").findOne({
      $or: [
        { phone: { $in: phoneVariations } },
        ...(phoneRegex ? [{ phone: phoneRegex }] : []),
      ],
    });

    // 3. Resilient merge from whatsapp_ireland_incoming_logs
    const incomingLogs = await db
      .collection("whatsapp_ireland_incoming_logs")
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
        (inc.selectedId ? `[Button clicked: ${inc.selectedId}]` : `[${inc.msgType || "message"}]`);

      if (!existingMessageIds.has(incId)) {
        messages.push({
          _id: inc._id,
          phone: inc.phone || cleanPhone,
          sender: "candidate",
          senderName: inc.senderName || session?.name || "Candidate",
          text,
          msgType: inc.msgType || "text",
          mediaUrl: inc.mediaUrl || null,
          mediaFileName: inc.mediaFileName || null,
          messageId: incId,
          createdAt: inc.createdAt || new Date(),
        } as any);
      }
    }

    // Sort chronologically
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // 4. Mark unreadCount = 0
    await db.collection("whatsapp_ireland_sessions").updateOne(
      {
        $or: [
          { phone: { $in: phoneVariations } },
          ...(phoneRegex ? [{ phone: phoneRegex }] : []),
        ],
      },
      {
        $set: { unreadCount: 0, updatedAt: new Date() },
      }
    );

    // 5. Lookup matching CRM lead using robust multi-field lookup
    let lead = await findMatchingCrmLead(db, cleanPhone, session, "whatsapp_ireland_sessions");
    if (!lead) {
      try {
        const { syncOrCreateCrmLead } = await import("@/lib/whatsapp-ireland/leadLookup");
        lead = await syncOrCreateCrmLead(db, cleanPhone, session, {
          destination: "Ireland",
          sessionsCollection: "whatsapp_ireland_sessions",
        });
      } catch (autoLeadErr) {
        console.warn("[ireland-messages] Could not auto-create CRM lead:", autoLeadErr);
      }
    }

    // 6. Also check ireland incoming logs for contact profile name from WhatsApp
    const incomingLog = await db.collection("whatsapp_ireland_incoming_logs").findOne({
      phone: cleanPhone,
      senderName: { $exists: true, $nin: ["Candidate", "candidate", ""] },
    });

    const candidateResolvedName =
      (session?.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test") ? session.name : null) ||
      lead?.name ||
      incomingLog?.senderName ||
      "Candidate";

    // 7. Self-heal session name and leadId in DB if resolved
    const sessionUpdates: Record<string, any> = {};
    if (candidateResolvedName !== "Candidate" && (!session?.name || session.name === "Candidate" || session.name.toLowerCase().includes("test"))) {
      sessionUpdates.name = candidateResolvedName;
    }
    const resolvedLeadId = lead?.id || session?.leadId;
    if (resolvedLeadId && session?.leadId !== resolvedLeadId) {
      sessionUpdates.leadId = resolvedLeadId;
    }
    if (Object.keys(sessionUpdates).length > 0) {
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        { $set: sessionUpdates }
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      phone: cleanPhone,
      count: messages.length,
      messages: messages.map((m) => ({
        id: String(m._id || m.messageId || `${m.sender}_${new Date(m.createdAt || Date.now()).getTime()}`),
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
            interestedCountry: session.interestedCountry || "Ireland",
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
            countryName: "International",
            countryCode: "",
            timeZone: "Asia/Kolkata",
            timeZoneLabel: "IST",
            currentStep: "WELCOME",
            interestedCountry: "Ireland",
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
    console.error("[GET /api/whatsapp-ireland/conversations/[phone]/messages Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp-ireland/conversations/[phone]/messages
 * Dispatches an outbound manual WhatsApp message from an Admin to an Ireland candidate.
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
      await db.collection("whatsapp_ireland_sessions").updateOne(
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
      return NextResponse.json({ error: "Message text cannot be empty" }, { status: 400 });
    }

    const adminName = payload.name || "Admin";

    // 1. Dispatch through Ireland WhatsApp Meta Cloud API client
    const sendResult = await sendTextMessage(cleanPhone, msgToSend, {
      skipLog: true,
      sender: "admin",
      senderName: adminName,
    });

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || "Failed to send WhatsApp message" },
        { status: 502 }
      );
    }

    // 2. Explicitly log into whatsapp_ireland_messages
    await logWhatsAppIrelandMessage({
      db,
      phone: cleanPhone,
      sender: "admin",
      senderName: adminName,
      text: msgToSend,
      msgType: "text",
      messageId: sendResult.messageId,
      createdAt: now,
    });

    // 3. Record in whatsapp_ireland_outgoing_logs for audit
    await db.collection("whatsapp_ireland_outgoing_logs").insertOne({
      phone: cleanPhone,
      recipientName: "Candidate",
      message: msgToSend,
      sentByName: adminName,
      sentById: payload.id,
      sentByRole: payload.role,
      messageId: sendResult.messageId || null,
      simulated: Boolean(sendResult.simulated),
      createdAt: now,
    });

    // 4. Update session
    await db.collection("whatsapp_ireland_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          lastMessage: msgToSend,
          lastMessageAt: now,
          lastSender: "admin",
          lastOutboundMessage: msgToSend,
          lastOutboundAt: now,
          updatedAt: now,
        },
      }
    );

    // 5. Update CRM lead timeline if lead exists
    const session = await db.collection("whatsapp_ireland_sessions").findOne({ phone: cleanPhone });
    const lead = await findMatchingCrmLead(db, cleanPhone, session, "whatsapp_ireland_sessions");

    if (lead) {
      await db.collection("leads").updateOne(
        { id: lead.id },
        {
          $push: {
            history: {
              action: "whatsapp_ireland_message_sent",
              performedByName: adminName,
              timestamp: now,
              details: `Admin replied on Ireland WhatsApp (+${cleanPhone}): "${msgToSend.slice(0, 100)}${msgToSend.length > 100 ? "..." : ""}"`,
            } as any,
          },
          $set: { updatedAt: now },
        }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      simulated: sendResult.simulated || false,
      message: {
        id: sendResult.messageId || `msg_${Date.now()}`,
        sender: "admin",
        senderName: adminName,
        text: msgToSend,
        msgType: "text",
        createdAt: now,
      },
    });
  } catch (err) {
    console.error("[POST /api/whatsapp-ireland/conversations/[phone]/messages Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
