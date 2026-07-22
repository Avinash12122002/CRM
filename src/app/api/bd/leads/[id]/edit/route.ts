import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload, logBDActivity } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE, PRIORITIES, INDUSTRIES, LEAD_SOURCES } from "@/lib/bd/constants";

// Fields Business Development is allowed to edit until Deal Done / Lead Lost.
// Every field captured at lead creation is editable except assignedTo and createdBy.
const EDITABLE_FIELDS = [
  "industry",
  "email",
  "phoneNumber",
  "companyName",
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "decisionMakerName",
  "decisionMakerPosition",
  "country",
  "address",
  "leadSource",
  "leadSourceOther",
  "remarks",
  "priority",
] as const;

export async function PATCH(
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
        { message: "This lead is closed (Deal Done / Lost) and can no longer be edited" },
        { status: 400 }
      );
    }

    if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ message: "Invalid priority value" }, { status: 400 });
    }

    if (body.industry !== undefined && !INDUSTRIES.includes(body.industry)) {
      return NextResponse.json({ message: "Invalid industry" }, { status: 400 });
    }

    if (
      body.leadSource !== undefined &&
      body.leadSource !== "" &&
      !LEAD_SOURCES.includes(body.leadSource)
    ) {
      return NextResponse.json({ message: "Invalid lead source" }, { status: 400 });
    }

    const effectiveLeadSource =
      body.leadSource !== undefined ? body.leadSource : lead.leadSource;
    const effectiveLeadSourceOther =
      body.leadSourceOther !== undefined ? body.leadSourceOther : lead.leadSourceOther;
    if (effectiveLeadSource === "Job Portals" && !effectiveLeadSourceOther?.trim()) {
      return NextResponse.json(
        { message: "Please enter the job portal name" },
        { status: 400 }
      );
    }
    // Clear the job portal name if the lead source is changed away from Job Portals
    if (body.leadSource !== undefined && body.leadSource !== "Job Portals") {
      body.leadSourceOther = "";
    }

    if (body.industry !== undefined && !String(body.industry).trim()) {
      return NextResponse.json({ message: "Industry is required" }, { status: 400 });
    }
    if (body.country !== undefined && !String(body.country).trim()) {
      return NextResponse.json({ message: "Country is required" }, { status: 400 });
    }
    if (body.website !== undefined && !String(body.website).trim()) {
      return NextResponse.json({ message: "Website is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateFields: Record<string, any> = {};
    const changes: { field: string; from: unknown; to: unknown }[] = [];

    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        const newVal =
          typeof body[field] === "string" ? body[field].trim() : body[field];
        if (newVal !== lead[field]) {
          updateFields[field] = newVal;
          changes.push({ field, from: lead[field], to: newVal });
        }
      }
    }

    if (!Object.keys(updateFields).length) {
      return NextResponse.json({ message: "No changes to save", lead });
    }

    updateFields.updatedAt = new Date();

    await db.collection(BD_COLLECTIONS.leads).updateOne({ id: leadId }, { $set: updateFields });

    for (const change of changes) {
      await logBDActivity({
        db,
        leadId,
        action: "Lead Edited",
        userId: payload.id,
        userName: payload.name,
        previousValue: { [change.field]: change.from },
        newValue: { [change.field]: change.to },
      });
    }

    const updatedLead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    return NextResponse.json({ message: "Lead updated", lead: updatedLead });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
