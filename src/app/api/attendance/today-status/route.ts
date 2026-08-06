/**
 * GET /api/attendance/today-status
 *
 * Returns the current user's attendance record for today (IST).
 * Returns { record: null } if they haven't marked yet.
 * Used by AttendanceStatusCard on the main dashboard.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { todayIST, ensureAttendanceIndexes } from "@/lib/attendance/helpers";
import { ATTENDANCE_COLLECTION } from "@/lib/attendance/constants";

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

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    const today = todayIST();

    const record = await db
      .collection(ATTENDANCE_COLLECTION)
      .findOne({ userId: payload.id, date: today }, { projection: { _id: 0 } });

    return NextResponse.json({ record: record ?? null, today });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
