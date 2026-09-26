import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/whatsapp/conversations
 * Returns list of all candidate WhatsApp conversations with latest message, unread status, and profile info.
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
    const filter = searchParams.get("filter") || "all"; // "all" | "unread" | "booked"

    const { db } = await connectToDatabase();

    // 1. Fetch sessions
    const sessionFilter: Record<string, unknown> = {};
    if (filter === "unread") {
      sessionFilter.unreadCount = { $gt: 0 };
    } else if (filter === "booked") {
      sessionFilter["bookedSlot.date"] = { $exists: true, $ne: null };
    }

    const sessions = await db
      .collection("whatsapp_sessions")
      .find(sessionFilter)
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .toArray();

    // 2. Also check if there are phones in whatsapp_messages or incoming logs not in sessions
    const sessionPhones = new Set(sessions.map((s) => s.phone));
    const recentMessages = await db
      .collection("whatsapp_messages")
      .find({})
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();

    const recentIncoming = await db
      .collection("whatsapp_incoming_logs")
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

    // 3. Batch-lookup matching leads from CRM leads collection to display actual candidate names
    const allPhones = Array.from(new Set([...sessionPhones, ...additionalPhones]));
    const phoneTenDigits = allPhones
      .map((p) => p.slice(-10))
      .filter((p) => p.length >= 7);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // 4. Batch-lookup profile names captured from WhatsApp Meta contact payload
    const incomingNameMap = new Map<string, string>();
    if (allPhones.length > 0) {
      const incomingLogs = await db
        .collection("whatsapp_incoming_logs")
        .find({
          phone: { $in: allPhones },
          senderName: { $exists: true, $nin: ["Candidate", "candidate", ""] },
        })
        .sort({ createdAt: -1 })
        .toArray();

      for (const log of incomingLogs) {
        if (log.phone && log.senderName && !incomingNameMap.has(log.phone)) {
          incomingNameMap.set(log.phone, log.senderName);
        }
      }
    }

    // 5. Synthesize conversations with real candidate names
    const conversations = sessions.map((s) => {
      const lead = leadMapByPhone.get(s.phone) || leadMapByPhone.get(s.phone.slice(-10));
      const profileName = incomingNameMap.get(s.phone);
      const actualName =
        (s.name && s.name !== "Candidate" && !s.name.toLowerCase().includes("test") ? s.name : null) ||
        lead?.name ||
        profileName ||
        (s.senderName && s.senderName !== "Candidate" && !s.senderName.toLowerCase().includes("test") ? s.senderName : null) ||
        "Candidate";

      // Self-heal: If we discovered the actual name and the session had generic "Candidate", update session
      if (actualName !== "Candidate" && (!s.name || s.name === "Candidate" || s.name.toLowerCase().includes("test"))) {
        db.collection("whatsapp_sessions")
          .updateOne(
            { phone: s.phone },
            { $set: { name: actualName, leadId: lead?.id || s.leadId || undefined } }
          )
          .catch(() => {});
      }

      return {
        phone: s.phone,
        name: actualName,
        email: s.email || lead?.email || null,
        countryCode: s.countryCode || (s.phone.startsWith("91") ? "IN" : ""),
        countryName: s.countryName || (s.phone.startsWith("91") ? "India" : "International"),
        timeZone: s.timeZone || "Asia/Kolkata",
        timeZoneLabel: s.timeZoneLabel || "IST",
        currentStep: s.currentStep || "WELCOME",
        lastMessage: s.lastMessage || s.lastOutboundMessage || "Started WhatsApp conversation",
        lastMessageAt: s.lastMessageAt || s.lastOutboundAt || s.updatedAt || s.createdAt,
        lastSender: s.lastSender || "bot",
        unreadCount: s.unreadCount || 0,
        bookedSlot: s.bookedSlot || null,
        leadId: lead?.id || s.leadId || null,
      };
    });

    for (const phone of additionalPhones) {
      const lastMsg = recentMessages.find((m) => m.phone === phone);
      const lastInc = recentIncoming.find((i) => i.phone === phone);
      const lead = leadMapByPhone.get(phone) || leadMapByPhone.get(phone.slice(-10));
      const profileName = incomingNameMap.get(phone);
      const actualName =
        lead?.name ||
        profileName ||
        (lastMsg?.senderName && lastMsg.senderName !== "Candidate" ? lastMsg.senderName : null) ||
        (lastInc?.senderName && lastInc.senderName !== "Candidate" ? lastInc.senderName : null) ||
        "Candidate";

      conversations.push({
        phone,
        name: actualName,
        email: lead?.email || null,
        countryCode: phone.startsWith("91") ? "IN" : "",
        countryName: phone.startsWith("91") ? "India" : "International",
        timeZone: "Asia/Kolkata",
        timeZoneLabel: "IST",
        currentStep: "WELCOME",
        lastMessage: lastMsg?.text || lastInc?.textBody || "Conversation started",
        lastMessageAt: lastMsg?.createdAt || lastInc?.createdAt || new Date(),
        lastSender: lastMsg?.sender || "candidate",
        unreadCount: 0,
        bookedSlot: null,
        leadId: lead?.id || null,
      });
    }

    // Sort by latest message descending
    conversations.sort((a, b) => {
      const timeA = new Date(a.lastMessageAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || 0).getTime();
      return timeB - timeA;
    });

    // Filter by search query if provided
    const filtered = query
      ? conversations.filter(
          (c) =>
            c.phone.toLowerCase().includes(query) ||
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.lastMessage && c.lastMessage.toLowerCase().includes(query))
        )
      : conversations;

    const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

    return NextResponse.json({
      success: true,
      conversations: filtered,
      totalCount: filtered.length,
      totalUnread,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/conversations
 * Start or register a new conversation with a candidate phone number.
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

    const cleanPhone = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json({ error: "Valid phone number with country code is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    const { detectCountryFromPhone } = await import("@/lib/whatsapp/timezone");
    const countryInfo = detectCountryFromPhone(cleanPhone);

    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          phone: cleanPhone,
          name: name || undefined,
          email: email || undefined,
          countryCode: countryInfo.countryCode,
          countryName: countryInfo.countryName,
          timeZone: countryInfo.timeZone,
          timeZoneLabel: countryInfo.label,
          updatedAt: now,
        },
        $setOnInsert: {
          currentStep: "WELCOME",
          followupCount: 0,
          createdAt: now,
          unreadCount: 0,
        },
      },
      { upsert: true }
    );

    // If initialMessage was provided, dispatch it right away!
    if (initialMessage && typeof initialMessage === "string" && initialMessage.trim()) {
      const { sendTextMessage } = await import("@/lib/whatsapp/client");
      const { logWhatsAppMessage } = await import("@/lib/whatsapp/messageLogger");

      const sendResult = await sendTextMessage(cleanPhone, initialMessage.trim(), { skipLog: true });
      await logWhatsAppMessage({
        db,
        phone: cleanPhone,
        sender: "admin",
        senderName: payload.name || "Admin",
        text: initialMessage.trim(),
        messageId: sendResult.messageId,
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      phone: cleanPhone,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/whatsapp/conversations
 * Delete one or multiple WhatsApp candidate conversations, sessions, and messages.
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

    const { db } = await connectToDatabase();

    // 1. Delete from whatsapp_sessions
    const sessionRes = await db.collection("whatsapp_sessions").deleteMany({
      phone: { $in: cleanPhones },
    });

    // 2. Delete from whatsapp_messages
    const msgRes = await db.collection("whatsapp_messages").deleteMany({
      $or: [
        { phone: { $in: cleanPhones } },
        { from: { $in: cleanPhones } },
        { to: { $in: cleanPhones } },
      ],
    });

    // 3. Delete from logs
    await db.collection("whatsapp_incoming_logs").deleteMany({
      $or: [{ phone: { $in: cleanPhones } }, { from: { $in: cleanPhones } }],
    });
    await db.collection("whatsapp_outgoing_logs").deleteMany({
      $or: [{ phone: { $in: cleanPhones } }, { to: { $in: cleanPhones } }],
    });

    // 4. Release any scheduled meeting slots for these candidates so they become free for others
    await db.collection("meetingSlots").updateMany(
      {
        phone: { $in: cleanPhones },
        status: "scheduled",
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledReason: "WhatsApp conversation deleted by admin",
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      deletedSessions: sessionRes.deletedCount,
      deletedMessages: msgRes.deletedCount,
      deletedPhones: cleanPhones,
    });
  } catch (err) {
    console.error("[DELETE /api/whatsapp/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/whatsapp/conversations
 * Update candidate actual name or profile details for a WhatsApp conversation.
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
    const { phone, name, email } = body;

    const cleanPhone = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
    if (!cleanPhone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }

    const trimmedName = typeof name === "string" ? name.trim() : undefined;
    const trimmedEmail = typeof email === "string" ? email.trim() : undefined;

    const { db } = await connectToDatabase();
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (trimmedName !== undefined) updateFields.name = trimmedName;
    if (trimmedEmail !== undefined) updateFields.email = trimmedEmail;

    // 1. Update whatsapp_sessions
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      { $set: updateFields },
      { upsert: true }
    );

    // 2. Also update matching lead in CRM if exists
    if (trimmedName) {
      await db.collection("leads").updateMany(
        {
          $or: [
            { phone: cleanPhone },
            { phone: `+${cleanPhone}` },
            { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
          ],
        },
        { $set: { name: trimmedName, updatedAt: new Date() } }
      );
    }

    return NextResponse.json({
      success: true,
      phone: cleanPhone,
      name: trimmedName,
      email: trimmedEmail,
    });
  } catch (err) {
    console.error("[PATCH /api/whatsapp/conversations Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


