import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/whatsapp-ireland/conversations/unread
 * Returns total unread Ireland WhatsApp candidate messages for navbar badge.
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ unreadCount: 0 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ unreadCount: 0 });
    }

    const { db } = await connectToDatabase();

    // Piggyback self-healing check: trigger any due prompts/reminders
    import("@/lib/whatsapp-ireland/followupEngine")
      .then(({ runWhatsAppIrelandFollowupEngine }) => runWhatsAppIrelandFollowupEngine(db))
      .catch((e) => console.warn("[ireland-unread-poll] WhatsApp engine check error:", e));

    const result = await db
      .collection("whatsapp_ireland_sessions")
      .aggregate([
        { $match: { unreadCount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: "$unreadCount" } } },
      ])
      .toArray();

    const unreadCount = result[0]?.total || 0;

    return NextResponse.json({
      success: true,
      unreadCount,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp-ireland/conversations/unread Error]", err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
