import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
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

    if (payload.role === "case_manager" || payload.role === "wcm") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const leadId = parseInt(id);

    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const body = await req.json();
    const { isAgent } = body;

    if (typeof isAgent !== "boolean") {
      return NextResponse.json(
        { message: "isAgent must be a boolean" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("triloknath_leads").findOne({ id: leadId });
    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Only admins or the lead's current owner can flag/unflag an agent
    if (
      (payload.role === "telecaller" ||
        payload.role === "employee" ||
        payload.role === "meeting" ||
        payload.role === "wtc" ||
        payload.role === "wm" ||
        payload.role === "supervisor") &&
      lead.assignedTo !== payload.id
    ) {
      return NextResponse.json(
        { message: "You can only update leads assigned to you" },
        { status: 403 },
      );
    }

    if (lead.isAgent === isAgent) {
      return NextResponse.json(
        {
          message: isAgent
            ? "Lead is already marked as an agent"
            : "Lead is already unmarked",
        },
        { status: 200 },
      );
    }

    const now = new Date();

    await db.collection("triloknath_leads").updateOne(
      { id: leadId },
      {
        $set: {
          isAgent,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "agent_flag_updated",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: isAgent
              ? "Lead marked as an Agent"
              : "Lead unmarked as an Agent",
          },
        },
      },
    );

    return NextResponse.json({
      message: isAgent
        ? "Lead marked as an Agent"
        : "Lead unmarked as an Agent",
      isAgent,
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
