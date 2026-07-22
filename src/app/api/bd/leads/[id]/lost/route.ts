import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { getAuthPayload, logBDActivity } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE } from "@/lib/bd/constants";

export async function POST(
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
    const body = await req.json();
    const reason: string | undefined = body?.reason?.trim();

    if (!reason) {
      return NextResponse.json(
        { message: "A reason is required to mark this lead as lost" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const lead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    const isOwnerBD = payload.role === BD_ROLE && lead.assignedTo === payload.id;
    const isAdmin = payload.role === "admin";

    if (!isOwnerBD && !isAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (lead.status !== "active" || lead.locked) {
      return NextResponse.json(
        { message: "This lead is already closed" },
        { status: 400 }
      );
    }

    const now = new Date();

    await db.collection(BD_COLLECTIONS.leads).updateOne(
      { id: leadId },
      {
        $set: {
          status: "lost",
          lostDate: now,
          locked: true,
          updatedAt: now,
        },
      }
    );

    const historyId = await getNextId(db, BD_COLLECTIONS.pipelineHistory);
    await db.collection(BD_COLLECTIONS.pipelineHistory).insertOne({
      id: historyId,
      leadId,
      fromStage: lead.pipelineStage,
      toStage: "Lead Lost",
      note: reason,
      changedBy: payload.id,
      changedByName: payload.name,
      changedAt: now,
    });

    await logBDActivity({
      db,
      leadId,
      action: "Lead Lost",
      userId: payload.id,
      userName: payload.name,
      previousValue: lead.pipelineStage,
      newValue: "Lead Lost",
    });
    await logBDActivity({
      db,
      leadId,
      action: "Ownership Changed",
      userId: payload.id,
      userName: payload.name,
      previousValue: lead.assignedToName,
      newValue: "Admin",
    });

    const updatedLead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    return NextResponse.json({ message: "Lead marked as lost", lead: updatedLead });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
