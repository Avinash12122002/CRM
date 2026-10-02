import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { sendWhatsAppIrelandInfoEmail } from "@/lib/whatsapp-ireland/infoEmail";

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
    const { phone, name, email, leadId } = body;

    if (!phone || !email) {
      return NextResponse.json(
        { error: "Candidate phone and email are required" },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppIrelandInfoEmail({
      phone,
      name,
      email,
      leadId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/whatsapp-ireland/send-info-email Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
