import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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
        { message: "Lead ID is required" },
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

    // Admin can complete any meeting
    // Staff/Meeting can complete their assigned lead or scheduled meeting
    const canComplete =
      payload.role === "admin" ||
      lead.assignedTo === payload.id ||
      lead.meetingDetails?.meetingUserId === payload.id;

    if (!canComplete) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const now = new Date();

    // Find all Follow-Up users
    const followUpUsers = await db
      .collection("users")
      .find({ role: "follow_up" })
      .project({ id: 1, name: 1 })
      .toArray();

    let assignedFollowUpUser: { id: number; name: string } | null = null;
    if (followUpUsers.length > 0) {
      const userIds = followUpUsers.map((u) => u.id);
      const matchFollowUpIds = Array.from(new Set([...userIds, ...userIds.map(String)]));
      const loadCounts = await db
        .collection("leads")
        .aggregate([
          {
            $match: {
              assignedTo: { $in: matchFollowUpIds },
              status: { $nin: ["wrong-number", "not-interested", "sales"] },
            },
          },
          { $group: { _id: { $toInt: "$assignedTo" }, count: { $sum: 1 } } },
        ])
        .toArray();

      const loadMap = new Map<number, number>(
        loadCounts.map((c) => [Number(c._id), c.count as number]),
      );

      assignedFollowUpUser = followUpUsers[0] as { id: number; name: string };
      let minLoad = loadMap.get(assignedFollowUpUser.id) || 0;
      for (const fu of followUpUsers) {
        const load = loadMap.get(fu.id) || 0;
        if (load < minLoad) {
          assignedFollowUpUser = fu as { id: number; name: string };
          minLoad = load;
        }
      }
    }

    const updateSet: Record<string, any> = {
      meetingStatus: "completed",
      meetingDetails: lead.meetingDetails
        ? {
            ...lead.meetingDetails,
            status: "completed",
          }
        : null,
      meetingCompletedAt: now,
      status: "follow-up",
      updatedAt: now,
    };

    if (assignedFollowUpUser) {
      updateSet.assignedTo = assignedFollowUpUser.id;
      updateSet.assignedToName = assignedFollowUpUser.name;
      updateSet.assignedToRole = "follow_up";
      updateSet.assignedBy = payload.id;
      updateSet.assignedByName = payload.name;
      updateSet.assignedByRole = payload.role;
      updateSet.assignedAt = now;
    }

    await db.collection(collectionName).updateOne(
      { id: leadId },
      {
        $set: updateSet,
        $push: {
          history: {
            action: "meeting_completed",
            performedBy: payload.id,
            performedByName: payload.name,
            performedByRole: payload.role,
            timestamp: now,
            details: assignedFollowUpUser
              ? `Meeting completed. Lead transferred to Follow-Up user ${assignedFollowUpUser.name}`
              : "Meeting completed",
            previousAssignee: lead.assignedTo || null,
            previousAssigneeName: lead.assignedToName || null,
            newAssignee: assignedFollowUpUser ? assignedFollowUpUser.id : null,
            newAssigneeName: assignedFollowUpUser ? assignedFollowUpUser.name : null,
          },
        } as any,
        ...(assignedFollowUpUser
          ? { $addToSet: { visibleTo: assignedFollowUpUser.id } }
          : {}),
      },
    );

    await db.collection("meetingSlots").updateMany(
      {
        $or: [{ leadId: lead.id }, { leadId: String(lead.id) }],
        status: "scheduled",
      },
      {
        $set: {
          status: "completed",
          updatedAt: now,
        },
      },
    );

    if (assignedFollowUpUser) {
      try {
        const { createNotification } = await import("@/lib/notifications");
        const leadLink =
          collectionName === "triloknath_leads"
            ? `/dashboard/triloknath-leads/${lead.id}`
            : `/dashboard/leads/${lead.id}`;
        await createNotification({
          userId: assignedFollowUpUser.id,
          title: "Meeting Completed - Follow Up",
          message: `Meeting completed for lead ${lead.name || `#${lead.id}`}. Lead assigned to you for follow-up.`,
          type: "lead_assigned",
          link: leadLink,
        });
      } catch (notifErr) {
        console.error("Failed to create notification:", notifErr);
      }
    }

    return NextResponse.json({
      message: assignedFollowUpUser
        ? `Meeting completed and lead assigned to ${assignedFollowUpUser.name}`
        : "Meeting completed successfully",
      assignedTo: assignedFollowUpUser,
    });
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server Error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
