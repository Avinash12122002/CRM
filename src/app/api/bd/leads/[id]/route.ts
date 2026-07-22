import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
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
