import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload, getAuthorizedCandidateLead } from "@/lib/caseMarketingAuth";

// PATCH /api/case-marketing/:leadId/credentials
export async function PATCH(
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
    const caseManagerEmail = String(
      body.caseManagerEmail ?? body.candidateEmail ?? body.marketingEmail ?? body.email ?? "",
    ).trim();
    const caseManagerPassword = String(
      body.caseManagerPassword ?? body.candidatePassword ?? body.marketingPassword ?? body.password ?? "",
    ).trim();

    const now = new Date();

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          caseManagerEmail,
          caseManagerPassword,
          candidateEmail: caseManagerEmail,
          candidatePassword: caseManagerPassword,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "case_manager_credentials_updated",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: `Case Manager mailing credentials updated by ${payload.name}`,
          },
        },
      },
    );

    return NextResponse.json({
      message: "Case Manager mailing credentials saved successfully",
      caseManagerEmail,
      caseManagerPassword,
    });
  } catch (err) {
    console.error("UPDATE CREDENTIALS ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
