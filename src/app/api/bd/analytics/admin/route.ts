import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE, PIPELINE_STAGES } from "@/lib/bd/constants";

function startOfRange(range: string) {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "yesterday") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return d;
  }
  if (range === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // monthly
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today"; // today | yesterday | weekly | monthly

    const { db } = await connectToDatabase();

    // ---- 1. Daily Lead Submission per employee ----
    let dateFilter: Record<string, string> = {};
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (range === "today") {
      dateFilter = { date: todayStr };
    } else if (range === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      dateFilter = { date: y.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) };
    }
    // weekly/monthly handled via $gte below

    const startDate = startOfRange(range);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submissionAgg: any[] = [];
    if (range === "today" || range === "yesterday") {
      submissionAgg.push({ $match: dateFilter });
    } else {
      submissionAgg.push({
        $match: { date: { $gte: startDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) } },
      });
    }
    submissionAgg.push({
      $group: { _id: "$userId", userName: { $first: "$userName" }, totalCreated: { $sum: "$totalCreated" } },
    });
    submissionAgg.push({ $sort: { totalCreated: -1 } });

    const dailySubmission = await db
      .collection(BD_COLLECTIONS.dailyTargets)
      .aggregate(submissionAgg)
      .toArray();

    // ---- 2. BD Performance funnel ----
    const bdUsers = await db
      .collection("users")
      .find({ role: BD_ROLE })
      .project({ id: 1, name: 1 })
      .toArray();

    const allLeads = await db.collection(BD_COLLECTIONS.leads).find({}).toArray();
    const allHistory = await db.collection(BD_COLLECTIONS.pipelineHistory).find({}).toArray();

    const bdPerformance = bdUsers.map((bd) => {
      const bdLeads = allLeads.filter((l) => l.assignedTo === bd.id);
      const bdLeadIds = new Set(bdLeads.map((l) => l.id));

      const stageReached = (stage: string) =>
        allHistory.filter((h) => bdLeadIds.has(h.leadId) && h.toStage === stage).length;

      return {
        bdUserId: bd.id,
        bdUserName: bd.name,
        leadsAssigned: bdLeads.length,
        researchStarted: stageReached("Research Started"),
        initialContact: stageReached("Initial Contact"),
        responseReceived: stageReached("Response Received"),
        meetingsScheduled: stageReached("Meeting Scheduled"),
        followUps: stageReached("Follow Up"),
        dealDone: bdLeads.filter((l) => l.status === "deal_done").length,
        leadLost: bdLeads.filter((l) => l.status === "lost").length,
      };
    });

    // ---- 3. Stage duration (avg time spent in each stage, across all leads) ----
    const stageDurations: Record<string, number[]> = {};
    PIPELINE_STAGES.forEach((s) => (stageDurations[s] = []));

    const historyByLead: Record<number, typeof allHistory> = {};
    for (const h of allHistory) {
      if (!historyByLead[h.leadId]) historyByLead[h.leadId] = [];
      historyByLead[h.leadId].push(h);
    }

    for (const leadId of Object.keys(historyByLead)) {
      const entries = historyByLead[Number(leadId)].sort(
        (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
      );
      for (let i = 0; i < entries.length; i++) {
        const stage = entries[i].toStage;
        if (!PIPELINE_STAGES.includes(stage)) continue;
        const enteredAt = new Date(entries[i].changedAt).getTime();
        const leftAt = entries[i + 1]
          ? new Date(entries[i + 1].changedAt).getTime()
          : Date.now();
        stageDurations[stage].push(leftAt - enteredAt);
      }
    }

    const stageDurationSummary = PIPELINE_STAGES.map((stage) => {
      const durations = stageDurations[stage];
      const avgMs = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
      return {
        stage,
        avgHours: Math.round((avgMs / (1000 * 60 * 60)) * 10) / 10,
        sampleSize: durations.length,
      };
    });

    // ---- 4/5/6. Efficiency, Success Rate, Drop Rate ----
    const totalLeads = allLeads.length;
    const meetingsScheduledLeadIds = new Set(
      allHistory.filter((h) => h.toStage === "Meeting Scheduled").map((h) => h.leadId)
    );
    const totalMeetingsScheduled = meetingsScheduledLeadIds.size;
    const totalDealsDone = allLeads.filter((l) => l.status === "deal_done").length;

    const efficiency = totalLeads ? Math.round((totalMeetingsScheduled / totalLeads) * 1000) / 10 : 0;
    const successRate = totalLeads ? Math.round((totalDealsDone / totalLeads) * 1000) / 10 : 0;
    const dropRate = totalMeetingsScheduled
      ? Math.round(((totalMeetingsScheduled - totalDealsDone) / totalMeetingsScheduled) * 1000) / 10
      : 0;

    // ---- 7. Leaderboard ----
    const leaderboard = bdPerformance
      .map((bd) => ({
        bdUserId: bd.bdUserId,
        bdUserName: bd.bdUserName,
        deals: bd.dealDone,
        meetings: bd.meetingsScheduled,
        successPercent: bd.leadsAssigned
          ? Math.round((bd.dealDone / bd.leadsAssigned) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.deals - a.deals)
      .map((row, idx) => ({ rank: idx + 1, ...row }));

    return NextResponse.json({
      range,
      dailySubmission,
      bdPerformance,
      stageDurationSummary,
      metrics: {
        totalLeads,
        totalMeetingsScheduled,
        totalDealsDone,
        efficiency,
        successRate,
        dropRate,
      },
      leaderboard,
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
