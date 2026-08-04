import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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
    if (payload.role !== "meeting") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();

    const uid = payload.id;
    const uidStr = String(uid);
    const uidNum = isNaN(Number(uid)) ? null : Number(uid);
    const matchUserIds = Array.from(new Set([uid, uidStr, uidNum].filter((x) => x != null)));

    // Query leads with meeting details assigned to or conducted by this meeting user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allMeetingLeads: any[] = await db
      .collection("leads")
      .find({
        meetingDetails: { $exists: true, $ne: null },
        $or: [
          { "meetingDetails.meetingUserId": { $in: matchUserIds } },
          { assignedTo: { $in: matchUserIds } },
        ],
      })
      .toArray();

    allMeetingLeads.sort((a, b) => {
      const da = new Date(a.meetingDetails?.meetingDate || a.createdAt || 0).getTime();
      const dbTime = new Date(b.meetingDetails?.meetingDate || b.createdAt || 0).getTime();
      return dbTime - da;
    });

    const totalInDb = allMeetingLeads.length;
    const isFiltered = !!(validDate || validMonth);

    // Filter by cohort date/month (check meetingDate first, fallback to createdAt/updatedAt)
    const cohortLeads = isFiltered
      ? allMeetingLeads.filter((l) =>
          isDateInCohort(l.meetingDetails?.meetingDate || l.createdAt || l.updatedAt, validDate, validMonth)
        )
      : allMeetingLeads;

    // Metrics matching the Meetings page (/dashboard/meetings) exactly:
    const totalMeetings = cohortLeads.length;
    const completed = cohortLeads.filter(
      (l) => l.meetingStatus === "completed" || l.status === "sales"
    ).length;
    const cancelled = cohortLeads.filter((l) => l.meetingStatus === "cancelled").length;
    const scheduled = cohortLeads.filter(
      (l) =>
        l.meetingStatus === "scheduled" ||
        (!l.meetingStatus && l.status !== "sales" && l.status !== "lost")
    ).length;

    // Sales attributed to this meeting user
    const salesConverted = cohortLeads.filter((l) => l.status === "sales").length;
    const conversionRate = pct(salesConverted, cohortLeads.length);
    const meetingEfficiency = pct(salesConverted, totalMeetings);

    // Upcoming meetings (scheduled, future or today)
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const upcomingMeetings = allMeetingLeads
      .filter((l) => {
        const isScheduled = l.meetingStatus === "scheduled" || (!l.meetingStatus && l.status !== "sales" && l.status !== "lost");
        const mDate = l.meetingDetails?.meetingDate || "";
        return isScheduled && mDate >= todayStr;
      })
      .sort((a, b) => ((a.meetingDetails?.meetingDate || "") > (b.meetingDetails?.meetingDate || "") ? 1 : -1))
      .slice(0, 10)
      .map((l) => ({
        leadId: l.id,
        meetingDate: l.meetingDetails?.meetingDate || "—",
        startTime: l.meetingDetails?.startTime || "—",
        endTime: l.meetingDetails?.endTime || "—",
        bookedByName: l.meetingDetails?.bookedByName || "—",
      }));

    // Full daily history trend (ALL dates in cohort)
    const trendMap = new Map<string, number>();
    for (const l of cohortLeads) {
      const day = getISTDateStr(l.meetingDetails?.meetingDate || l.createdAt || l.updatedAt);
      if (!day) continue;
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }
    const dailyTrend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Paginated history of meeting leads in cohort
    const page = Math.max(1, pageParam);
    const limit = Math.max(1, limitParam);
    const total = cohortLeads.length;
    const totalPages = Math.ceil(total / limit) || 0;
    const startIndex = (page - 1) * limit;
    const paginatedItems = cohortLeads.slice(startIndex, startIndex + limit).map((l) => ({
      id: l.id,
      leadId: l.id,
      meetingDate: l.meetingDetails?.meetingDate || "—",
      startTime: l.meetingDetails?.startTime || "—",
      endTime: l.meetingDetails?.endTime || "—",
      status: l.meetingStatus || (l.status === "sales" ? "completed" : "scheduled"),
      bookedByName: l.meetingDetails?.bookedByName || "—",
    }));

    return NextResponse.json({
      date: validDate || null, month: validMonth || null, filtered: isFiltered, totalInDb,
      metrics: {
        totalMeetings, completed, cancelled, scheduled,
        salesConverted, totalLeadsAssigned: cohortLeads.length,
        conversionRate, meetingEfficiency,
      },
      upcomingMeetings, dailyTrend,
      history: {
        items: paginatedItems,
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
