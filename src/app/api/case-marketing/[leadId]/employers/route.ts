import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { getTokenPayload, getAuthorizedCandidateLead } from "@/lib/caseMarketingAuth";
import { getPhaseConfig } from "@/lib/caseMarketing";

const EMPLOYER_FIELDS = [
  "companyName",
  "occupation",
  "website",
  "jobUrl",
  "hrEmail",
  "generalEmail",
  "contactPerson",
  "phone",
  "city",
  "state",
  "notes",
] as const;

// GET /api/case-marketing/:leadId/employers?phase=1&sourceId=123
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
    const sourceIdParam = searchParams.get("sourceId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { leadId };
    if (phaseParam) filter.phase = parseInt(phaseParam);
    if (sourceIdParam) filter.sourceId = parseInt(sourceIdParam);

    const employers = await db
      .collection("case_marketing_employers")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ employers });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}

// POST /api/case-marketing/:leadId/employers  { sourceId, companyName, ... }
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
    const sourceId = parseInt(body.sourceId);

    const source = await db
      .collection("case_marketing_sources")
      .findOne({ id: sourceId, leadId });
    if (!source) {
      return NextResponse.json({ message: "Source not found" }, { status: 404 });
    }
    if (source.status !== "active") {
      return NextResponse.json(
        { message: "Start research on this source before adding employers" },
        { status: 400 },
      );
    }

    const companyName = String(body.companyName || "").trim();
    if (!companyName) {
      return NextResponse.json({ message: "Company name is required" }, { status: 400 });
    }

    // Auto duplicate detection — same employer cannot be added twice for
    // the same candidate, regardless of which phase/source it came from.
    const duplicate = await db.collection("case_marketing_employers").findOne({
      leadId,
      companyName: { $regex: `^${companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (duplicate) {
      return NextResponse.json(
        { message: `${companyName} has already been added for this candidate (under ${duplicate.sourceName}).` },
        { status: 400 },
      );
    }

    const phaseConfig = getPhaseConfig(source.phase);
    const id = await getNextId(db, "case_marketing_employers");
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: Record<string, any> = {
      id,
      leadId,
      phase: source.phase,
      sourceId,
      sourceName: source.name,
      companyName,
      emailSent: false,
      status: null,
      statusNotes: null,
      createdAt: now,
      createdBy: payload.id,
      createdByName: payload.name,
      timeline: [
        {
          event: "employer_added",
          date: now,
          details: `${companyName} added under ${source.name}`,
        },
      ],
    };

    for (const field of EMPLOYER_FIELDS) {
      if (field === "companyName") continue;
      const value = body[field];
      doc[field] = typeof value === "string" ? value.trim() : "";
    }

    await db.collection("case_marketing_employers").insertOne(doc);

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: { updatedAt: now },
        $push: {
          history: {
            action: "marketing_employer_added",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: `Phase ${source.phase} · ${phaseConfig?.label} — ${source.name}: employer "${companyName}" added`,
          },
        },
      },
    );

    return NextResponse.json({ message: "Employer saved", employer: doc });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
