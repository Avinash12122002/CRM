import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload } from "@/lib/caseMarketingAuth";

// GET /api/case-manager/leads/:id
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "case_manager" && payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id: paramId } = await context.params;
    const leadId = parseInt(paramId);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const leads = await db
      .collection("leads")
      .aggregate([
        { $match: { id: leadId } },
        {
          $lookup: {
            from: "users",
            localField: "assignedTo",
            foreignField: "id",
            as: "assignedUser",
          },
        },
        {
          $unwind: {
            path: "$assignedUser",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "id",
            as: "creator",
          },
        },
        {
          $unwind: {
            path: "$creator",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            id: 1,
            name: 1,
            email: 1,
            phone: 1,
            company: 1,
            state: 1,
            city: 1,
            country: 1,
            age: 1,
            passportType: 1,
            leadSource: 1,
            jobApplied: 1,
            status: 1,
            assignedTo: 1,
            assignedToName: "$assignedUser.name",
            assignedToEmail: "$assignedUser.email",
            assignedToRole: "$assignedUser.role",
            assignedBy: 1,
            assignedByName: 1,
            createdBy: 1,
            createdByName: "$creator.name",
            createdAt: 1,
            updatedAt: 1,
            history: 1,
            occupations: 1,
            caseManagerAssignedAt: 1,
            caseManagerEmail: 1,
            caseManagerPassword: 1,
            candidateEmail: 1,
            candidatePassword: 1,
            salesDocument: 1,
          },
        },
      ])
      .toArray();

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    const lead = leads[0];

    if ((payload.role === "case_manager" || payload.role === "wcm") && String(lead.assignedTo) !== String(payload.id)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ lead });
  } catch (err) {
    console.error("CASE MANAGER GET LEAD ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
