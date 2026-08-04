import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { PHASES, STATUS_OPTIONS, getFollowupInfo } from "@/lib/caseMarketing";

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
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (payload.role !== "admin")
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || "";
    const date = searchParams.get("date") || "";
    const assignedTo = searchParams.get("assignedTo") || "";

    const { db } = await connectToDatabase();

    // Build lead filter — always scoped to case_manager assigned leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadFilter: Record<string, any> = { assignedToRole: "case_manager" };

    if (assignedTo) {
      const id = parseInt(assignedTo);
      if (!isNaN(id)) leadFilter.assignedTo = id;
    }

    const allLeads = await db
      .collection("leads")
      .find(leadFilter)
      .project({
        id: 1,
        name: 1,
        assignedTo: 1,
        assignedToName: 1,
        createdAt: 1,
        updatedAt: 1,
        caseManagerAssignedAt: 1,
      })
      .toArray();

    // Scope to date or month window using robust JS date parsing with fallbacks.
    // Checks caseManagerAssignedAt first, falls back to updatedAt, then createdAt.
    // Handles both BSON Date objects and ISO strings safely.
    let cohortWindow: { start: Date; end: Date } | null = null;
    if (date) cohortWindow = dayWindow(date);
    else if (month) cohortWindow = monthWindow(month);

    const leads = cohortWindow
      ? allLeads.filter((l) => {
          const rawDate = l.caseManagerAssignedAt || l.updatedAt || l.createdAt;
          if (!rawDate) return false;
          const d = new Date(rawDate);
          return !isNaN(d.getTime()) && d >= cohortWindow!.start && d < cohortWindow!.end;
        })
      : allLeads;

    const leadIds = leads.map((l) => l.id);
    const totalLeads = leadIds.length;

    // Fetch all employers and sources for these leads
    const employers =
      leadIds.length > 0
        ? await db
            .collection("case_marketing_employers")
            .find({ leadId: { $in: leadIds } })
            .toArray()
        : [];

    const sources =
      leadIds.length > 0
        ? await db
            .collection("case_marketing_sources")
            .find({ leadId: { $in: leadIds } })
            .toArray()
        : [];

    // Global metrics
    const totalEmployers = employers.length;
    const totalSources = sources.length;
    const totalEmailsSent = employers.filter((e) => e.emailSent).length;
    const totalReplies = employers.filter((e) => e.status && e.status !== "No Response").length;
    const totalInterested = employers.filter((e) => e.status === "Interested").length;
    const totalInterviews = employers.filter((e) => e.status === "Interview Scheduled").length;

    // Follow-ups due today (same logic as summary route)
    let followupsDueToday = 0;
    for (const e of employers) {
      if (!e.emailSent) continue;
      const info = getFollowupInfo(e.emailSentAt, e.status, e.lastFollowupAt, e.followupCount || 0);
      if (info && !info.closed && info.isDueOrOverdue) followupsDueToday += 1;
    }

    const avgResponseRate =
      totalEmailsSent > 0 ? Math.round((totalReplies / totalEmailsSent) * 100) : 0;
    const avgCompletionRate =
      totalEmployers > 0 ? Math.round((totalEmailsSent / totalEmployers) * 100) : 0;

    // Per-phase breakdown
    const phaseBreakdown = PHASES.map((p) => {
      const phaseEmployers = employers.filter((e) => e.phase === p.phase);
      const phaseSources = sources.filter((s) => s.phase === p.phase);
      const emailsSent = phaseEmployers.filter((e) => e.emailSent).length;
      const replies = phaseEmployers.filter((e) => e.status && e.status !== "No Response").length;
      const completedSources = phaseSources.filter((s) => s.status === "completed").length;
      return {
        phase: p.phase,
        label: p.label,
        employers: phaseEmployers.length,
        sources: phaseSources.length,
        completedSources,
        emailsSent,
        replies,
        responseRate: emailsSent > 0 ? Math.round((replies / emailsSent) * 100) : 0,
      };
    });

    // Status breakdown (across all employers)
    const terminalStatuses = STATUS_OPTIONS.filter((s) => s.terminal).map((s) => s.value);
    const statusCounts: Record<string, number> = {};
    for (const e of employers) {
      const key = e.status || "Pending";
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    const statusBreakdown = Object.entries(statusCounts)
      .map(([status, count]) => ({
        status,
        count,
        isTerminal: terminalStatuses.includes(status),
      }))
      .sort((a, b) => b.count - a.count);

    // Per case manager performance
    const caseManagerMap = new Map<
      number,
      {
        caseManagerId: number;
        caseManagerName: string;
        leads: number;
        employers: number;
        emailsSent: number;
        replies: number;
        interested: number;
        interviews: number;
        followupsDue: number;
        responseRate: number;
      }
    >();

    for (const lead of leads) {
      const id = lead.assignedTo ?? 0;
      const name = lead.assignedToName ?? "Unassigned";
      if (!caseManagerMap.has(id)) {
        caseManagerMap.set(id, {
          caseManagerId: id,
          caseManagerName: name,
          leads: 0,
          employers: 0,
          emailsSent: 0,
          replies: 0,
          interested: 0,
          interviews: 0,
          followupsDue: 0,
          responseRate: 0,
        });
      }
      const entry = caseManagerMap.get(id)!;
      entry.leads += 1;

      const leadEmployers = employers.filter((e) => e.leadId === lead.id);
      const sent = leadEmployers.filter((e) => e.emailSent).length;
      const rep = leadEmployers.filter((e) => e.status && e.status !== "No Response").length;
      let due = 0;
      for (const e of leadEmployers) {
        if (!e.emailSent) continue;
        const info = getFollowupInfo(e.emailSentAt, e.status, e.lastFollowupAt, e.followupCount || 0);
        if (info && !info.closed && info.isDueOrOverdue) due += 1;
      }

      entry.employers += leadEmployers.length;
      entry.emailsSent += sent;
      entry.replies += rep;
      entry.interested += leadEmployers.filter((e) => e.status === "Interested").length;
      entry.interviews += leadEmployers.filter((e) => e.status === "Interview Scheduled").length;
      entry.followupsDue += due;
    }

    // Compute response rate per case manager
    for (const cm of caseManagerMap.values()) {
      cm.responseRate =
        cm.emailsSent > 0 ? Math.round((cm.replies / cm.emailsSent) * 100) : 0;
    }

    const caseManagerPerformance = Array.from(caseManagerMap.values()).sort(
      (a, b) => b.leads - a.leads
    );

    // Leaderboard: ranked by interviews + interested + response rate
    const leaderboard = [...caseManagerPerformance]
      .map((cm) => ({
        rank: 0,
        ...cm,
        score: cm.interviews * 3 + cm.interested * 2 + cm.responseRate,
      }))
      .sort((a, b) => b.score - a.score)
      .map((cm, i) => ({ ...cm, rank: i + 1 }));

    // Fetch all case managers for filter dropdown
    const caseManagers = await db
      .collection("users")
      .find({ role: "case_manager" })
      .project({ id: 1, name: 1 })
      .toArray();

    return NextResponse.json({
      filtered: !!(date || month || assignedTo),
      date: date || null,
      month: month || null,
      totalLeads,
      totalEmployers,
      totalSources,
      totalEmailsSent,
      totalReplies,
      totalInterested,
      totalInterviews,
      followupsDueToday,
      avgResponseRate,
      avgCompletionRate,
      phaseBreakdown,
      statusBreakdown,
      caseManagerPerformance,
      leaderboard,
      caseManagers: caseManagers.map((u) => ({ id: u.id, name: u.name })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
