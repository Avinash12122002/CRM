import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (payload.role !== "admin")
      return NextResponse.json(
        { error: "Access denied. Admin access only." },
        { status: 403 },
      );

    const { db } = await connectToDatabase();

    // ── Date range helpers ──────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().split("T")[0]; // "YYYY-MM-DD"

    // ═══════════════════════════════════════════════════════════════════════
    // 1. EMPLOYEES ONLINE RIGHT NOW
    // ═══════════════════════════════════════════════════════════════════════
    const employeesOnline = await db.collection("activities").countDocuments({
      checkIn:  { $gte: today, $lt: tomorrow },
      checkOut: null,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 2. LEADS CREATED TODAY
    // ═══════════════════════════════════════════════════════════════════════
    const leadsCreatedToday = await db.collection("leads").countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. LEADS WORKED TODAY
    //    Unique leads with at least one note_added history entry today.
    // ═══════════════════════════════════════════════════════════════════════
    const leadsWorkedTodayResult = await db
      .collection("leads")
      .aggregate([
        {
          $match: {
            history: {
              $elemMatch: {
                action:    "note_added",
                timestamp: { $gte: today, $lt: tomorrow },
              },
            },
          },
        },
        { $count: "count" },
      ])
      .toArray();

    const leadsWorkedToday = leadsWorkedTodayResult[0]?.count || 0;

    // ═══════════════════════════════════════════════════════════════════════
    // 4. ASSIGNED VS UNASSIGNED LEADS
    //    Assigned = currently held by an employee or meeting user.
    // ═══════════════════════════════════════════════════════════════════════
    const assignedLeadsResult = await db
      .collection("leads")
      .aggregate([
        { $match: { assignedTo: { $ne: null, $exists: true } } },
        {
          $lookup: {
            from:         "users",
            localField:   "assignedTo",
            foreignField: "id",
            as:           "assignedUser",
          },
        },
        { $unwind: "$assignedUser" },
        { $match: { "assignedUser.role": { $in: ["employee", "meeting"] } } },
        { $count: "count" },
      ])
      .toArray();

    const assignedLeads   = assignedLeadsResult[0]?.count || 0;
    const unassignedLeads = await db.collection("leads").countDocuments({
      $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 5. MEETINGS
    // ═══════════════════════════════════════════════════════════════════════
    const totalMeetings = await db
      .collection("meetingSlots")
      .countDocuments({ status: "scheduled" });

    const todayMeetings = await db
      .collection("meetingSlots")
      .countDocuments({ meetingDate: todayStr, status: "scheduled" });

    // ═══════════════════════════════════════════════════════════════════════
    // 6. LEAD STATUS BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════
    const statusBreakdownRaw = await db
      .collection("leads")
      .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray();

    const statusBreakdown: Record<string, number> = {
      "new-lead":         0,
      "call-back":        0,
      "not-answering":    0,
      "meeting-scheduled":0,
      "not-interested":   0,
      "wrong-number":     0,
      "document-pending": 0,
      "payment-pending":  0,
      sales:              0,
    };

    statusBreakdownRaw.forEach((item) => {
      if (item._id in statusBreakdown) {
        statusBreakdown[item._id as keyof typeof statusBreakdown] = item.count;
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 7. EMPLOYEE PERFORMANCE
    //
    //  TWO COMPLETELY SEPARATE COUNTERS — never mixed:
    //
    //  totalLeads  = leads CURRENTLY assigned to the user (Step B)
    //                status !== "sales" only
    //                increases when admin assigns a lead to them
    //                does NOT change when a sale happens
    //
    //  sales       = number of leads this user personally converted to sale (Step C)
    //                ONLY increments when lead.status === "sales"
    //                ONLY increments for the person who performed the
    //                status_updated → "sales" action in history
    //                OR for bookedBy / meetingUserId if a meeting was involved
    //                creating a lead NEVER touches this counter
    //
    //  SALES ATTRIBUTION RULES:
    //
    //  Case A — lead went through a meeting (meetingDetails present):
    //    meetingDetails.bookedBy      → +1 sales (employee who booked)
    //    meetingDetails.meetingUserId → +1 sales (meeting user who ran it)
    //    Same person for both         → only +1 (Set dedup, never +2)
    //
    //  Case B — direct sale, no meeting (meetingDetails absent/empty):
    //    Scan lead.history in reverse for the LAST entry where:
    //      action === "status_updated" AND newStatus === "sales"
    //    The performedBy of that entry gets +1 sales.
    //    If performedBy is admin → staffMap.get() returns undefined → skipped
    //    Creating a lead does NOT trigger this — only changing status does.
    // ═══════════════════════════════════════════════════════════════════════

    // ── Step A: seed map from ALL employee & meeting users ─────────────────
    const allStaffRaw = await db
      .collection("users")
      .find({ role: { $in: ["employee", "meeting"] } })
      .toArray();

    type StaffEntry = {
      employeeId:        number | string;
      employeeName:      string;
      employeeUsername:  string;
      userRole:          string;
      totalLeads:        number; // currently assigned non-sales leads ONLY
      newLeads:          number;
      callBack:          number;
      notAnswering:      number;
      meetingScheduled:  number;
      scheduledMeetings: number;
      notInterested:     number;
      wrongNumber:       number;
      documentPending:   number;
      paymentPending:    number;
      sales:             number; // only increments via Step C attribution
    };

    const staffMap = new Map<string, StaffEntry>();
    for (const u of allStaffRaw) {
      staffMap.set(String(u.id), {
        employeeId:        u.id,
        employeeName:      u.name     || "",
        employeeUsername:  u.username || "",
        userRole:          u.role,
        totalLeads:        0,
        newLeads:          0,
        callBack:          0,
        notAnswering:      0,
        meetingScheduled:  0,
        scheduledMeetings: 0,
        notInterested:     0,
        wrongNumber:       0,
        documentPending:   0,
        paymentPending:    0,
        sales:             0,
      });
    }

    // ── Step B: current non-sales workload per user ────────────────────────
    //  IMPORTANT: status: { $ne: "sales" } ensures that changing a lead to
    //  "sales" does NOT increase totalLeads. totalLeads only reflects the
    //  live active workload (leads still being worked on).
    const currentAssignmentStats = await db
      .collection("leads")
      .aggregate([
        {
          $match: {
            assignedTo: { $ne: null, $exists: true },
            status:     { $ne: "sales" }, // ← sales NEVER counted in totalLeads
          },
        },
        {
          $lookup: {
            from:         "users",
            localField:   "assignedTo",
            foreignField: "id",
            as:           "assignedUser",
          },
        },
        { $unwind: "$assignedUser" },
        {
          $match: {
            "assignedUser.role": { $in: ["employee", "meeting"] },
          },
        },
        {
          $group: {
            _id:               "$assignedTo",
            totalLeads:        { $sum: 1 },
            scheduledMeetings: { $sum: { $cond: [{ $eq: ["$meetingStatus",  "scheduled"]         }, 1, 0] } },
            newLeads:          { $sum: { $cond: [{ $eq: ["$status", "new-lead"]          }, 1, 0] } },
            callBack:          { $sum: { $cond: [{ $eq: ["$status", "call-back"]         }, 1, 0] } },
            notAnswering:      { $sum: { $cond: [{ $eq: ["$status", "not-answering"]     }, 1, 0] } },
            meetingScheduled:  { $sum: { $cond: [{ $eq: ["$status", "meeting-scheduled"] }, 1, 0] } },
            notInterested:     { $sum: { $cond: [{ $eq: ["$status", "not-interested"]    }, 1, 0] } },
            wrongNumber:       { $sum: { $cond: [{ $eq: ["$status", "wrong-number"]      }, 1, 0] } },
            documentPending:   { $sum: { $cond: [{ $eq: ["$status", "document-pending"]  }, 1, 0] } },
            paymentPending:    { $sum: { $cond: [{ $eq: ["$status", "payment-pending"]   }, 1, 0] } },
          },
        },
        { $sort: { totalLeads: -1 } },
      ])
      .toArray();

    // Merge Step B into staffMap
    for (const row of currentAssignmentStats) {
      const entry = staffMap.get(String(row._id));
      if (entry) {
        entry.totalLeads        = row.totalLeads        ?? 0;
        entry.scheduledMeetings = row.scheduledMeetings ?? 0;
        entry.newLeads          = row.newLeads          ?? 0;
        entry.callBack          = row.callBack          ?? 0;
        entry.notAnswering      = row.notAnswering      ?? 0;
        entry.meetingScheduled  = row.meetingScheduled  ?? 0;
        entry.notInterested     = row.notInterested     ?? 0;
        entry.wrongNumber       = row.wrongNumber       ?? 0;
        entry.documentPending   = row.documentPending   ?? 0;
        entry.paymentPending    = row.paymentPending    ?? 0;
      }
    }

    // ── Step C: attribute sales credit ─────────────────────────────────────
    //  Fetch all leads with status="sales".
    //  Only entry.sales is touched here — totalLeads is NEVER modified.
    //  This guarantees: creating a lead → no sales increase.
    //  Only performing the action of changing status to "sales" increases it.
    const salesLeads = await db
      .collection("leads")
      .find({ status: "sales" })
      .toArray();

    for (const lead of salesLeads) {
      const bookedBy      = lead.meetingDetails?.bookedBy      != null
        ? String(lead.meetingDetails.bookedBy)      : null;
      const meetingUserId = lead.meetingDetails?.meetingUserId != null
        ? String(lead.meetingDetails.meetingUserId) : null;

      const hasMeetingData = !!(bookedBy || meetingUserId);

      if (hasMeetingData) {
        // ── Case A: went through a meeting ──────────────────────────────
        // bookedBy and meetingUserId each get +1 sales.
        // If they are the same person the Set prevents double counting.
        const credited = new Set<string>();

        if (bookedBy) {
          const entry = staffMap.get(bookedBy);
          if (entry && !credited.has(bookedBy)) {
            entry.sales += 1; // ← ONLY sales, never totalLeads
            credited.add(bookedBy);
          }
        }

        if (meetingUserId && !credited.has(meetingUserId)) {
          const entry = staffMap.get(meetingUserId);
          if (entry) {
            entry.sales += 1; // ← ONLY sales, never totalLeads
            credited.add(meetingUserId);
          }
        }
      } else {
        // ── Case B: direct sale — no meeting was involved ───────────────
        // Find the LAST history entry where:
        //   action === "status_updated"  AND  newStatus === "sales"
        // That is the exact moment someone changed the status to sales.
        // The performedBy of that entry is the only person who gets credit.
        //
        // This means:
        //  ✓ Employee changes status → employee +1 sales
        //  ✓ Admin changes status   → no employee credit (admin not in staffMap)
        //  ✗ Creating a lead        → never matches this condition at all
        const history: Array<{
          action:           string;
          newStatus?:       string;
          performedBy?:     number | string;
          performedByRole?: string;
        }> = Array.isArray(lead.history) ? lead.history : [];

        let salesPerformedBy: string | null = null;

        // Scan backwards — use the most recent status→sales change
        for (let i = history.length - 1; i >= 0; i--) {
          const h = history[i];
          if (
            h.action    === "status_updated" &&
            h.newStatus === "sales"          &&
            h.performedBy != null
          ) {
            salesPerformedBy = String(h.performedBy);
            break;
          }
        }

        if (salesPerformedBy) {
          const entry = staffMap.get(salesPerformedBy);
          if (entry) {
            // staffMap only contains employee/meeting users.
            // If performedBy is admin, get() returns undefined → skipped.
            entry.sales += 1; // ← ONLY sales, never totalLeads
          }
        }
        // No history match (legacy data) → no credit, no crash.
      }
    }

    // ── Step D: map → sorted array ─────────────────────────────────────────
    const employeePerformance = Array.from(staffMap.values()).sort(
      (a, b) => b.totalLeads - a.totalLeads,
    );

    // ═══════════════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════════════
    return NextResponse.json({
      employeesOnline,
      leadsCreatedToday,
      leadsWorkedToday,
      assignedLeads,
      unassignedLeads,
      totalMeetings,
      todayMeetings,
      employeePerformance,
      statusBreakdown,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin statistics" },
      { status: 500 },
    );
  }
}