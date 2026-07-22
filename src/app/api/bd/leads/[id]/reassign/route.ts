import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { createNotification } from "@/lib/notifications";
import { getAuthPayload, logBDActivity } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE } from "@/lib/bd/constants";

/**
 * Admin-only: move a BD lead in the `bdleads` collection to a different
 * Business Development user. This is the missing "Reassign Leads" admin
 * capability from the spec — the old /api/leads/assign route only operated on
 * the legacy `leads` collection, not the BD pipeline's `bdleads`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Reassigning someone else's lead is an admin-only capability.
    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const leadId = parseInt(id);
    const body = await req.json();
    const assignedTo = Number(body?.assignedTo);

    if (!assignedTo || Number.isNaN(assignedTo)) {
      return NextResponse.json(
        { message: "A target Business Development user is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const lead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // A closed lead (Deal Done / Lost) is owned by Admin and locked — don't
    // allow bouncing it back to a BD user.
    if (lead.status !== "active" || lead.locked) {
      return NextResponse.json(
        { message: "This lead is closed and can no longer be reassigned" },
        { status: 400 }
      );
    }

    const target = await db
      .collection("users")
      .findOne({ id: assignedTo }, { projection: { id: 1, name: 1, role: 1 } });

    if (!target) {
      return NextResponse.json(
        { message: "Target user not found" },
        { status: 400 }
      );
    }
    if (target.role !== BD_ROLE) {
      return NextResponse.json(
        { message: "Leads can only be reassigned to Business Development users" },
        { status: 400 }
      );
    }

    if (lead.assignedTo === target.id) {
      return NextResponse.json(
        { message: "Lead is already assigned to this user", lead },
        { status: 400 }
      );
    }

    const now = new Date();
    const previousOwnerId = lead.assignedTo;
    const previousOwnerName = lead.assignedToName;

    await db.collection(BD_COLLECTIONS.leads).updateOne(
      { id: leadId },
      {
        $set: {
          assignedTo: target.id,
          assignedToName: target.name,
          updatedAt: now,
        },
      }
    );

    await logBDActivity({
      db,
      leadId,
      action: "Lead Reassigned",
      userId: payload.id,
      userName: payload.name,
      previousValue: { assignedTo: previousOwnerId, assignedToName: previousOwnerName },
      newValue: { assignedTo: target.id, assignedToName: target.name },
    });

    // Notify the new owner.
    await createNotification({
      userId: target.id,
      title: "Lead Reassigned to You",
      message: `${lead.companyName || "A lead"} was reassigned to you by ${payload.name}`,
      type: "bd_lead_assigned",
      link: `/dashboard/bd-pipeline/${leadId}`,
    });

    // Let the previous owner know it left their pipeline.
    if (previousOwnerId && previousOwnerId !== target.id) {
      await createNotification({
        userId: previousOwnerId,
        title: "Lead Reassigned",
        message: `${lead.companyName || "A lead"} was moved to ${target.name} by ${payload.name}`,
        type: "bd_lead_reassigned",
        link: `/dashboard/bd-leads`,
      });
    }

    const updatedLead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    return NextResponse.json({
      message: `Lead reassigned to ${target.name}`,
      lead: updatedLead,
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
