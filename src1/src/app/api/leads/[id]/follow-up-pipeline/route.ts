import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { createNotification } from "@/lib/notifications";
import { logUserAction } from "@/lib/activity/audit";
import {
  FollowUpStage,
  FOLLOW_UP_STAGE_CONFIGS,
  getFollowUpEmailDraft,
  calculateNextWorkflowState,
  FollowUpWorkflowState,
} from "@/lib/followUpWorkflow";

export async function GET(
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

    let lead = await db.collection("leads").findOne(idQuery);
    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne(idQuery);
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Follow-up users can only access leads assigned or visible to them
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

    // Draft templates per stage
    const drafts: Record<FollowUpStage, { subject: string; body: string }> = {
      info: getFollowUpEmailDraft("info", lead.name),
      agreement: getFollowUpEmailDraft("agreement", lead.name),
      invoice: getFollowUpEmailDraft("invoice", lead.name),
      payment_confirmation: getFollowUpEmailDraft("payment_confirmation", lead.name),
      case_manager: getFollowUpEmailDraft("case_manager", lead.name),
    };

    return NextResponse.json({
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        assignedTo: lead.assignedTo,
        assignedToName: lead.assignedToName,
        meetingCompletedAt: lead.meetingCompletedAt,
        followUpWorkflow: lead.followUpWorkflow || null,
      },
      drafts,
      stageConfigs: FOLLOW_UP_STAGE_CONFIGS,
    });
  } catch (err) {
    console.error("[GET /api/leads/[id]/follow-up-pipeline]", err);
    return NextResponse.json(
      { message: "Internal server error", error: String(err) },
      { status: 500 }
    );
  }
}

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

    const body = await req.json();
    const { stage, note } = body as {
      stage: FollowUpStage;
      note?: string;
    };

    if (!stage || !FOLLOW_UP_STAGE_CONFIGS[stage]) {
      return NextResponse.json({ message: "Invalid stage" }, { status: 400 });
    }

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

    const config = FOLLOW_UP_STAGE_CONFIGS[stage];
    const now = new Date();

    const currentWorkflow = (lead.followUpWorkflow || {
      currentStage: "info",
      status: "in_progress",
      stages: {},
      nextFollowupAt: now,
      updatedAt: now,
    }) as FollowUpWorkflowState;

    // Verify stage lock: cannot skip ahead
    if (currentWorkflow.currentStage !== stage && payload.role !== "admin") {
      return NextResponse.json(
        {
          message: `Cannot mark ${config.label}. Current active stage is ${
            currentWorkflow.currentStage !== "completed"
              ? FOLLOW_UP_STAGE_CONFIGS[currentWorkflow.currentStage]?.label
              : "Completed"
          }.`,
        },
        { status: 400 }
      );
    }

    // Advance workflow state
    const nextWorkflow = calculateNextWorkflowState(
      currentWorkflow,
      stage,
      { id: payload.id, name: payload.name },
      note
    );

    const updateDoc: Record<string, unknown> = {
      followUpWorkflow: nextWorkflow,
      updatedAt: now,
    };

    const historyEntries: Record<string, unknown>[] = [
      {
        action: "email_marked_sent",
        performedBy: payload.id,
        performedByName: payload.name,
        performedByRole: payload.role,
        timestamp: now,
        details: `Marked ${config.label} as sent manually via Gmail`,
        stage,
        note: note || undefined,
      },
    ];

    let assignedTrainee: { id: number; name: string } | null = null;

    // Helper to find and assign least-loaded Trainee
    const assignToLeastLoadedTrainee = async () => {
      const trainees = await db
        .collection("users")
        .find({ role: "trainee" })
        .project({ id: 1, name: 1 })
        .toArray();

      if (trainees.length > 0) {
        const traineeIds = trainees.map((t) => t.id);
        const matchTraineeIds = Array.from(new Set([...traineeIds, ...traineeIds.map(String)]));
        const loadCounts = await db
          .collection(collectionName)
          .aggregate([
            { $match: { assignedTo: { $in: matchTraineeIds } } },
            { $group: { _id: { $toInt: "$assignedTo" }, count: { $sum: 1 } } },
          ])
          .toArray();

        const loadMap = new Map<number, number>(
          loadCounts.map((c) => [Number(c._id), c.count as number])
        );

        let chosenTrainee = trainees[0] as { id: number; name: string };
        let lowestLoad = loadMap.get(chosenTrainee.id) || 0;
        for (const t of trainees) {
          const load = loadMap.get(t.id) || 0;
          if (load < lowestLoad) {
            chosenTrainee = t as { id: number; name: string };
            lowestLoad = load;
          }
        }

        updateDoc.assignedTo = chosenTrainee.id;
        updateDoc.assignedToName = chosenTrainee.name;
        updateDoc.assignedToRole = "trainee";
        updateDoc.assignedBy = payload.id;
        updateDoc.assignedByName = payload.name;
        updateDoc.assignedByRole = payload.role;
        updateDoc.assignedAt = now;

        historyEntries.push({
          action: "assigned",
          performedBy: payload.id,
          performedByName: payload.name,
          performedByRole: payload.role,
          timestamp: now,
          details: `Lead automatically assigned to Trainee ${chosenTrainee.name}`,
          newAssignee: chosenTrainee.id,
          newAssigneeName: chosenTrainee.name,
          assignedToRole: "trainee",
        });

        return chosenTrainee;
      }
      return null;
    };

    // If payment confirmation was marked, record sale completion date,
    // update status to "sales" (Sale Done), and auto-assign lead to least-loaded Trainee
    if (stage === "payment_confirmation") {
      updateDoc.status = "sales";
      updateDoc.saleCompletedAt = now;

      // Status change history
      historyEntries.unshift({
        action: "status_updated",
        performedBy: payload.id,
        performedByName: payload.name,
        performedByRole: payload.role,
        timestamp: now,
        details: `Status changed from "${lead.status}" to "sales" (Sale Completed upon Payment Confirmation)`,
        oldStatus: lead.status,
        newStatus: "sales",
      });

      if (lead.assignedToRole !== "trainee") {
        assignedTrainee = await assignToLeastLoadedTrainee();
      }

      // Preserve visibility for follow-up user so they can send the Case Manager intro email
      const currentVisibleTo = Array.isArray(lead.visibleTo) ? lead.visibleTo : [];
      const newVisibleTo = Array.from(
        new Set([
          ...currentVisibleTo,
          payload.id,
          ...(assignedTrainee ? [assignedTrainee.id] : []),
        ])
      );
      updateDoc.visibleTo = newVisibleTo;

      const currentParticipants = Array.isArray(lead.participants) ? lead.participants : [];
      const newParticipants = Array.from(
        new Set([
          ...currentParticipants,
          payload.id,
          ...(assignedTrainee ? [assignedTrainee.id] : []),
        ])
      );
      updateDoc.participants = newParticipants;
    }

    if (stage === "case_manager") {
      updateDoc.status = "sales";
      if (lead.assignedToRole !== "trainee" && !updateDoc.assignedTo) {
        assignedTrainee = await assignToLeastLoadedTrainee();
      }

      const currentVisibleTo = Array.isArray(lead.visibleTo) ? lead.visibleTo : [];
      const newVisibleTo = Array.from(
        new Set([
          ...currentVisibleTo,
          payload.id,
          ...(assignedTrainee ? [assignedTrainee.id] : []),
        ])
      );
      updateDoc.visibleTo = newVisibleTo;

      const currentParticipants = Array.isArray(lead.participants) ? lead.participants : [];
      const newParticipants = Array.from(
        new Set([
          ...currentParticipants,
          payload.id,
          ...(assignedTrainee ? [assignedTrainee.id] : []),
        ])
      );
      updateDoc.participants = newParticipants;
    }

    await db.collection(collectionName).updateOne(
      { id: lead.id },
      {
        $set: updateDoc,
        $push: {
          history: {
            $each: historyEntries,
          },
        },
      }
    );

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: stage === "payment_confirmation" ? "convert_to_sales" : "lead_status_updated",
      entityType: collectionName === "triloknath_leads" ? "triloknath_lead" : "lead",
      entityId: lead.id,
      summary: stage === "payment_confirmation"
        ? `Confirmed payment (Sale Done) for lead #${lead.id} (${lead.name})`
        : `Marked ${config.label} email sent for lead #${lead.id} (${lead.name})`,
      metadata: { stage, leadName: lead.name },
    });

    // Notify assigned trainee if applicable
    if (stage === "payment_confirmation" && assignedTrainee) {
      try {
        await createNotification({
          userId: assignedTrainee.id,
          title: "New Sale Lead Assigned",
          message: `Lead ${lead.name || `#${lead.id}`} payment was confirmed (Sale Done) and has been assigned to you.`,
          type: "lead_assigned",
          link: `/dashboard/leads/${lead.id}`,
        });
      } catch (notifErr) {
        console.error("Failed to notify trainee:", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: assignedTrainee
        ? `${config.label} marked as sent! Lead marked as Sales and assigned to Trainee ${assignedTrainee.name}`
        : `${config.label} marked as sent!${stage === "payment_confirmation" ? " Lead marked as Sales." : ""}`,
      followUpWorkflow: nextWorkflow,
      newStatus: (stage === "payment_confirmation" || stage === "case_manager") ? "sales" : undefined,
      assignedTo: assignedTrainee?.id,
      assignedToName: assignedTrainee?.name,
      assignedToRole: assignedTrainee ? "trainee" : undefined,
    });
  } catch (err) {
    console.error("[POST /api/leads/[id]/follow-up-pipeline]", err);
    return NextResponse.json(
      { message: "Internal server error", error: String(err) },
      { status: 500 }
    );
  }
}
