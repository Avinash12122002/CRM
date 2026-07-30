import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload, logBDActivity } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE } from "@/lib/bd/constants";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const leadId = parseInt(id);

    const { db } = await connectToDatabase();
    const lead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Permission check: BD user must be the assignee, sales/meeting must be the creator,
    // admin can view anything.
    const canView =
      payload.role === "admin" ||
      (payload.role === BD_ROLE && lead.assignedTo === payload.id) ||
      lead.createdBy === payload.id;

    if (!canView) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const history = await db
      .collection(BD_COLLECTIONS.pipelineHistory)
      .find({ leadId })
      .sort({ changedAt: 1 })
      .toArray();

    const notes = await db
      .collection(BD_COLLECTIONS.notes)
      .find({ leadId })
      .sort({ createdAt: -1 })
      .toArray();

    const canEdit =
      lead.status === "active" &&
      !lead.locked &&
      (payload.role === "admin" ||
        (payload.role === BD_ROLE && lead.assignedTo === payload.id));

    return NextResponse.json({ lead, history, notes, canEdit });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}

// Admin-only: permanently delete a BD lead, along with its pipeline history
// and notes. Used from the BD Leads admin table's Delete action (confirmed
// client-side before this is ever called).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const leadId = parseInt(id);
    if (Number.isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead id" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const lead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Audit trail entry recorded before the lead itself is removed, so
    // there's still a record of who deleted what and when.
    await logBDActivity({
      db,
      leadId,
      action: "Lead Deleted",
      userId: payload.id,
      userName: payload.name,
      previousValue: { companyName: lead.companyName, industry: lead.industry },
      newValue: null,
    });

    await db.collection(BD_COLLECTIONS.leads).deleteOne({ id: leadId });
    await db.collection(BD_COLLECTIONS.pipelineHistory).deleteMany({ leadId });
    await db.collection(BD_COLLECTIONS.notes).deleteMany({ leadId });

    return NextResponse.json({ message: "Lead deleted" });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
