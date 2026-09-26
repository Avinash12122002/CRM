import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

/**
  * GET: Fetch recent OTPs and incoming verification messages
  */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized. Token missing." }, { status: 401 });
    }
    const payload = verifyToken(token);

    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    // 1. Fetch from whatsapp_otps
    const otps = await db
      .collection("whatsapp_otps")
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // 2. Fetch latest raw incoming messages in case code was formatted differently
    const recentLogs = await db
      .collection("whatsapp_incoming_logs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(15)
      .project({ _id: 0, phone: 1, senderName: 1, textBody: 1, msgType: 1, createdAt: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      latestOtps: otps.map((o) => ({
        id: o._id,
        phone: o.phone,
        sender: o.senderName,
        code: o.code,
        receivedAt: o.createdAt,
      })),
      recentIncomingMessages: recentLogs,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp/otp Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
