import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// Lead Analytics for the legacy `leads` collection — the sales/meeting funnel
// counterpart to BD Analytics. Admin-only.
//
// FIXES vs previous version:
//  - Filtering is now two OPTIONAL controls — a single Date (YYYY-MM-DD) and
//    a Month (YYYY-MM) — instead of the old "All Time / Today / Yesterday /
//    Weekly / Monthly" dropdown. Neither is required: with nothing selected,
//    EVERY section reflects ALL leads ever created (lifetime "All Time"
//    behaviour). Pick a date or a month and every section — headline
//    metrics, status distribution, Agent Performance, and both
//    Leaderboards — scopes down to leads *created* in that window; `date`
//    takes precedence if both are somehow sent.
//  - Agent Performance & Leaderboards reuse the exact same attribution rules
//    as /api/dashboard/admin-stats (scoped to the selected window instead of
//    always lifetime) so the numbers stay consistent with how the Admin
//    Dashboard computes them.
//  - In Progress = call-back + not-answering + document-pending + payment-pending
//    (current status only).
//  - Lost = wrong-number + not-interested (current status only).
//  - Meeting Scheduled (headline) = distinct leads that ever reached the
//    meeting-scheduled milestone (dedup per lead, so a lead handed from an
//    employee to a meeting user is still ONE meeting, never two).
//  - Sales attribution: when a lead went through a meeting, BOTH the employee
//    who booked it (meetingDetails.bookedBy) AND the meeting user who ran it
//    (meetingDetails.meetingUserId) are credited +1 sale each in their own
//    performance rows — this matches the Admin Dashboard's behaviour, while
//    the headline "Sales" count itself still counts each lead once.
//  - Meeting Efficiency = Sales / Meetings Scheduled × 100 (clamped 0-100).
//  - Conversion Rate = Sales / Total Leads × 100 (clamped 0-100).
//  - Drop Rate = (Wrong Number + Not Interested) / Total Leads × 100
//    (clamped 0-100 — can never be negative).
//  - Employee Leaderboard % and Meeting Leaderboard % are computed against
//    the count of leads/meetings assigned to that person WITHIN THE SAME
//    SCOPE as everything else on the page (never just their currently-
//    active, non-sold leads), so the percentage can no longer exceed 100%.

// Lead lifecycle statuses (see /api/leads/[id]/status validStatuses).
const LEAD_STATUSES = [
  "new-lead",
  "call-back",
  "not-answering",
  "meeting-scheduled",
  "not-interested",
  "wrong-number",
  "document-pending",
  "payment-pending",
  "sales",
] as const;

const STATUS_LABELS: Record<string, string> = {
  "new-lead": "New Lead",
  "call-back": "Call Back",
  "not-answering": "Not Answering",
  "meeting-scheduled": "Meeting Scheduled",
  "not-interested": "Not Interested",
  "wrong-number": "Wrong Number",
  "document-pending": "Document Pending",
  "payment-pending": "Payment Pending",
  sales: "Sales (Converted)",
};

