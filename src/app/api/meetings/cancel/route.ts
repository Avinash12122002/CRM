import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { logUserAction } from "@/lib/activity/audit";

export async function POST(req: NextRequest) {
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

    const { leadId } = await req.json();

    if (!leadId) {
      return NextResponse.json(
        { message: "Lead ID required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    let collectionName = "leads";
    let lead = await db.collection("leads").findOne({
      id: leadId,
    });

    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne({
        id: leadId,
      });
      if (lead) {
        collectionName = "triloknath_leads";
      }
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    await db.collection("meetingSlots").updateMany(
      { $or: [{ leadId: lead.id }, { leadId: String(lead.id) }] },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      },
    );

    // Only meeting/WM users trigger the auto-status change to Meeting NJ
    const isMeetingRole = payload.role === "meeting" || payload.role === "wm";

    const cancelSet: Record<string, unknown> = {
      meetingDetails: lead.meetingDetails
        ? {
            ...lead.meetingDetails,
            status: "cancelled",
          }
        : null,
      meetingStatus: "cancelled",
      meetingCancelledAt: new Date(),
      updatedAt: new Date(),
    };

    if (isMeetingRole) {
      cancelSet.status = "meeting-nj";
    }

    await db.collection(collectionName).updateOne(
      { id: leadId },
      {
        $set: cancelSet,
        $push: {
          history: {
            action: "meeting_cancelled",
            performedBy: payload.id,
            performedByName: payload.name,
            performedByRole: payload.role,
            timestamp: new Date(),
            details: isMeetingRole
              ? "Meeting cancelled by meeting user — status set to Meeting NJ"
              : "Meeting cancelled",
            ...(isMeetingRole ? { oldStatus: lead.status, newStatus: "meeting-nj" } : {}),
          },
        },
      },
    );

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: "meeting_cancelled",
      entityType: collectionName === "triloknath_leads" ? "triloknath_lead" : "meeting",
      entityId: lead.id,
      summary: `Cancelled meeting for lead #${lead.id} (${lead.name})`,
      metadata: { leadName: lead.name },
    });

    return NextResponse.json({
      message: "Meeting cancelled successfully",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Server error",
      },
      { status: 500 },
    );
  }
}
