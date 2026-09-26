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
      .limit(200)
      .toArray();

    const additionalPhones = new Set<string>();
    for (const m of recentMessages) {
      if (m.phone && !sessionPhones.has(m.phone)) {
        additionalPhones.add(m.phone);
      }
    }

    // 3. For any missing phones, synthesize minimal conversation object
    const conversations = sessions.map((s) => ({
      phone: s.phone,
      name: s.name || s.senderName || "Candidate",
      email: s.email || null,
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
      leadId: s.leadId || null,
    }));

    for (const phone of additionalPhones) {
      const lastMsg = recentMessages.find((m) => m.phone === phone);
      conversations.push({
        phone,
        name: "Candidate",
        email: null,
        countryCode: phone.startsWith("91") ? "IN" : "",
        countryName: phone.startsWith("91") ? "India" : "International",
        timeZone: "Asia/Kolkata",
        timeZoneLabel: "IST",
        currentStep: "WELCOME",
        lastMessage: lastMsg?.text || "Conversation started",
        lastMessageAt: lastMsg?.createdAt || new Date(),
        lastSender: lastMsg?.sender || "candidate",
        unreadCount: 0,
        bookedSlot: null,
        leadId: null,
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

      const sendResult = await sendTextMessage(cleanPhone, initialMessage.trim());
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
