import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/whatsapp/conversations/unread
 * Returns total unread WhatsApp candidate messages for navbar badge.
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

    const result = await db
      .collection("whatsapp_sessions")
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
    console.error("[GET /api/whatsapp/conversations/unread Error]", err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
