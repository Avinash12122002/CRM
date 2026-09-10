import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// PATCH /api/leads/[id]/intro-mail
// Marks that the trainee has sent the intro mail for this sales lead.
// Only accessible by the trainee assigned to this lead (or admin).
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    if (payload.role !== "trainee" && payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: leadId });
    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (lead.status !== "sales") {
      return NextResponse.json(
        { message: "Intro mail can only be marked for Sales leads" },
        { status: 400 }
      );
    }

    // Trainee can only mark their own assigned leads
    if (
      payload.role === "trainee" &&
      String(lead.assignedTo) !== String(payload.id)
    ) {
      return NextResponse.json(
        { message: "You can only mark intro mail for leads assigned to you" },
        { status: 403 }
      );
    }

    if (lead.introMailSent) {
      return NextResponse.json(
        { message: "Intro mail already marked as sent" },
        { status: 400 }
      );
    }

    const now = new Date();

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          introMailSent: true,
          introMailSentAt: now,
          introMailSentBy: payload.id,
          introMailSentByName: payload.name,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "intro_mail_sent",
            performedBy: payload.id,
            performedByName: payload.name,
            performedByRole: payload.role,
            timestamp: now,
            details: "Intro mail marked as sent by trainee",
          },
        } as never,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Intro mail marked as sent",
      introMailSentAt: now,
    });
  } catch (err) {
    console.error("[PATCH /api/leads/[id]/intro-mail]", err);
    return NextResponse.json(
      { message: "Server error", error: String(err) },
      { status: 500 }
    );
  }
}
