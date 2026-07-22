import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import {
  getAuthPayload,
  pickNextBDUser,
  logBDActivity,
} from "@/lib/bd/helpers";
import {
  BD_COLLECTIONS,
  BD_ROLE,
  DATA_ENTRY_ROLES,
  DAILY_LEAD_TARGET,
  INDUSTRIES,
  LEAD_SOURCES,
} from "@/lib/bd/constants";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function POST(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Sales/Meeting submit through the Data Entry module (daily quota, round-robin
    // assignment). Business Development creates and self-assigns their own leads
    // directly from the BD Pipeline page — no quota, no round-robin.
    const isSelfAssign = payload.role === BD_ROLE;

    if (!DATA_ENTRY_ROLES.includes(payload.role) && !isSelfAssign) {
      return NextResponse.json(
        { message: "Only Sales Team, Meeting Team and Business Development can submit leads" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      workingDate, // YYYY-MM-DD, chosen by the user for this session (Data Entry only)
      industry,
      companyName,
      email,
      website,
      linkedin,
      facebook,
      instagram,
      decisionMakerName,
      decisionMakerPosition,
      phoneNumber,
      country,
      address,
      leadSource,
      leadSourceOther,
      remarks,
    } = body;

    if (!isSelfAssign && !workingDate) {
      return NextResponse.json(
        { message: "Working date is required" },
        { status: 400 }
      );
    }

    // Mandatory fields: Industry, Country and Website only.
    const required = { industry, country, website };
    const missing = Object.entries(required)
      .filter(([, v]) => !v || !String(v).trim())
      .map(([k]) => k);

    if (missing.length) {
      return NextResponse.json(
        { message: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    if (!INDUSTRIES.includes(industry)) {
      return NextResponse.json({ message: "Invalid industry" }, { status: 400 });
    }

    if (leadSource && !LEAD_SOURCES.includes(leadSource)) {
      return NextResponse.json({ message: "Invalid lead source" }, { status: 400 });
    }

    // Job Portal name is mandatory only when "Job Portals" is chosen as the lead source.
    if (leadSource === "Job Portals" && !leadSourceOther?.trim()) {
      return NextResponse.json(
        { message: "Please enter the job portal name" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Business Development: always self-assigned, no round robin.
    // Sales / Meeting: auto-assigned to the next BD user in rotation.
    const bdUser = isSelfAssign
      ? { id: payload.id, name: payload.name }
      : await pickNextBDUser(db);

    if (!bdUser) {
      return NextResponse.json(
        {
          message:
            "No Business Development users exist yet. Ask an admin to create one before submitting leads.",
        },
        { status: 400 }
      );
    }

    const id = await getNextId(db, BD_COLLECTIONS.leads);
    const now = new Date();
    const effectiveWorkingDate = workingDate || todayISO();

    const lead = {
      id,
      industry: industry.trim(),
      companyName: companyName?.trim() || "",
      email: email?.trim() || "",
      website: website.trim(),
      linkedin: linkedin?.trim() || null,
      facebook: facebook?.trim() || null,
      instagram: instagram?.trim() || null,
      decisionMakerName: decisionMakerName?.trim() || null,
      decisionMakerPosition: decisionMakerPosition?.trim() || null,
      phoneNumber: phoneNumber?.trim() || "",
      country: country.trim(),
      address: address?.trim() || null,
      leadSource: leadSource?.trim() || null,
      leadSourceOther: leadSource === "Job Portals" ? leadSourceOther.trim() : null,
      remarks: remarks?.trim() || null,

      priority: null,
      pipelineStage: "New Lead",
      status: "active", // active | deal_done | lost
      locked: false,

      assignedTo: bdUser.id,
      assignedToName: bdUser.name,

      createdBy: payload.id,
      createdByName: payload.name,
      createdByRole: payload.role,
      workingDate: effectiveWorkingDate, // the date the sales/meeting rep selected for their day's work

      createdAt: now,
      updatedAt: now,
      completedDate: null,
      lostDate: null,
    };

    await db.collection(BD_COLLECTIONS.leads).insertOne(lead);

    // Pipeline history: initial creation entry
    const historyId = await getNextId(db, BD_COLLECTIONS.pipelineHistory);
    await db.collection(BD_COLLECTIONS.pipelineHistory).insertOne({
      id: historyId,
      leadId: id,
      fromStage: null,
      toStage: "New Lead",
      note: isSelfAssign ? "Lead created and self-assigned" : "Lead created",
      changedBy: payload.id,
      changedByName: payload.name,
      changedAt: now,
    });

    // Audit trail
    await logBDActivity({
      db,
      leadId: id,
      action: "Lead Created",
      userId: payload.id,
      userName: payload.name,
      newValue: { companyName: lead.companyName, industry: lead.industry },
    });
    await logBDActivity({
      db,
      leadId: id,
      action: "Lead Assigned",
      userId: payload.id,
      userName: payload.name,
      newValue: { assignedTo: bdUser.id, assignedToName: bdUser.name },
    });

    let dailyProgress = null;

    if (!isSelfAssign) {
      // Daily target tracking for the submitter (Sales / Meeting only —
      // Business Development has no daily quota).
      const targetFilter = { userId: payload.id, date: effectiveWorkingDate };
      const existingTarget = await db
        .collection(BD_COLLECTIONS.dailyTargets)
        .findOne(targetFilter);

      const newTotal = (existingTarget?.totalCreated || 0) + 1;

      await db.collection(BD_COLLECTIONS.dailyTargets).updateOne(
        targetFilter,
        {
          $set: {
            userId: payload.id,
            userName: payload.name,
            date: effectiveWorkingDate,
            totalCreated: newTotal,
            targetCompleted: newTotal >= DAILY_LEAD_TARGET,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );

      dailyProgress = {
        totalCreated: newTotal,
        target: DAILY_LEAD_TARGET,
        remaining: Math.max(DAILY_LEAD_TARGET - newTotal, 0),
      };

      // Notify assigned BD user (only relevant when someone else assigned it to them)
      await createNotification({
        userId: bdUser.id,
        title: "New Lead Assigned",
        message: `${lead.companyName || "New lead"} (${industry}) assigned to you by ${payload.name}`,
        type: "bd_lead_assigned",
        link: `/dashboard/bd-pipeline/${id}`,
      });
    }

    return NextResponse.json(
      {
        message: "Lead Created Successfully",
        lead,
        assignedToName: bdUser.name,
        dailyProgress,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
