import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, PIPELINE_STAGES } from "@/lib/bd/constants";

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
    const payload = getAuthPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (payload.role !== "business_development") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();

    // All BD leads assigned to this user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLeads: any[] = await db.collection(BD_COLLECTIONS.leads).find({ assignedTo: payload.id }).toArray();
    allLeads.sort((a, b) => {
      const da = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const dbTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return dbTime - da;
    });
    const totalInDb = allLeads.length;

    const isFiltered = !!(validDate || validMonth);

    const cohort = isFiltered
      ? allLeads.filter((l) => isDateInCohort(l.createdAt || l.updatedAt, validDate, validMonth))
      : allLeads;

    // Headline metrics
    const totalLeads = cohort.length;
    const dealsDone = cohort.filter((l) => l.status === "deal_done" || l.pipelineStage === "Deal Done").length;
    const meetingsScheduled = cohort.filter((l) => l.pipelineStage === "Meeting Scheduled").length;
    const leadLost = cohort.filter((l) => l.status === "lost").length;
    const successRate = pct(dealsDone, totalLeads);
    const dropRate = pct(leadLost, totalLeads);
    const efficiency = pct(meetingsScheduled, totalLeads);

    // High Priority Set: counts ONLY leads currently in 'Priority Set' stage AND marked as High priority
    // If a lead moves to subsequent steps (e.g. Initial Contact, Response Received, Meeting Scheduled) or is lost, it won't count.
    const highPrioritySet = cohort.filter((l) => {
      if (l.status === "lost" || l.status === "deal_done") return false;
      if (l.pipelineStage !== "Priority Set") return false;
      return l.priority === "High" || String(l.priority).toLowerCase() === "high";
    }).length;

    // Active leads ONLY (exclude status === 'lost' and status === 'deal_done')
    const activeLeads = cohort.filter((l) => l.status !== "lost" && l.status !== "deal_done");

    // Active Stage distribution
    const stageDistribution: { stage: string; count: number }[] = PIPELINE_STAGES.filter((s) => s !== "Deal Done").map((stage) => ({
      stage: String(stage),
      count: activeLeads.filter((l) => l.pipelineStage === stage).length,
    }));
    stageDistribution.push({ stage: "Deal Done", count: dealsDone });
    stageDistribution.push({ stage: "Lead Lost", count: leadLost });

    // Full daily history trend (ALL dates in cohort)
    const trendMap = new Map<string, number>();
    for (const l of cohort) {
      const day = getISTDateStr(l.createdAt || l.updatedAt);
      if (!day) continue;
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }
    const dailyTrend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Paginated history of BD leads in cohort
    const page = Math.max(1, pageParam);
    const limit = Math.max(1, limitParam);
    const total = cohort.length;
    const totalPages = Math.ceil(total / limit) || 0;
    const startIndex = (page - 1) * limit;
    const paginatedLeads = cohort.slice(startIndex, startIndex + limit).map((l) => ({
      id: l.id,
      companyName: l.companyName || l.contactPerson || "—",
      contactPerson: l.contactPerson || "—",
      pipelineStage: l.pipelineStage || "New Lead",
      priority: l.priority || "—",
      status: l.status || "active",
      createdAt: l.createdAt || null,
    }));

    return NextResponse.json({
      date: validDate || null, month: validMonth || null, filtered: isFiltered, totalInDb,
      metrics: { totalLeads, dealsDone, meetingsScheduled, leadLost, successRate, dropRate, efficiency, highPrioritySet },
      stageDistribution, dailyTrend,
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
