import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { getTokenPayload, getAuthorizedCandidateLead } from "@/lib/caseMarketingAuth";
import { getPhaseConfig } from "@/lib/caseMarketing";

// GET /api/case-marketing/:leadId/sources?phase=1
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { leadId: leadIdParam } = await context.params;
    const leadId = parseInt(leadIdParam);
    const { db } = await connectToDatabase();

    const auth = await getAuthorizedCandidateLead(db, leadId, payload);
    if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

    const { searchParams } = new URL(req.url);
    const phaseParam = searchParams.get("phase");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { leadId };
    if (phaseParam) filter.phase = parseInt(phaseParam);

    const sources = await db
      .collection("case_marketing_sources")
      .find(filter)
      .sort({ phase: 1, order: 1 })
      .toArray();

    return NextResponse.json({ sources });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}

// POST /api/case-marketing/:leadId/sources  { phase, names: string[] }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { leadId: leadIdParam } = await context.params;
    const leadId = parseInt(leadIdParam);
    const { db } = await connectToDatabase();

    const auth = await getAuthorizedCandidateLead(db, leadId, payload);
    if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

    const body = await req.json();
    const phase = parseInt(body.phase);
    const rawNames: string[] = Array.isArray(body.names) ? body.names : [];

    const phaseConfig = getPhaseConfig(phase);
    if (!phaseConfig) {
      return NextResponse.json({ message: "Invalid phase" }, { status: 400 });
    }

    const names = rawNames
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter((n) => n.length > 0);

    if (names.length === 0) {
      return NextResponse.json(
        { message: `Enter at least one ${phaseConfig.sourceLabel.toLowerCase()}` },
        { status: 400 },
      );
    }

    const existing = await db
      .collection("case_marketing_sources")
      .find({ leadId, phase })
      .toArray();

    const existingNamesLower = new Set(existing.map((s) => String(s.name).toLowerCase()));
    let nextOrder = existing.length;
    const now = new Date();
    const toInsert = [];

    for (const name of names) {
      if (existingNamesLower.has(name.toLowerCase())) continue; // skip duplicates within this phase
      const id = await getNextId(db, "case_marketing_sources");
      toInsert.push({
        id,
        leadId,
        phase,
        name,
        order: nextOrder,
        status: "pending", // pending | active | completed
        createdAt: now,
        createdBy: payload.id,
        createdByName: payload.name,
      });
      existingNamesLower.add(name.toLowerCase());
      nextOrder += 1;
    }

    if (toInsert.length === 0) {
      return NextResponse.json(
        { message: "All of those have already been added" },
        { status: 400 },
      );
    }

    await db.collection("case_marketing_sources").insertMany(toInsert);

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: { updatedAt: now },
        $push: {
          history: {
            action: "marketing_sources_added",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: `Phase ${phase} · ${phaseConfig.label}: added ${toInsert.length} ${phaseConfig.sourceLabelPlural.toLowerCase()} (${toInsert
              .map((s) => s.name)
              .join(", ")})`,
          },
        },
      },
    );

    return NextResponse.json({ message: "Saved", added: toInsert.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
