import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload, getAuthorizedCandidateLead } from "@/lib/caseMarketingAuth";
import { getPhaseConfig } from "@/lib/caseMarketing";

// PATCH /api/case-marketing/:leadId/sources/:sourceId  { action: "select" | "complete" }
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ leadId: string; sourceId: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { leadId: leadIdParam, sourceId: sourceIdParam } = await context.params;
    const leadId = parseInt(leadIdParam);
    const sourceId = parseInt(sourceIdParam);
    const { db } = await connectToDatabase();

    const auth = await getAuthorizedCandidateLead(db, leadId, payload);
    if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

    const body = await req.json();
    const action = body.action;

    const source = await db
      .collection("case_marketing_sources")
      .findOne({ id: sourceId, leadId });
    if (!source) {
      return NextResponse.json({ message: "Source not found" }, { status: 404 });
    }

    const phaseConfig = getPhaseConfig(source.phase);
    const now = new Date();

    if (action === "select") {
      if (source.status === "completed") {
        return NextResponse.json({ message: "This one is already completed" }, { status: 400 });
      }
      if (source.status === "active") {
        return NextResponse.json({ message: "Already active", source });
      }

      const phaseSources = await db
        .collection("case_marketing_sources")
        .find({ leadId, phase: source.phase })
        .sort({ order: 1 })
        .toArray();

      const firstUnlocked = phaseSources.find((s) => s.status !== "completed");
      if (!firstUnlocked || firstUnlocked.id !== sourceId) {
        return NextResponse.json(
          {
            message: `Locked. Complete "${firstUnlocked?.name}" first before starting this one.`,
          },
          { status: 400 },
        );
      }

      // Only one active source per phase — demote any stray active ones.
      await db.collection("case_marketing_sources").updateMany(
        { leadId, phase: source.phase, status: "active" },
        { $set: { status: "pending" } },
      );

      await db.collection("case_marketing_sources").updateOne(
        { id: sourceId },
        { $set: { status: "active", startedAt: source.startedAt || now } },
      );

      await db.collection("leads").updateOne(
        { id: leadId },
        {
          $set: { updatedAt: now },
          $push: {
            history: {
              action: "marketing_source_selected",
              performedBy: payload.id,
              performedByName: payload.name,
              timestamp: now,
              details: `Phase ${source.phase} · ${phaseConfig?.label}: started research on "${source.name}"`,
            },
          },
        },
      );

      const updated = await db.collection("case_marketing_sources").findOne({ id: sourceId });
      return NextResponse.json({ message: "Started", source: updated });
    }

    if (action === "complete") {
      if (source.status !== "active") {
        return NextResponse.json(
          { message: "Select this source and start research before completing it" },
          { status: 400 },
        );
      }

      const employers = await db
        .collection("case_marketing_employers")
        .find({ sourceId })
        .toArray();

      if (employers.length === 0) {
        return NextResponse.json(
          { message: "Add at least one employer before marking this complete" },
          { status: 400 },
        );
      }

      await db.collection("case_marketing_sources").updateOne(
        { id: sourceId },
        {
          $set: {
            status: "completed",
            completedAt: now,
            completedBy: payload.id,
            completedByName: payload.name,
          },
        },
      );

      await db.collection("leads").updateOne(
        { id: leadId },
        {
          $set: { updatedAt: now },
          $push: {
            history: {
              action: "marketing_source_completed",
              performedBy: payload.id,
              performedByName: payload.name,
              timestamp: now,
              details: `Phase ${source.phase} · ${phaseConfig?.label}: completed "${source.name}" (${employers.length} employers emailed)`,
            },
          },
        },
      );

      const updated = await db.collection("case_marketing_sources").findOne({ id: sourceId });
      return NextResponse.json({ message: "Completed", source: updated });
    }

    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
