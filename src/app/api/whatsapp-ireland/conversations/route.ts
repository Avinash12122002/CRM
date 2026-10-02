import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/whatsapp-ireland/conversations
 * Returns list of all Ireland candidate WhatsApp conversations.
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const filter = searchParams.get("filter") || "all";

    const { db } = await connectToDatabase();

    // 1. Fetch Ireland sessions
    const sessionFilter: Record<string, unknown> = {};
    if (filter === "unread") {
      sessionFilter.unreadCount = { $gt: 0 };
    } else if (filter === "booked") {
      sessionFilter["bookedSlot.date"] = { $exists: true, $ne: null };
    }

    const sessions = await db
      .collection("whatsapp_ireland_sessions")
      .find(sessionFilter)
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .toArray();

    // 2. Additional phones from whatsapp_ireland_messages or logs
    const sessionPhones = new Set(sessions.map((s) => s.phone));
    const recentMessages = await db
      .collection("whatsapp_ireland_messages")
      .find({})
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();

    const recentIncoming = await db
      .collection("whatsapp_ireland_incoming_logs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();

    const additionalPhones = new Set<string>();
    for (const m of recentMessages) {
      if (m.phone && !sessionPhones.has(m.phone)) {
        additionalPhones.add(m.phone);
      }
    }
    for (const inc of recentIncoming) {
      if (inc.phone && !sessionPhones.has(inc.phone)) {
        additionalPhones.add(inc.phone);
      }
    }

    // 3. Batch-lookup matching CRM leads (prioritizing Ireland leads)
    const allPhones = Array.from(new Set([...sessionPhones, ...additionalPhones]));
    const phoneTenDigits = allPhones
      .map((p) => p.slice(-10))
      .filter((p) => p.length >= 7);

    const leadMapByPhone = new Map<string, any>();
    if (allPhones.length > 0) {
      const matchingLeads = await db
        .collection("leads")
        .find({
          $or: [
            { phone: { $in: allPhones } },
            { phone: { $in: allPhones.map((p) => `+${p}`) } },
            ...phoneTenDigits.map((p) => ({ phone: { $regex: `${p}$` } })),
          ],
        })
        .toArray();

      for (const lead of matchingLeads) {
        if (lead.phone) {
          const clean = String(lead.phone).replace(/[^\d]/g, "");
          leadMapByPhone.set(clean, lead);
          if (clean.length >= 10) {
            leadMapByPhone.set(clean.slice(-10), lead);
          }
        }
      }
    }

    // 4. Format conversations
    let conversations = sessions.map((s: any) => {
      const matchingLead =
        leadMapByPhone.get(s.phone) ||
        (s.phone.length >= 10 ? leadMapByPhone.get(s.phone.slice(-10)) : null);

      const resolvedName =
        matchingLead?.name && !matchingLead.name.toLowerCase().includes("test")
          ? matchingLead.name
          : s.name && s.name !== "Candidate" && !s.name.toLowerCase().includes("test")
          ? s.name
          : "Candidate";

      return {
        phone: s.phone,
        name: resolvedName,
        email: s.email || matchingLead?.email || null,
        countryName: s.countryName || matchingLead?.country || "International",
        countryCode: s.countryCode || "IE",
        timeZoneLabel: s.timeZoneLabel || "Europe/Dublin",
        currentStep: s.currentStep || "WELCOME",
        unreadCount: s.unreadCount || 0,
        lastMessage: s.lastMessage || "(No messages yet)",
        lastMessageAt: s.lastMessageAt || s.updatedAt || s.createdAt,
        lastSender: s.lastSender || "candidate",
        bookedSlot: s.bookedSlot || null,
        meetingStatus: s.meetingStatus || (s.bookedSlot ? "booked" : "none"),
        leadId: matchingLead?.id || s.leadId || null,
        cvFileUrl: s.cvFileUrl || matchingLead?.salesDocument || null,
        cvFileName: s.cvFileName || matchingLead?.cvFileName || null,
      };
    });

    // Merge in standalone phones
    for (const ph of additionalPhones) {
      const lastMsg = recentMessages.find((m) => m.phone === ph);
      const matchingLead =
        leadMapByPhone.get(ph) ||
        (ph.length >= 10 ? leadMapByPhone.get(ph.slice(-10)) : null);

      conversations.push({
        phone: ph,
        name: matchingLead?.name || "Candidate",
        email: matchingLead?.email || null,
        countryName: matchingLead?.country || "International",
        countryCode: "IE",
        timeZoneLabel: "Europe/Dublin",
        currentStep: "WELCOME",
        unreadCount: 0,
        lastMessage: lastMsg?.text || "(No messages yet)",
        lastMessageAt: lastMsg?.createdAt || new Date(),
        lastSender: (lastMsg?.sender as any) || "candidate",
        bookedSlot: null,
        meetingStatus: "none",
        leadId: matchingLead?.id || null,
        cvFileUrl: matchingLead?.salesDocument || null,
        cvFileName: matchingLead?.cvFileName || null,
      });
    }

    // Apply tab filter
    if (filter === "unread") {
      conversations = conversations.filter((c) => c.unreadCount > 0);
    } else if (filter === "booked") {
      conversations = conversations.filter((c) => c.bookedSlot?.date || c.meetingStatus === "booked");
    }

    // Apply search query filter if given
    if (query) {
      conversations = conversations.filter((c) => {
        return (
          c.name.toLowerCase().includes(query) ||
          c.phone.includes(query) ||
          (c.email && c.email.toLowerCase().includes(query)) ||
          c.lastMessage.toLowerCase().includes(query)
        );
      });
    }

    const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

    return NextResponse.json({
      success: true,
      count: conversations.length,
      totalCount: conversations.length,
      totalUnread,
      conversations,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp-ireland/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp-ireland/conversations
 * Starts a new Ireland WhatsApp conversation with candidate phone number.
 */
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
    const { phone, name, email, initialMessage } = body;

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
    if (cleanPhone.length < 8) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    const { db } = await connectToDatabase();
    const { getOrCreateSession, sendInitialWelcome } = await import("@/lib/whatsapp-ireland/stateMachine");

    const session = await getOrCreateSession(db, cleanPhone, name);

    if (email && typeof email === "string" && email.trim()) {
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        { $set: { email: email.trim(), updatedAt: new Date() } }
      );
    }

    if (initialMessage && typeof initialMessage === "string" && initialMessage.trim()) {
      const { sendTextMessage } = await import("@/lib/whatsapp-ireland/client");
      const { logWhatsAppIrelandMessage } = await import("@/lib/whatsapp-ireland/messageLogger");

      const sendResult = await sendTextMessage(cleanPhone, initialMessage.trim(), { skipLog: true });
      await logWhatsAppIrelandMessage({
        db,
        phone: cleanPhone,
        sender: "admin",
        senderName: payload.name || "Admin",
        text: initialMessage.trim(),
        messageId: sendResult.messageId,
        createdAt: new Date(),
      });
    } else {
      await sendInitialWelcome(cleanPhone, session.name);
    }

    return NextResponse.json({
      success: true,
      phone: cleanPhone,
      session,
      message: `Started Ireland WhatsApp conversation with +${cleanPhone}`,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp-ireland/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/whatsapp-ireland/conversations
 * Delete one or multiple Ireland WhatsApp candidate conversations, sessions, and messages.
 */
export async function DELETE(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const phoneParam = searchParams.get("phone");

    let phonesToDelete: string[] = [];
    if (phoneParam) {
      phonesToDelete.push(phoneParam);
    } else {
      try {
        const body = await req.json();
        if (Array.isArray(body.phones)) {
          phonesToDelete = body.phones;
        } else if (body.phone) {
          phonesToDelete.push(body.phone);
        }
      } catch {}
    }

    const cleanPhones = phonesToDelete
      .map((p) => String(p || "").replace(/[^\d]/g, "").replace(/^00/, ""))
      .filter((p) => p.length >= 8);

    if (cleanPhones.length === 0) {
      return NextResponse.json({ error: "Valid phone number(s) required" }, { status: 400 });
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    const { db } = await connectToDatabase();

    // 1. Delete from whatsapp_ireland_sessions
    const sessionRes = await db.collection("whatsapp_ireland_sessions").deleteMany({
      phone: { $in: cleanPhones },
    });

    // 2. Delete from whatsapp_ireland_messages
    const msgRes = await db.collection("whatsapp_ireland_messages").deleteMany({
      $or: [
        { phone: { $in: cleanPhones } },
        { from: { $in: cleanPhones } },
        { to: { $in: cleanPhones } },
      ],
    });

    // 3. Delete from logs
    await db.collection("whatsapp_ireland_incoming_logs").deleteMany({
      $or: [{ phone: { $in: cleanPhones } }, { from: { $in: cleanPhones } }],
    });
    await db.collection("whatsapp_ireland_outgoing_logs").deleteMany({
      $or: [{ phone: { $in: cleanPhones } }, { to: { $in: cleanPhones } }],
    });

    return NextResponse.json({
      success: true,
      country: "Ireland",
      deletedSessions: sessionRes.deletedCount,
      deletedMessages: msgRes.deletedCount,
      deletedPhones: cleanPhones,
    });
  } catch (err) {
    console.error("[DELETE /api/whatsapp-ireland/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/whatsapp-ireland/conversations
 * Update candidate actual name or profile details for an Ireland WhatsApp conversation.
 */
export async function PATCH(req: NextRequest) {
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
    const { phone, name, email, markAllRead } = body;

    const { db } = await connectToDatabase();

    if (markAllRead) {
      await db.collection("whatsapp_ireland_sessions").updateMany({}, { $set: { unreadCount: 0, updatedAt: new Date() } });
      return NextResponse.json({ success: true, markAllRead: true });
    }

    const cleanPhone = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
    if (!cleanPhone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }

    const trimmedName = typeof name === "string" ? name.trim() : undefined;
    const trimmedEmail = typeof email === "string" ? email.trim() : undefined;
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (trimmedName !== undefined) updateFields.name = trimmedName;
    if (trimmedEmail !== undefined) updateFields.email = trimmedEmail;

    // 1. Update whatsapp_ireland_sessions
    await db.collection("whatsapp_ireland_sessions").updateOne(
      { phone: cleanPhone },
      { $set: updateFields },
      { upsert: true }
    );

    // 2. Also update matching Ireland lead in CRM if exists
    const leadUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (trimmedName) leadUpdates.name = trimmedName;
    if (trimmedEmail) leadUpdates.email = trimmedEmail;
    if (Object.keys(leadUpdates).length > 1) {
      await db.collection("leads").updateMany(
        {
          $or: [
            { phone: cleanPhone },
            { phone: `+${cleanPhone}` },
            { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
          ],
          interestedCountry: "Ireland",
        },
        { $set: leadUpdates }
      );
    }

    return NextResponse.json({
      success: true,
      country: "Ireland",
      phone: cleanPhone,
      name: trimmedName,
      email: trimmedEmail,
    });
  } catch (err) {
    console.error("[PATCH /api/whatsapp-ireland/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
