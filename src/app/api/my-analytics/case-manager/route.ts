import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { PHASES, getFollowupInfo } from "@/lib/caseMarketing";

function getISTDateStr(raw: any): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getISTMonthStr(raw: any): string | null {
  const istDate = getISTDateStr(raw);
  return istDate ? istDate.slice(0, 7) : null;
}

function isDateInCohort(rawDate: any, validDate: string, validMonth: string): boolean {
  if (validDate) {
    return getISTDateStr(rawDate) === validDate;
  }
  if (validMonth) {
    return getISTMonthStr(rawDate) === validMonth;
  }
  return true;
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round(Math.min(100, Math.max(0, (n / d) * 100)) * 10) / 10;
}

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (payload.role !== "case_manager") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();

    // Fetch case leads assigned to this manager from main leads collection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadsMain: any[] = await db
      .collection("leads")
      .find({ assignedToRole: "case_manager", assignedTo: payload.id })
      .project({ id: 1, name: 1, phone: 1, assignedTo: 1, createdAt: 1, updatedAt: 1, caseManagerAssignedAt: 1 })
      .toArray();

    const allCaseLeads = leadsMain.sort((a, b) => {
      const da = new Date(a.caseManagerAssignedAt || a.createdAt || 0).getTime();
      const dbTime = new Date(b.caseManagerAssignedAt || b.createdAt || 0).getTime();
      return dbTime - da;
    });

    const totalInDb = allCaseLeads.length;
    const isFiltered = !!(validDate || validMonth);

    // Filter case leads by caseManagerAssignedAt (or fallback date) in date/month window
    const cohortLeads = isFiltered
      ? allCaseLeads.filter((l) => isDateInCohort(l.caseManagerAssignedAt || l.createdAt, validDate, validMonth))
      : allCaseLeads;

    const totalCaseLeads = cohortLeads.length;

    // Get lead IDs for cohort lookups
    const cohortLeadIds = cohortLeads.map((l) => l.id);

    // Fetch CV Marketing employers and sources ONLY for the cohort leads (100% filter accuracy)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employers: any[] =
      cohortLeadIds.length > 0
        ? await db.collection("case_marketing_employers").find({ leadId: { $in: cohortLeadIds } }).toArray()
        : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources: any[] =
      cohortLeadIds.length > 0
        ? await db.collection("case_marketing_sources").find({ leadId: { $in: cohortLeadIds } }).toArray()
        : [];

    // Global metrics for cohort
    const totalEmployers = employers.length;
    const totalSources = sources.length;
    const emailsSent = employers.filter((e) => e.emailSent).length;
    const replies = employers.filter((e) => e.status && e.status !== "No Response").length;
    const interested = employers.filter((e) => e.status === "Interested").length;
    const interviews = employers.filter((e) => e.status === "Interview Scheduled").length;

    // Follow-ups due today for cohort employers
    let followupsDueToday = 0;
    for (const e of employers) {
      if (!e.emailSent) continue;
      const info = getFollowupInfo(e.emailSentAt, e.status, e.lastFollowupAt, e.followupCount || 0);
      if (info && !info.closed && info.isDueOrOverdue) followupsDueToday++;
    }

    const avgResponseRate = pct(replies, emailsSent);
    const avgCompletionRate = pct(emailsSent, totalEmployers);

    // Per-phase breakdown for cohort
    const phaseBreakdown = PHASES.map((p) => {
      const phaseEmployers = employers.filter((e) => e.phase === p.phase);
      const phaseSources = sources.filter((s) => s.phase === p.phase);
      const phaseEmailsSent = phaseEmployers.filter((e) => e.emailSent).length;
      const phaseReplies = phaseEmployers.filter((e) => e.status && e.status !== "No Response").length;
      const completedSources = phaseSources.filter((s) => s.status === "completed").length;
      return {
        phase: p.phase,
        label: p.label,
        employers: phaseEmployers.length,
        sources: phaseSources.length,
        completedSources,
        emailsSent: phaseEmailsSent,
        replies: phaseReplies,
        responseRate: pct(phaseReplies, phaseEmailsSent),
      };
    });

    // Employer status breakdown for cohort
    const statusMap = new Map<string, number>();
    for (const e of employers) {
      const st = e.status || "Pending";
      statusMap.set(st, (statusMap.get(st) || 0) + 1);
    }
    const statusBreakdown = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // Full daily history trend (ALL dates in cohort)
    const trendMap = new Map<string, number>();
    for (const l of cohortLeads) {
      const day = getISTDateStr(l.caseManagerAssignedAt || l.createdAt);
      if (!day) continue;
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }
    const dailyTrend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Paginated history of case leads in cohort
    const page = Math.max(1, pageParam);
    const limit = Math.max(1, limitParam);
    const total = cohortLeads.length;
    const totalPages = Math.ceil(total / limit) || 0;
    const startIndex = (page - 1) * limit;

    // Attach employer & source stats to each paginated lead
    const paginatedLeads = cohortLeads.slice(startIndex, startIndex + limit).map((l) => {
      const lEmployers = employers.filter((e) => e.leadId === l.id);
      const lEmailsSent = lEmployers.filter((e) => e.emailSent).length;
      const lReplies = lEmployers.filter((e) => e.status && e.status !== "No Response").length;
      return {
        id: l.id,
        name: l.name || "—",
        phone: l.phone || "—",
        assignedAt: l.caseManagerAssignedAt || l.createdAt || null,
        employersCount: lEmployers.length,
        emailsSent: lEmailsSent,
        replies: lReplies,
        isTriloknath: !!l.triloknathLead,
      };
    });

    return NextResponse.json({
      date: validDate || null,
      month: validMonth || null,
      filtered: isFiltered,
      totalInDb,
      metrics: {
        totalCaseLeads,
        totalEmployers,
        totalSources,
        emailsSent,
        replies,
        interested,
        interviews,
        followupsDueToday,
        avgResponseRate,
        avgCompletionRate,
      },
      phaseBreakdown,
      statusBreakdown,
      dailyTrend,
      history: {
        items: paginatedLeads,
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
