import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { syncOrCreateCrmLead } from "@/lib/whatsapp-ireland/leadLookup";

/**
 * POST /api/whatsapp-ireland/conversations/[phone]/sync-lead
 * Explicitly links an existing CRM lead or creates a new CRM lead for this WhatsApp Ireland conversation.
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
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    const { phone } = await context.params;
    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");

    const { db } = await connectToDatabase();
    const session = await db.collection("whatsapp_ireland_sessions").findOne({ phone: cleanPhone });

    const lead = await syncOrCreateCrmLead(db, cleanPhone, session, {
      assignedToUserId: payload.id,
      assignedToUserName: payload.name,
      assignedToUserRole: payload.role,
      destination: "Ireland",
      sessionsCollection: "whatsapp_ireland_sessions",
    });

    return NextResponse.json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        assignedToName: lead.assignedToName,
      },
    });
  } catch (err) {
    console.error("[POST /api/whatsapp-ireland/conversations/[phone]/sync-lead Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
