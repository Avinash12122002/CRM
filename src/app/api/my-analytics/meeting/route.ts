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
    if (payload.role !== "meeting" && payload.role !== "wm") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

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

    // 1. Fetch ALL leads associated with this meeting user (assigned, booked, conducted, or converted)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLeadsRaw: any[] = await db
      .collection("leads")
      .find({
        $or: [
          { "meetingDetails.meetingUserId": { $in: matchUserIds } },
          { "meetingDetails.bookedBy": { $in: matchUserIds } },
          { assignedTo: { $in: matchUserIds } },
          { "salesDocument.uploadedBy": { $in: matchUserIds } },
          { history: { $elemMatch: { action: "status_updated", newStatus: "sales", performedBy: { $in: matchUserIds } } } },
        ],
      })
      .toArray();

    allLeadsRaw.sort((a, b) => {
      const dateA = a.meetingDetails?.meetingDate || (a.createdAt ? getISTDateStr(a.createdAt) : "") || "";
      const dateB = b.meetingDetails?.meetingDate || (b.createdAt ? getISTDateStr(b.createdAt) : "") || "";
      const dateCmp = dateB.localeCompare(dateA);
      if (dateCmp !== 0) return dateCmp;

      const timeA = a.meetingDetails?.startTime || "";
      const timeB = b.meetingDetails?.startTime || "";
      return timeB.localeCompare(timeA);
    });

    const isFiltered = !!(validDate || validMonth);

    // Cohort leads
    const cohortLeads = isFiltered
      ? allLeadsRaw.filter((l) =>
          isDateInCohort(l.meetingDetails?.meetingDate || l.createdAt || l.updatedAt, validDate, validMonth)
        )
      : allLeadsRaw;

    // Separate cohort for leads that actually sit in meetingDetails (true meeting leads)
    const cohortMeetingLeads = cohortLeads.filter((l) => l.meetingDetails != null);

    // Total leads & Total meetings metrics
    const totalLeads = cohortLeads.length;
    const totalMeetings = cohortMeetingLeads.length;

    const isCompleted = (l: any) =>
      l.meetingStatus === "completed" || l.meetingDetails?.status === "completed" || l.status === "sales";
    const isCancelled = (l: any) =>
      l.meetingStatus === "cancelled" || l.meetingDetails?.status === "cancelled";
    const isScheduled = (l: any) =>
      !isCompleted(l) &&
      !isCancelled(l) &&
      (l.meetingStatus === "scheduled" || l.status === "meeting-scheduled" || l.meetingDetails?.status === "scheduled");

    const completed = cohortMeetingLeads.filter(isCompleted).length;
    const cancelled = cohortMeetingLeads.filter(isCancelled).length;
    const scheduled = cohortMeetingLeads.filter(isScheduled).length;

    // Sales attributed to this meeting user
    const salesConverted = cohortLeads.filter((l) => l.status === "sales").length;
    const conversionRate = pct(salesConverted, totalLeads);
    const meetingEfficiency = pct(salesConverted, totalMeetings);

    // Upcoming meetings (scheduled, future or today)
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const upcomingMeetings = allLeadsRaw
      .filter((l: any) => {
        const mDate = l.meetingDetails?.meetingDate || "";
        return isScheduled(l) && mDate >= todayStr;
      })
      .sort((a: any, b: any) => {
        const dateA = a.meetingDetails?.meetingDate || "";
        const dateB = b.meetingDetails?.meetingDate || "";
        const dateCmp = dateA.localeCompare(dateB);
        if (dateCmp !== 0) return dateCmp;
        const timeA = a.meetingDetails?.startTime || "";
        const timeB = b.meetingDetails?.startTime || "";
        return timeB.localeCompare(timeA);
      })
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
      date: validDate || null, month: validMonth || null, filtered: isFiltered, totalInDb: allLeadsRaw.length,
      metrics: {
        totalLeads, totalMeetings, completed, cancelled, scheduled,
        salesConverted, conversionRate, meetingEfficiency,
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
