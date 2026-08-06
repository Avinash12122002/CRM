/**
 * GET /api/attendance/all
 *
 * Admin-only endpoint. Returns all users' attendance records with filters.
 *
 * Query params:
 *  ?month=2026-08          — filter by month (YYYY-MM). Ignored if dateFrom/dateTo set.
 *  ?dateFrom=2026-08-01    — filter start date (YYYY-MM-DD), inclusive.
 *  ?dateTo=2026-08-31      — filter end date (YYYY-MM-DD), inclusive.
 *  ?userId=5               — filter to a specific user ID.
 *  ?status=present         — filter by attendance status.
 *  ?page=1                 — page number.
 *  ?limit=50               — records per page (max 200).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { todayIST, ensureAttendanceIndexes } from "@/lib/attendance/helpers";
import { ATTENDANCE_COLLECTION, ATTENDANCE_STATUSES } from "@/lib/attendance/constants";
import type { AttendanceStatus } from "@/lib/attendance/types";

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

    const defaultMonth = todayIST().slice(0, 7);
    const month = searchParams.get("month") || defaultMonth;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const userIdParam = searchParams.get("userId");
    const statusParam = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    // Build MongoDB filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    // Date range: prefer explicit dateFrom/dateTo; fall back to month; default to today
    let dFrom = dateFrom;
    let dTo = dateTo;
    if (dFrom && dTo && dFrom > dTo) {
      const temp = dFrom;
      dFrom = dTo;
      dTo = temp;
    }

    const today = todayIST();
    if (dFrom || dTo) {
      filter.date = {};
      if (dFrom) filter.date.$gte = dFrom;
      if (dTo) filter.date.$lte = dTo > today ? today : dTo;
    } else if (month) {
      filter.date = { $regex: `^${month}` };
    } else {
      filter.date = { $gte: today, $lte: today };
    }

    if (userIdParam) {
      filter.userId = parseInt(userIdParam, 10);
    }

    if (statusParam && ATTENDANCE_STATUSES.includes(statusParam as AttendanceStatus)) {
      filter.status = statusParam;
    }

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    const [records, total, allUsers] = await Promise.all([
      db
        .collection(ATTENDANCE_COLLECTION)
        .find(filter, { projection: { _id: 0 } })
        .sort({ date: -1, userName: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(ATTENDANCE_COLLECTION).countDocuments(filter),
      db
        .collection("users")
        .find({ role: { $ne: "admin" } })
        .project({ id: 1, name: 1, role: 1 })
        .sort({ name: 1 })
        .toArray(),
    ]);

    // Summary counts for the current filter
    const summaryAgg = await db
      .collection(ATTENDANCE_COLLECTION)
      .aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();

    const summary: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      leave: 0,
      "half-day": 0,
    };
    for (const s of summaryAgg) {
      if (ATTENDANCE_STATUSES.includes(s._id as AttendanceStatus)) {
        summary[s._id as AttendanceStatus] = s.count as number;
      }
    }

    // Today counts — for the admin "today at a glance" banner
    const todayAgg = await db
      .collection(ATTENDANCE_COLLECTION)
      .aggregate([
        { $match: { date: today } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();

    const todaySummary: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      leave: 0,
      "half-day": 0,
    };
    for (const s of todayAgg) {
      if (ATTENDANCE_STATUSES.includes(s._id as AttendanceStatus)) {
        todaySummary[s._id as AttendanceStatus] = s.count as number;
      }
    }

    return NextResponse.json({
      records,
      summary,
      todaySummary,
      users: allUsers.map((u) => ({ id: u.id, name: u.name, role: u.role })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      month,
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
