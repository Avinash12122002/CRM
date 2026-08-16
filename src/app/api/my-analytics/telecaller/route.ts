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

const IN_PROGRESS = ["call-back", "not-answering", "document-pending", "payment-pending", "follow-up"];
const LOST = ["wrong-number", "not-interested"];
const ALL_STATUSES = [
  { key: "new-lead", label: "New Lead" },
  { key: "call-back", label: "Call Back" },
  { key: "not-answering", label: "Not Answering" },
  { key: "meeting-scheduled", label: "Meeting Scheduled" },
  { key: "not-interested", label: "Not Interested" },
  { key: "wrong-number", label: "Wrong Number" },
  { key: "document-pending", label: "Document Pending" },
  { key: "payment-pending", label: "Payment Pending" },
  { key: "sales", label: "Sales (Converted)" },
  { key: "follow-up", label: "Follow Up" },
];

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (payload.role !== "telecaller" && payload.role !== "employee" && payload.role !== "wtc" && payload.role !== "supervisor") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

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

    // Fetch leads associated with this telecaller
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLeads: any[] = await db.collection("leads").find({
      $or: [
        { assignedTo: uid },
        { assignedTo: uidStr },
        { "meetingDetails.bookedBy": uid },
        { "meetingDetails.bookedBy": uidStr },
        { "salesDocument.uploadedBy": uid },
        { "salesDocument.uploadedBy": uidStr },
        { history: { $elemMatch: { action: "status_updated", newStatus: "sales", performedBy: { $in: [uid, uidStr] } } } },
      ],
    }).toArray();

    // Active leads (new-lead, call-back, etc.) belong to this telecaller if currently assigned to them;
    // Sales leads belong to this telecaller if assigned, booked, or converted by them.
    const allLeads = rawLeads.filter((l) => {
      const isCurrentlyAssigned = String(l.assignedTo) === uidStr;
      if (l.status === "sales") {
        return true;
      }
      return isCurrentlyAssigned;
    });

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

    // Headline metrics for cohort
    const totalLeads = cohort.length;
    const newLeads = cohort.filter((l) => l.status === "new-lead").length;
    const inProgress = cohort.filter((l) => IN_PROGRESS.includes(l.status)).length;
    const lost = cohort.filter((l) => LOST.includes(l.status)).length;
    const sales = cohort.filter((l) => l.status === "sales").length;
    const meetingScheduled = cohort.filter((l) => l.status === "meeting-scheduled").length;
    const conversionRate = pct(sales, totalLeads);
    const dropRate = pct(lost, totalLeads);

    // Status distribution for cohort
    const statusDistribution = ALL_STATUSES.map((s) => ({
      status: s.key,
      label: s.label,
      count: cohort.filter((l) => l.status === s.key).length,
    }));

    // Today's callbacks due (from ALL leads assigned to this user)
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const callbacksDueToday = allLeads
      .filter((l) => {
        if (l.status !== "call-back" || !l.callbackDate) return false;
        return getISTDateStr(l.callbackDate) === todayStr;
      })
      .map((l) => ({ id: l.id, name: l.name, phone: l.phone, callbackDate: l.callbackDate }));

    // Full daily history trend (ALL dates in cohort, no 30-day limit)
    const trendMap = new Map<string, number>();
    for (const l of cohort) {
      const day = getISTDateStr(l.createdAt || l.updatedAt);
      if (!day) continue;
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }
    const dailyTrend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Paginated history of leads in cohort
    const page = Math.max(1, pageParam);
    const limit = Math.max(1, limitParam);
    const total = cohort.length;
    const totalPages = Math.ceil(total / limit) || 0;
    const startIndex = (page - 1) * limit;
    const paginatedLeads = cohort.slice(startIndex, startIndex + limit).map((l) => ({
      id: l.id,
      name: l.name || "—",
      phone: l.phone || "—",
      leadSource: l.leadSource || "—",
      status: l.status,
      createdAt: l.createdAt || l.updatedAt || null,
      isTriloknath: false,
    }));

    return NextResponse.json({
      date: validDate || null,
      month: validMonth || null,
      filtered: isFiltered,
      totalInDb,
      metrics: { totalLeads, newLeads, inProgress, meetingScheduled, lost, sales, conversionRate, dropRate },
      statusDistribution,
      callbacksDueToday,
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
