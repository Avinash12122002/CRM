import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "admin" && payload.role !== "follow_up") {
      return NextResponse.json(
        { message: "Forbidden: Follow-Up pipeline is accessible only to Admin and Follow-Up users." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const numLeadId = parseInt(id);
    const idQuery = isNaN(numLeadId) ? { id } : { $or: [{ id: numLeadId }, { id: String(id) }] };

    const { db } = await connectToDatabase();

    let collectionName = "leads";
    let lead = await db.collection("leads").findOne(idQuery);
    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne(idQuery);
      if (lead) {
        collectionName = "triloknath_leads";
      }
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Follow-up users can only modify leads assigned or visible to them
    if (payload.role === "follow_up") {
      const isAssigned =
        lead.assignedTo === payload.id ||
        String(lead.assignedTo) === String(payload.id);
      const isVisible =
        Array.isArray(lead.visibleTo) &&
        (lead.visibleTo.includes(payload.id) ||
          lead.visibleTo.includes(String(payload.id)));
      if (!isAssigned && !isVisible && payload.role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    }

    const now = new Date();
    const currentStage = lead.followUpWorkflow?.currentStage || "follow-up";

    const updatedWorkflow = {
      ...(lead.followUpWorkflow || {}),
      status: "not_interested",
      nextFollowupAt: null,
      notInterestedAt: now,
      notInterestedBy: payload.id,
      notInterestedByName: payload.name,
      updatedAt: now,
    };

    await db.collection(collectionName).updateOne(
      { id: lead.id },
      {
        $set: {
          status: "not-interested",
          followUpWorkflow: updatedWorkflow,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "status_updated",
            oldStatus: lead.status,
            newStatus: "not-interested",
            performedBy: payload.id,
            performedByName: payload.name,
            performedByRole: payload.role,
            timestamp: now,
            details: `Candidate marked Not Interested during Follow-Up email stage (${currentStage}). Follow-up process stopped.`,
          },
        } as any,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Lead marked as Not Interested. Follow-up cycle stopped.",
      followUpWorkflow: updatedWorkflow,
    });
  } catch (err) {
    console.error("[POST /api/leads/[id]/follow-up-pipeline/not-interested]", err);
    return NextResponse.json(
      { message: "Internal server error", error: String(err) },
      { status: 500 }
    );
  }
}
