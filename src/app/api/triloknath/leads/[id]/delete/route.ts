import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;

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

    // Only admins can delete leads
    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const leadId = parseInt(params.id);

    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const idFilter = { $or: [{ id: leadId }, { id: String(leadId) }] };
    const leadIdFilter = { $or: [{ leadId: leadId }, { leadId: String(leadId) }] };

    // Delete all linked records across all collections
    await db.collection("meetingSlots").deleteMany(leadIdFilter);
    await db.collection("lead_workflows").deleteMany(leadIdFilter);
    await db.collection("email_history").deleteMany(leadIdFilter);
    await db.collection("invoices").deleteMany(leadIdFilter);
    await db.collection("notifications").deleteMany(leadIdFilter);
    await db.collection("case_marketing_employers").deleteMany(leadIdFilter);
    await db.collection("case_marketing_sources").deleteMany(leadIdFilter);

    // Delete the lead itself from triloknath_leads collection
    await db.collection("triloknath_leads").deleteMany(idFilter);

    return NextResponse.json({
      message: "Lead deleted successfully",
    });
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
