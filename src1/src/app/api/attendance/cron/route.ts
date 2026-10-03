/**
 * GET / POST /api/attendance/cron
 *
 * Auto-marks non-admin users without an attendance record as "absent" for past days.
 * Never marks for today or future dates.
 *
 * Query params / Body:
 *   ?date=YYYY-MM-DD  — mark a specific past date
 *   ?days=7           — catch up the last N days up to yesterday (default: 7)
 *
 * Auth guard:
 *   - Bearer <CRON_SECRET> in Authorization header OR
 *   - Logged-in admin session (allows manual admin trigger from dashboard)
 *
 * Idempotent: $setOnInsert means calling it multiple times never overwrites
 * an existing record — safe to retry on failure.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import {
  ensureAttendanceIndexes,
  autoMarkAbsentees,
  autoMarkMissingDays,
} from "@/lib/attendance/helpers";

async function handleCron(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET;

    // Check if called by logged in admin
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    const payload = token ? verifyToken(token) : null;
    const isAdmin = payload?.role === "admin";

    if (cronSecret && !isAdmin) {
      const authMatches = authHeader === `Bearer ${cronSecret}`;
      const querySecret = new URL(req.url).searchParams.get("secret");
      if (!authMatches && querySecret !== cronSecret) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get("date");
    const daysParam = searchParams.get("days");

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    let inserted = 0;
    if (targetDate) {
      inserted = await autoMarkAbsentees(db, targetDate);
    } else {
      const daysBack = daysParam ? Math.max(1, parseInt(daysParam, 10)) : 7;
      inserted = await autoMarkMissingDays(db, daysBack);
    }

    return NextResponse.json({
      message: "Cron completed successfully",
      absentMarked: inserted,
      date: targetDate || "recent past days",
    });
  } catch (err) {
    console.error("[attendance/cron] Error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
