import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { role } = payload;

    // Only admins should access this endpoint
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Access denied. Admin access only." },
        { status: 403 },
      );
    }

    const { db } = await connectToDatabase();

    // Get current date range for "today"
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Get employees online right now (checked in today and not checked out)
    const onlineUsers = await db.collection("activities").countDocuments({
      checkIn: { $gte: today, $lt: tomorrow },
      checkOut: null,
    });

    // 2. Get leads created today
    const leadsCreatedToday = await db.collection("leads").countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
    });

    // 3. Get leads worked on today (leads with notes added today - count each lead once)
    const leadsWorkedToday = await db
      .collection("leads")
      .aggregate([
        {
          $match: {
            "history.action": "note_added",
            "history.timestamp": { $gte: today, $lt: tomorrow },
          },
        },
        {
          $count: "count",
        },
      ])
      .toArray();

    const leadsWorkedTodayCount = leadsWorkedToday[0]?.count || 0;

    // 4. Get leads assigned vs unassigned (only count employee-assigned leads)
    const assignedLeads = await db
      .collection("leads")
      .aggregate([
        {
          $match: {
            assignedTo: { $ne: null, $exists: true },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "assignedTo",
            foreignField: "id",
            as: "assignedUser",
          },
        },
        {
          $unwind: "$assignedUser",
        },
        {
          $match: {
            "assignedUser.role": {
              $in: ["employee", "meeting"],
            },
          },
        },
        {
          $count: "count",
        },
      ])
      .toArray();

    const assignedLeadsCount = assignedLeads[0]?.count || 0;

    const unassignedLeads = await db.collection("leads").countDocuments({
      $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
    });

    // 4. // Get employee & meeting performance metrics
    const employeePerformance = await db
      .collection("leads")
      .aggregate([
        {
          $match: {
            assignedTo: { $ne: null, $exists: true },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "assignedTo",
            foreignField: "id",
            as: "user",
          },
        },
        {
          $unwind: "$user",
        },
        {
          $match: {
            "user.role": {
              $in: ["employee", "meeting"],
            },
          },
        },
        {
          $group: {
            _id: "$assignedTo",
            employeeName: { $first: "$user.name" },
            employeeUsername: { $first: "$user.username" },
            userRole: { $first: "$user.role" },
            totalLeads: { $sum: 1 },

            newLeads: {
              $sum: { $cond: [{ $eq: ["$status", "new-lead"] }, 1, 0] },
            },

            callBack: {
              $sum: { $cond: [{ $eq: ["$status", "call-back"] }, 1, 0] },
            },

            notAnswering: {
              $sum: { $cond: [{ $eq: ["$status", "not-answering"] }, 1, 0] },
            },

            meetingScheduled: {
              $sum: {
                $cond: [{ $eq: ["$status", "meeting-scheduled"] }, 1, 0],
              },
            },

            notInterested: {
              $sum: { $cond: [{ $eq: ["$status", "not-interested"] }, 1, 0] },
            },

            wrongNumber: {
              $sum: { $cond: [{ $eq: ["$status", "wrong-number"] }, 1, 0] },
            },

            documentPending: {
              $sum: { $cond: [{ $eq: ["$status", "document-pending"] }, 1, 0] },
            },

            paymentPending: {
              $sum: { $cond: [{ $eq: ["$status", "payment-pending"] }, 1, 0] },
            },

            sales: {
              $sum: { $cond: [{ $eq: ["$status", "sales"] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            employeeId: "$_id",
            employeeName: 1,
            employeeUsername: 1,
            userRole: 1,
            totalLeads: 1,

            newLeads: 1,
            callBack: 1,
            notAnswering: 1,
            meetingScheduled: 1,
            notInterested: 1,
            wrongNumber: 1,
            documentPending: 1,
            paymentPending: 1,
            sales: 1,
          },
        },
        {
          $sort: { totalLeads: -1 },
        },
      ])
      .toArray();

    // 5. Get lead status breakdown
    const statusBreakdown = await db
      .collection("leads")
      .aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const statusMap = {
      "new-lead": 0,
      "call-back": 0,
      "not-answering": 0,
      "meeting-scheduled": 0,
      "not-interested": 0,
      "wrong-number": 0,
      "document-pending": 0,
      "payment-pending": 0,
      sales: 0,
    };

    statusBreakdown.forEach((item) => {
      if (item._id in statusMap) {
        statusMap[item._id as keyof typeof statusMap] = item.count;
      }
    });

    return NextResponse.json({
      employeesOnline: onlineUsers || 0,
      leadsCreatedToday,
      leadsWorkedToday: leadsWorkedTodayCount,
      assignedLeads: assignedLeadsCount,
      unassignedLeads,
      employeePerformance,
      statusBreakdown: statusMap,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin statistics" },
      { status: 500 },
    );
  }
}
