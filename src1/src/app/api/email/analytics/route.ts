import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/email";

async function getAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

// GET /api/email/analytics
export async function GET() {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = await connectToDatabase();

  // Stage funnel counts
  const stageCounts = await db
    .collection("lead_workflows")
    .aggregate([
      { $match: { currentStage: { $ne: null } } },
      { $group: { _id: "$currentStage", count: { $sum: 1 } } },
    ])
    .toArray();

  const funnelData = STAGE_ORDER.map((stage) => {
    const found = stageCounts.find((s) => s._id === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: found?.count || 0,
    };
  });

  // Total emails sent per stage
  const emailsByStage = await db
    .collection("email_history")
    .aggregate([
      { $match: { cancelled: { $ne: true } } },
      { $group: { _id: "$stage", total: { $sum: 1 }, followups: { $sum: { $cond: ["$isFollowup", 1, 0] } } } },
    ])
    .toArray();

  // Total emails per mailbox
  const emailsByMailbox = await db
    .collection("email_history")
    .aggregate([
      { $match: { cancelled: { $ne: true } } },
      { $group: { _id: "$mailbox", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .toArray();

  // Recent email activity (last 50)
  const recentEmails = await db
    .collection("email_history")
    .find({})
    .sort({ sentAt: -1 })
    .limit(50)
    .toArray();

  // Invoice stats
  const invoiceStats = await db
    .collection("invoices")
    .aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  // Total leads with workflows
  const totalLeadsWithWorkflow = await db
    .collection("lead_workflows")
    .countDocuments({ currentStage: { $ne: null } });

  // Completed workflows
  const completedWorkflows = await db
    .collection("lead_workflows")
    .countDocuments({ isCompleted: true });

  // Follow-ups sent today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const followupsTodayCount = await db
    .collection("email_history")
    .countDocuments({ isFollowup: true, sentAt: { $gte: todayStart } });

  // Emails sent today
  const emailsTodayCount = await db
    .collection("email_history")
    .countDocuments({ sentAt: { $gte: todayStart } });



  return NextResponse.json({
    funnelData,
    emailsByStage,
    emailsByMailbox,
    recentEmails,
    invoiceStats,
    totalLeadsWithWorkflow,
    completedWorkflows,
    followupsTodayCount,
    emailsTodayCount,
  });
}
