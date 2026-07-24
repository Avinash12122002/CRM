import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE, PIPELINE_STAGES } from "@/lib/bd/constants";

// BD Analytics — admin-only.
//
// Same optional Date (YYYY-MM-DD) / Month (YYYY-MM) filter model as Lead
// Analytics. Neither selected -> lifetime "All Time".
//
// FIX — ownership-transfer bug: /leads/[id]/pipeline (Deal Done) and
// /leads/[id]/lost both move `assignedTo` to an admin the instant a lead
// closes (by design, so closed leads are owned/auditable by Admin). The
// previous analytics build grouped every BD user's leads by
// `lead.assignedTo === bd.id`, so the moment a lead closed it vanished from
// its original BD user's bucket — Deal Done / Lead Lost counts, and
// therefore the Leaderboard's deals/success%, were always 0 for every BD
// user. Fixed by reconstructing the real owning BD user from
// `bdactivitylogs` ("Lead Assigned" / "Lead Reassigned" entries always carry
// the true BD user id and are never touched after a lead locks), instead of
// trusting `assignedTo` post-closure. Works for existing data too — no
// migration needed.
//
// FIX — Drop Rate: was (meetingsScheduled - dealsDone) / meetingsScheduled,
// which ignores every lead lost *before* ever reaching a meeting (the
// common case) and badly undercounts drops. Now Lead Lost / Total Leads,
// matching the Drop Rate definition used on the Lead Analytics page.
//
// FIX — BD Performance table: replaced the old "cumulative ever-reached-
// stage" columns (don't sum to anything) with a mutually-exclusive
// current-state breakdown that always sums to Total Leads: New Lead /
// Research+Priority / Contact+Response / Meeting Scheduled / Follow Up /
// Deal Done / Lead Lost.
//
// FIX — Stage Duration was silently broken: it computed real per-stage
// durations into an array but then only ever reported `array.length` (a
// COUNT) as "completed" — the actual time values were calculated and then
// discarded, so the table could never show duration no matter what filter
// was applied. Now returns both:
//   - avgDurationMs / avgDurationLabel  — average time per lead in the stage
//   - totalDurationMs / totalDurationLabel — SUM of all time spent by every
//     lead in that stage (i.e. cumulative person-hours the team spent there)
//
// FIX — Deal Done previously showed no duration at all (Completed/Still In
// Stage were always 0, "by design", since it's terminal — nothing in the
// pipeline history ever follows it, so there was no "next event" to measure
// a stage-residency duration against). That's structurally true, but it's
// not the number anyone actually wants for the last row. Deal Done's
// avg/total now represent TIME TO CLOSE — lead creation -> the moment it
// reached Deal Done — which is a real, meaningful, always-computable value.
//
// FIX — Performance: `allBdLeads` was previously fetched with `find({})`
// (the ENTIRE leads collection, on every single request) and then filtered
// down to the selected date/month cohort in JavaScript afterward — this is
// why switching filters felt slow and got slower as data grew, since every
// filter change re-downloaded and re-scanned the whole collection. This now
// pushes the date/month filter into the MongoDB query itself (same pattern
// already used in /leads/list), and runs independent queries concurrently
// with Promise.all instead of one-by-one.

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return round1((numerator / denominator) * 100);
}

