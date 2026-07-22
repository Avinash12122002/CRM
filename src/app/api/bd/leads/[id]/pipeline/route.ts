import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { getAuthPayload, logBDActivity, getAdminUser } from "@/lib/bd/helpers";
import {
  BD_COLLECTIONS,
  BD_ROLE,
  PIPELINE_STAGES,
  PRIORITIES,
} from "@/lib/bd/constants";

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
    const note: string | undefined = body?.note?.trim();
    const priority: string | undefined = body?.priority;

    if (!note) {
      return NextResponse.json(
        { message: "A note is required to move this lead forward" },
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
        { message: "This lead is closed (Deal Done / Lost) and can no longer be moved" },
        { status: 400 }
      );
    }

    const currentIndex = PIPELINE_STAGES.indexOf(lead.pipelineStage);
    if (currentIndex === -1 || currentIndex === PIPELINE_STAGES.length - 1) {
      return NextResponse.json(
        { message: "Lead is already at the final stage" },
        { status: 400 }
      );
    }

    const nextStage = PIPELINE_STAGES[currentIndex + 1];

    if (nextStage === "Priority Set") {
      if (!priority || !PRIORITIES.includes(priority as never)) {
        return NextResponse.json(
          { message: "Priority (High / Medium / Low) is required for this step" },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateFields: Record<string, any> = {
      pipelineStage: nextStage,
      updatedAt: now,
    };

    if (nextStage === "Priority Set") {
      updateFields.priority = priority;
    }

    const isDealDone = nextStage === "Deal Done";
    let newOwner: { id: number; name: string } | null = null;
    if (isDealDone) {
      updateFields.status = "deal_done";
      updateFields.completedDate = now;
      updateFields.locked = true;

      // Ownership transfers to Admin once a deal closes. Resolve a real
      // admin account and actually move assignedTo — previously this only
      // logged an "Ownership Changed" activity entry without touching the
      // lead, so filters/views keyed on assignedTo never reflected it.
      newOwner = await getAdminUser(db, payload);
      if (newOwner) {
        updateFields.assignedTo = newOwner.id;
        updateFields.assignedToName = newOwner.name;
      }
    }

    await db.collection(BD_COLLECTIONS.leads).updateOne({ id: leadId }, { $set: updateFields });

    // Pipeline history entry (immutable)
    const historyId = await getNextId(db, BD_COLLECTIONS.pipelineHistory);
    await db.collection(BD_COLLECTIONS.pipelineHistory).insertOne({
      id: historyId,
      leadId,
      fromStage: lead.pipelineStage,
      toStage: nextStage,
      note,
      changedBy: payload.id,
      changedByName: payload.name,
      changedAt: now,
    });

    await logBDActivity({
      db,
      leadId,
      action: "Pipeline Changed",
      userId: payload.id,
      userName: payload.name,
      previousValue: lead.pipelineStage,
      newValue: nextStage,
    });

    if (nextStage === "Priority Set") {
      await logBDActivity({
        db,
        leadId,
        action: "Priority Changed",
        userId: payload.id,
        userName: payload.name,
        previousValue: lead.priority || null,
        newValue: priority,
      });
    }

    if (isDealDone) {
      await logBDActivity({
        db,
        leadId,
        action: "Deal Done",
        userId: payload.id,
        userName: payload.name,
      });
      if (newOwner) {
        await logBDActivity({
          db,
          leadId,
          action: "Ownership Changed",
          userId: payload.id,
          userName: payload.name,
          previousValue: lead.assignedToName,
          newValue: newOwner.name,
        });
      }

      // Notify creator that their lead resulted in a deal
      await createNotification({
        userId: lead.createdBy,
        title: "Deal Done",
        message: `${lead.companyName} was closed as a deal by ${payload.name}`,
        type: "bd_deal_done",
        link: `/dashboard/bd-pipeline/${leadId}`,
      });
    }

    const updatedLead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    return NextResponse.json({ message: `Moved to ${nextStage}`, lead: updatedLead });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}