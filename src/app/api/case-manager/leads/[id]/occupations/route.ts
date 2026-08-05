import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload } from "@/lib/caseMarketingAuth";

// PUT /api/case-manager/leads/:id/occupations
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can update occupations after lead is sent to Case Manager
    if (payload.role !== "admin") {
      return NextResponse.json(
        { message: "Only admin can update candidate occupations" },
        { status: 403 },
      );
    }

    const { id: paramId } = await context.params;
    const leadId = parseInt(paramId);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const body = await req.json();
    const { occupations } = body;

    if (!Array.isArray(occupations)) {
      return NextResponse.json(
        { message: "Occupations must be an array of strings" },
        { status: 400 },
      );
    }

    const cleanOccupations = occupations
      .map((o: unknown) => String(o).trim())
      .filter((o: string) => o.length > 0);

    if (cleanOccupations.length === 0) {
      return NextResponse.json(
        { message: "At least one occupation is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const result = await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          occupations: cleanOccupations,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Occupations updated successfully",
      occupations: cleanOccupations,
    });
  } catch (err) {
    console.error("UPDATE OCCUPATIONS ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