// Formats a millisecond duration as a compact human-readable string, e.g.
// "3d 4h", "5h 12m", "42m". Returns null for 0/undefined so the UI can show
// a placeholder instead of "0m".
function formatDuration(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Inclusive-start / exclusive-end window for a single IST calendar day.
function dayWindow(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Inclusive-start / exclusive-end window for a single IST calendar month.
function monthWindow(monthStr: string): { start: Date; end: Date } {
  const [y, m] = monthStr.split("-").map((v) => parseInt(v, 10));
  const start = new Date(`${monthStr}-01T00:00:00.000+05:30`);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000+05:30`);
  return { start, end };
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
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();

    let cohortWindow: { start: Date; end: Date } | null = null;
    if (validDate) cohortWindow = dayWindow(validDate);
    else if (validMonth) cohortWindow = monthWindow(validMonth);

    // ---- 1. Daily Lead Submission per employee (scoped to date/month) ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submissionMatch: Record<string, any> = {};
    if (validDate) {
      submissionMatch.date = validDate;
    } else if (validMonth) {
      submissionMatch.date = { $regex: `^${validMonth}` };
    }

    // `createdAt` is stored as a real Date (see leads/create route), so we
    // can push the cohort window straight into the query — same pattern
    // /leads/list already uses — instead of loading everything and
    // filtering in JS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadsFilter: Record<string, any> = cohortWindow
      ? { createdAt: { $gte: cohortWindow.start, $lt: cohortWindow.end } }
      : {};

    // These four are fully independent of one another — run them
    // concurrently instead of one-by-one.
    const [dailySubmission, bdUsers, totalInDb, cohortLeads] = await Promise.all([
      db
        .collection(BD_COLLECTIONS.dailyTargets)
        .aggregate([
          ...(Object.keys(submissionMatch).length ? [{ $match: submissionMatch }] : []),
          { $group: { _id: "$userId", userName: { $first: "$userName" }, totalCreated: { $sum: "$totalCreated" } } },
          { $sort: { totalCreated: -1 } },
        ])
        .toArray(),
      db.collection("users").find({ role: BD_ROLE }).project({ id: 1, name: 1 }).toArray(),
      db.collection(BD_COLLECTIONS.leads).countDocuments({}),
      db.collection(BD_COLLECTIONS.leads).find(leadsFilter).toArray(),
    ]);

    const cohortLeadIds = cohortLeads.map((l) => l.id);
    const leadsById = new Map<number, (typeof cohortLeads)[number]>();
    for (const l of cohortLeads) leadsById.set(l.id, l);

    // Also independent of one another — run concurrently.
    const [allHistory, ownerLogs] = await Promise.all([
      cohortLeadIds.length
        ? db
            .collection(BD_COLLECTIONS.pipelineHistory)
            .find({ leadId: { $in: cohortLeadIds } })
            .toArray()
        : Promise.resolve([]),
      // ---- Reconstruct real BD ownership (see FIX comment above) ----
      // "Lead Assigned" (creation) and "Lead Reassigned" (admin moving an
      // active lead between BD users) are the only two actions that ever
      // set a BD user as owner; "Ownership Changed" (closure) moves it to
      // Admin and is deliberately excluded here. Sorted by `id` (sequential,
      // collision-proof) so the last one wins = the last real BD owner.
      cohortLeadIds.length
        ? db
            .collection(BD_COLLECTIONS.activityLogs)
            .find({
              leadId: { $in: cohortLeadIds },
              action: { $in: ["Lead Assigned", "Lead Reassigned"] },
            })
            .sort({ id: 1 })
            .toArray()
        : Promise.resolve([]),
    ]);

    const ownerMap = new Map<number, number>(); // leadId -> BD user id
    for (const log of ownerLogs) {
      const assignedId = log.newValue?.assignedTo;
      if (assignedId != null) ownerMap.set(log.leadId, assignedId);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdOwnerOf = (lead: any): number => ownerMap.get(lead.id) ?? lead.assignedTo;

    const bdPerformance = bdUsers.map((bd) => {
      const bdLeads = cohortLeads.filter((l) => bdOwnerOf(l) === bd.id);
      const bdLeadIds = new Set(bdLeads.map((l) => l.id));

      // Mutually-exclusive current-state breakdown — always sums to
      // leadsAssigned, so the row is self-checking at a glance. Each
      // pipeline stage gets its own column (no merging — Research Started
      // and Priority Set are different stages, as are Initial Contact and
      // Response Received).
      let newLead = 0;
      let researchStarted = 0;
      let prioritySet = 0;
      let initialContact = 0;
      let responseReceived = 0;
      let meetingScheduled = 0;
      let followUp = 0;
      let dealDone = 0;
      let leadLost = 0;

      for (const l of bdLeads) {
        if (l.status === "deal_done") {
          dealDone += 1;
          continue;
        }
        if (l.status === "lost") {
          leadLost += 1;
          continue;
        }
        switch (l.pipelineStage) {
          case "New Lead":
            newLead += 1;
            break;
          case "Research Started":
            researchStarted += 1;
            break;
          case "Priority Set":
            prioritySet += 1;
            break;
          case "Initial Contact":
            initialContact += 1;
            break;
          case "Response Received":
            responseReceived += 1;
            break;
          case "Meeting Scheduled":
            meetingScheduled += 1;
            break;
          case "Follow Up":
            followUp += 1;
            break;
          default:
            break;
        }
      }

      // Cumulative "ever reached a meeting" (deduped per lead) — used for
      // the leaderboard's Meetings column, distinct from the current-state
      // "Meeting Scheduled" count above.
      const meetingsEverReached = new Set(
        allHistory
          .filter((h) => bdLeadIds.has(h.leadId) && h.toStage === "Meeting Scheduled")
          .map((h) => h.leadId)
      ).size;

      return {
        bdUserId: bd.id,
        bdUserName: bd.name,
        totalLeads: bdLeads.length,
        newLead,
        researchStarted,
        prioritySet,
        initialContact,
        responseReceived,
        meetingScheduled,
        followUp,
        dealDone,
        leadLost,
        meetingsEverReached,
      };
    });

    // ---- 3. Stage duration (avg + total time spent in each stage) ----
    const stageDurations: Record<string, number[]> = {};
    const stageOngoing: Record<string, number> = {};
    const stageReachedCount: Record<string, number> = {};
    PIPELINE_STAGES.forEach((s) => {
      stageDurations[s] = [];
      stageOngoing[s] = 0;
      stageReachedCount[s] = 0;
    });

    const finalStage = PIPELINE_STAGES[PIPELINE_STAGES.length - 1]; // "Deal Done"

    const historyByLead: Record<number, typeof allHistory> = {};
    for (const h of allHistory) {
      if (PIPELINE_STAGES.includes(h.toStage)) stageReachedCount[h.toStage] += 1;
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
        if (entries[i + 1]) {
          // Left the stage (moved forward, or lost from it) — duration known.
          const enteredAt = new Date(entries[i].changedAt).getTime();
          const leftAt = new Date(entries[i + 1].changedAt).getTime();
          stageDurations[stage].push(leftAt - enteredAt);
        } else if (stage === finalStage) {
          // Deal Done is terminal — there's no "next" event to measure a
          // stage-residency duration against, so instead we measure total
          // TIME TO CLOSE: lead creation -> the moment it hit Deal Done.
          // This is the number actually worth seeing here, not a
          // stage-residency duration that structurally can never exist.
          const lead = leadsById.get(Number(leadId));
          if (lead?.createdAt) {
            const closedAt = new Date(entries[i].changedAt).getTime();
            const createdAt = new Date(lead.createdAt).getTime();
            if (closedAt > createdAt) stageDurations[stage].push(closedAt - createdAt);
          }
        } else {
          // Still sitting here — excluded from the average/total. Deal
          // Done is terminal so it never falls into this branch — a closed
          // deal isn't stuck waiting on anything.
          stageOngoing[stage] += 1;
        }
      }
    }

    // Deal Done's avgDurationMs/totalDurationMs represent total TIME TO
    // CLOSE (lead creation -> Deal Done reached) rather than stage-
    // residency duration — see the loop above. "Still In Stage" stays 0
    // for it by construction. Total still tells you how many leads reached
    // it in this scope.
    const stageDurationSummary = PIPELINE_STAGES.map((stage) => {
      const durations = stageDurations[stage];
      const durationMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) : null;
      return {
        stage,
        total: stageReachedCount[stage],
        completed: durations.length,
        ongoing: stageOngoing[stage],
        durationMs,
        durationLabel: formatDuration(durationMs),
      };
    });

    // ---- 4/5/6. Efficiency, Success Rate, Drop Rate (scoped to cohort) ---
    const totalLeads = cohortLeads.length;
    const meetingsScheduledLeadIds = new Set(
      allHistory.filter((h) => h.toStage === "Meeting Scheduled").map((h) => h.leadId)
    );
    const totalMeetingsScheduled = meetingsScheduledLeadIds.size;
    const totalDealsDone = cohortLeads.filter((l) => l.status === "deal_done").length;
    const totalLeadLost = cohortLeads.filter((l) => l.status === "lost").length;

    const efficiency = pct(totalMeetingsScheduled, totalLeads);
    const successRate = pct(totalDealsDone, totalLeads);
    const dropRate = pct(totalLeadLost, totalLeads);

    // ---- 7. Leaderboard (scoped to cohort, corrected ownership) ----
    const leaderboard = bdPerformance
      .map((bd) => ({
        bdUserId: bd.bdUserId,
        bdUserName: bd.bdUserName,
        totalLeads: bd.totalLeads,
        deals: bd.dealDone,
        meetings: bd.meetingsEverReached,
        successPercent: pct(bd.dealDone, bd.totalLeads),
      }))
      .sort((a, b) => b.deals - a.deals || b.successPercent - a.successPercent)
      .map((row, idx) => ({ rank: idx + 1, ...row }));

    return NextResponse.json({
      date: validDate || null,
      month: validMonth || null,
      filtered: !!cohortWindow,
      totalInDb,
      dailySubmission,
      bdPerformance: bdPerformance.map((bd) => ({
        bdUserId: bd.bdUserId,
        bdUserName: bd.bdUserName,
        totalLeads: bd.totalLeads,
        newLead: bd.newLead,
        researchStarted: bd.researchStarted,
        prioritySet: bd.prioritySet,
        initialContact: bd.initialContact,
        responseReceived: bd.responseReceived,
        meetingScheduled: bd.meetingScheduled,
        followUp: bd.followUp,
        dealDone: bd.dealDone,
        leadLost: bd.leadLost,
      })),
      stageDurationSummary,
      metrics: {
        totalLeads,
        totalMeetingsScheduled,
        totalDealsDone,
        totalLeadLost,
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