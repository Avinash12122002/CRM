import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { sendWhatsAppInfoEmail } from "@/lib/whatsapp/infoEmail";

export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { phone, name, email, leadId } = await req.json();

    if (!email || !phone) {
      return NextResponse.json(
        { message: "Email and phone are required" },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppInfoEmail({
      phone,
      name,
      email,
      leadId: leadId ? Number(leadId) : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { message: "Failed to send email", error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Information email sent successfully from info@tmsvisa.com",
      data: result,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp/send-info-email]", err);
    return NextResponse.json(
      { message: "Server error", error: String(err) },
      { status: 500 }
    );
  }
}
