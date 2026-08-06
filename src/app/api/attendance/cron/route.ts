/**
 * GET /api/attendance/cron
 *
 * Auto-marks every user without a record for today (IST) as "absent".
 * Protected by CRON_SECRET env var — call with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * For Hostinger deployments, trigger this from an external cron service
 * (e.g. cron-job.org, free) at 18:30 UTC (= 00:00 IST) daily.
 *
 * Idempotent: $setOnInsert means calling it multiple times never overwrites
 * an existing record — safe to retry on failure.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ensureAttendanceIndexes, autoMarkAbsentees } from "@/lib/attendance/helpers";

export async function GET(req: NextRequest) {
  try {
    // Auth guard — require CRON_SECRET in Authorization header
    const authHeader = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
    }

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    const inserted = await autoMarkAbsentees(db);

    return NextResponse.json({
      message: "Cron completed",
      absentMarked: inserted,
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
