import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const leadId = parseInt(id);

    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    // Validate status
    const validStatuses = [
      "new-lead",
      "call-back",
      "not-answering",
      "meeting-scheduled",
      "not-interested",
      "wrong-number",
      "document-pending",
      "payment-pending",
      "sales",
    ];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          message:
            "Invalid status. Must be one of: new-lead, call-back, not-answering, meeting-scheduled, not-interested, wrong-number, document-pending, payment-pending, sales",
        },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    // Find the lead
    const lead = await db.collection("leads").findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Admins can update any lead status, employees can only update leads assigned to them
    if (
      (payload.role === "employee" || payload.role === "meeting") && lead.assignedTo !== payload.id){
      return NextResponse.json(
        { message: "You can only update status of leads assigned to you" },
        { status: 403 },
      );
    }
    // Admins have no restrictions - they can update any lead status

    const now = new Date();
    const oldStatus = lead.status;

    // Update the lead status
    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          status,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "status_updated",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: `Status changed from "${oldStatus}" to "${status}"`,
            oldStatus,
            newStatus: status,
          },
        },
      },
    );

    return NextResponse.json(
      {
        message: "Lead status updated successfully",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