const IN_PROGRESS_STATUSES = ["call-back", "not-answering", "document-pending", "payment-pending"];
const LOST_STATUSES = ["wrong-number", "not-interested"];

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// Clamp a percentage into the sane 0-100 range (a ratio can never be
// negative or exceed 100 once the denominator is correct, but we clamp
// defensively so stale/legacy data can never render an impossible number).
function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  const value = (numerator / denominator) * 100;
  return round1(Math.min(100, Math.max(0, value)));
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
    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    // Both filters are OPTIONAL and OFF by default — with neither supplied,
    // every headline/status metric is computed over ALL leads ever created
    // (lifetime), same as the old "All Time" option. Passing `date`
    // (YYYY-MM-DD) scopes to that single IST day; passing `month` (YYYY-MM)
    // scopes to that IST calendar month. `date` wins if both are present.
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();

    const users = await db
      .collection("users")
      .find({})
      .project({ id: 1, name: 1, role: 1 })
      .toArray();
    const staffUsers = users.filter((u) => u.role === "employee" || u.role === "meeting");

    // Pull every lead once — headline metrics, status distribution, Agent
    // Performance, and both Leaderboards are ALL derived from the same
    // (optionally filtered) cohort below, so every section on the page
    // moves together when the date/month filter changes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLeads: any[] = await db.collection("leads").find({}).toArray();

    let cohortWindow: { start: Date; end: Date } | null = null;
    if (validDate) cohortWindow = dayWindow(validDate);
    else if (validMonth) cohortWindow = monthWindow(validMonth);

    const cohortLeads = cohortWindow
      ? allLeads.filter(
          (l) =>
            l.createdAt &&
            new Date(l.createdAt) >= cohortWindow!.start &&
            new Date(l.createdAt) < cohortWindow!.end
        )
      : allLeads; // no filter selected -> whole dataset

    // ---- Helpers -----------------------------------------------------

    // A lead "ever had a meeting scheduled" if it currently sits at that
    // status, meetingDetails carries a meeting user, or history recorded the
    // scheduling event — checked this way (instead of only "current status")
    // so a lead that later converted to Sales or was Lost is still counted
    // once as a meeting, and a lead handed off between an employee and a
    // meeting user is never double-counted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const everHadMeeting = (lead: any): boolean => {
      if (lead.status === "meeting-scheduled") return true;
      if (lead.meetingDetails && lead.meetingDetails.meetingUserId != null) return true;
      if (
        Array.isArray(lead.history) &&
        lead.history.some(
          (h: { action?: string; newStatus?: string }) =>
            h.action === "meeting_scheduled" || h.newStatus === "meeting-scheduled"
        )
      )
        return true;
      return false;
    };

    // ---- Headline metrics (scoped to the selected filter, or all-time) ---
    const totalLeads = cohortLeads.length;
    const newLeads = cohortLeads.filter((l) => l.status === "new-lead").length;
    const inProgress = cohortLeads.filter((l) => IN_PROGRESS_STATUSES.includes(l.status)).length;
    const salesCount = cohortLeads.filter((l) => l.status === "sales").length;
    const lostCount = cohortLeads.filter((l) => LOST_STATUSES.includes(l.status)).length;
    const meetingsScheduledCount = cohortLeads.filter(everHadMeeting).length;

    const meetingEfficiency = pct(meetingsScheduledCount,totalLeads);
    const conversionRate = pct(salesCount, totalLeads);
    const dropRate = pct(lostCount, totalLeads);

    // ---- Status distribution (scoped to the selected filter, or all-time) --
    const statusCounts: Record<string, number> = {};
    LEAD_STATUSES.forEach((s) => (statusCounts[s] = 0));
    for (const l of cohortLeads) {
      if (statusCounts[l.status] === undefined) statusCounts[l.status] = 0;
      statusCounts[l.status] += 1;
    }
    const statusDistribution = LEAD_STATUSES.map((s) => ({
      status: s,
      label: STATUS_LABELS[s] || s,
      count: statusCounts[s] || 0,
    }));

    // ---- Lifetime performance + leaderboards ---------------------------
    // Mirrors /api/dashboard/admin-stats exactly so both pages agree.
    type StaffEntry = {
      userId: number;
      userName: string;
      role: string;
      newLeads: number;
      callBack: number;
      notAnswering: number;
      meetingScheduled: number;
      documentPending: number;
      paymentPending: number;
      sales: number;
      leadsAssignedCount: number;
      meetingsAssignedCount: number;
    };

    const staffMap = new Map<number, StaffEntry>();
    for (const u of staffUsers) {
      staffMap.set(u.id, {
        userId: u.id,
        userName: u.name,
        role: u.role,
        newLeads: 0,
        callBack: 0,
        notAnswering: 0,
        meetingScheduled: 0,
        documentPending: 0,
        paymentPending: 0,
        sales: 0,
        leadsAssignedCount: 0,
        meetingsAssignedCount: 0,
      });
    }

    // Step B — current, active (non-sales) workload breakdown per person,
    // scoped to the selected date/month (or every lead if unfiltered).
    for (const l of cohortLeads) {
      if (l.assignedTo == null || l.status === "sales") continue;
      const entry = staffMap.get(l.assignedTo);
      if (!entry) continue;
      if (l.status === "new-lead") entry.newLeads += 1;
      else if (l.status === "call-back") entry.callBack += 1;
      else if (l.status === "not-answering") entry.notAnswering += 1;
      else if (l.status === "meeting-scheduled") entry.meetingScheduled += 1;
      else if (l.status === "document-pending") entry.documentPending += 1;
      else if (l.status === "payment-pending") entry.paymentPending += 1;
    }

    // Step C — sales attribution, scoped to the same window. Case A: lead
    // went through a meeting, credit BOTH the booking employee and the
    // meeting user. Case B: direct sale (no meeting), credit whoever
    // performed the status_updated -> "sales" transition in history.
    for (const l of cohortLeads) {
      if (l.status !== "sales") continue;
      const bookedBy = l.meetingDetails?.bookedBy ?? null;
      const meetingUserId = l.meetingDetails?.meetingUserId ?? null;
      const hasMeetingData = bookedBy != null || meetingUserId != null;

      if (hasMeetingData) {
        const credited = new Set<number>();
        if (bookedBy != null && staffMap.has(bookedBy)) {
          staffMap.get(bookedBy)!.sales += 1;
          credited.add(bookedBy);
        }
        if (meetingUserId != null && !credited.has(meetingUserId) && staffMap.has(meetingUserId)) {
          staffMap.get(meetingUserId)!.sales += 1;
          credited.add(meetingUserId);
        }
      } else {
        const history: Array<{ action?: string; newStatus?: string; performedBy?: number }> = Array.isArray(
          l.history
        )
          ? l.history
          : [];
        let salesPerformedBy: number | null = null;
        for (let i = history.length - 1; i >= 0; i--) {
          const h = history[i];
          if (h.action === "status_updated" && h.newStatus === "sales" && h.performedBy != null) {
            salesPerformedBy = h.performedBy;
            break;
          }
        }
        if (salesPerformedBy != null && staffMap.has(salesPerformedBy)) {
          staffMap.get(salesPerformedBy)!.sales += 1;
        }
      }
    }

    // Denominators for the leaderboards — every lead assigned to a person
    // (leadsAssignedCount) and every lead a meeting user was the meeting
    // owner of (meetingsAssignedCount), scoped to the SAME window as
    // everything else above. Using the full scoped set (not just currently-
    // active, non-sold leads) is what keeps the success percentage from
    // ever exceeding 100%.
    for (const l of cohortLeads) {
      const assignedIds = new Set<number>();
      if (l.assignedTo != null) assignedIds.add(l.assignedTo);
      if (Array.isArray(l.history)) {
        for (const h of l.history) {
          if (h.newAssignee != null) assignedIds.add(h.newAssignee);
        }
      }
      for (const uid of assignedIds) {
        const entry = staffMap.get(uid);
        if (entry) entry.leadsAssignedCount += 1;
      }

      const meetingIds = new Set<number>();
      if (l.meetingDetails?.meetingUserId != null) meetingIds.add(l.meetingDetails.meetingUserId);
      if (Array.isArray(l.history)) {
        for (const h of l.history) {
          if (h.action === "meeting_scheduled" && h.newAssignee != null) meetingIds.add(h.newAssignee);
        }
      }
      for (const uid of meetingIds) {
        const entry = staffMap.get(uid);
        if (entry && entry.role === "meeting") entry.meetingsAssignedCount += 1;
      }
    }

    const allStaff = Array.from(staffMap.values());

    const employeePerformance = allStaff
      .filter((s) => s.role === "employee")
      .map((s) => ({
        userId: s.userId,
        userName: s.userName,
        newLeads: s.newLeads,
        callBack: s.callBack,
        notAnswering: s.notAnswering,
        documentPending: s.documentPending,
        paymentPending: s.paymentPending,
        sales: s.sales,
      }))
      .sort((a, b) => b.sales - a.sales);

    const meetingPerformance = allStaff
      .filter((s) => s.role === "meeting")
      .map((s) => ({
        userId: s.userId,
        userName: s.userName,
        newLeads: s.newLeads,
        callBack: s.callBack,
        notAnswering: s.notAnswering,
        meetingScheduled: s.meetingScheduled,
        documentPending: s.documentPending,
        paymentPending: s.paymentPending,
        sales: s.sales,
      }))
      .sort((a, b) => b.sales - a.sales);

    const employeeLeaderboard = allStaff
      .filter((s) => s.role === "employee")
      .map((s) => ({
        userId: s.userId,
        userName: s.userName,
        leads: s.leadsAssignedCount,
        sales: s.sales,
        successPercent: pct(s.sales, s.leadsAssignedCount),
      }))
      .sort((a, b) => b.sales - a.sales || b.successPercent - a.successPercent)
      .map((row, idx) => ({ rank: idx + 1, ...row }));

    const meetingLeaderboard = allStaff
      .filter((s) => s.role === "meeting")
      .map((s) => ({
        userId: s.userId,
        userName: s.userName,
        meetings: s.meetingsAssignedCount,
        sales: s.sales,
        successPercent: pct(s.sales, s.meetingsAssignedCount),
      }))
      .sort((a, b) => b.sales - a.sales || b.successPercent - a.successPercent)
      .map((row, idx) => ({ rank: idx + 1, ...row }));

    return NextResponse.json({
      date: validDate || null,
      month: validMonth || null,
      filtered: !!cohortWindow,
      totalInDb: allLeads.length,
      statusDistribution,
      employeePerformance,
      meetingPerformance,
      metrics: {
        totalLeads,
        newLeads,
        inProgress,
        meetingsScheduled: meetingsScheduledCount,
        sales: salesCount,
        lost: lostCount,
        meetingEfficiency,
        conversionRate,
        dropRate,
      },
      employeeLeaderboard,
      meetingLeaderboard,
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}