/**
 * GET /api/attendance/my
 *
 * Returns the current user's own attendance records, paginated newest-first.
 *
 * Query params:
 *  ?month=2026-08        — filter to a specific month (YYYY-MM). Defaults to current month.
 *  ?page=1               — page number (1-indexed). Defaults to 1.
 *  ?limit=31             — records per page. Defaults to 31 (max days in a month).
 *
 * Response includes a `summary` object with counts per status for the selected month.
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

    const { searchParams } = new URL(req.url);

    const defaultMonth = todayIST().slice(0, 7);
    const month = searchParams.get("month");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const statusParam = searchParams.get("status");

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "31", 10)));
    const skip = (page - 1) * limit;

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    // Build filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { userId: payload.id };

    const today = todayIST();
    let dFrom = dateFrom;
    let dTo = dateTo;
    if (dFrom && dTo && dFrom > dTo) {
      const temp = dFrom;
      dFrom = dTo;
      dTo = temp;
    }

    if (dFrom || dTo) {
      filter.date = {};
      if (dFrom) filter.date.$gte = dFrom;
      if (dTo) filter.date.$lte = dTo > today ? today : dTo;
    } else if (month) {
      filter.date = { $regex: `^${month}` };
    } else {
      filter.date = { $regex: `^${defaultMonth}` };
    }

    if (statusParam && ATTENDANCE_STATUSES.includes(statusParam as AttendanceStatus)) {
      filter.status = statusParam;
    }

    const [records, total] = await Promise.all([
      db
        .collection(ATTENDANCE_COLLECTION)
        .find(filter, { projection: { _id: 0 } })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(ATTENDANCE_COLLECTION).countDocuments(filter),
    ]);

    // Build summary counts for the current filter
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

    return NextResponse.json({
      records,
      summary,
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
