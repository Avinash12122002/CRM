/**
 * Next.js Instrumentation Hook — runs once on server startup (Node.js runtime only).
 *
 * Schedules a nightly cron job that auto-marks absent every non-admin user
 * who has no attendance record for the day that just ended.
 *
 * Schedule: 00:00 IST every day   →  cron expression "0 0 * * *" in IST
 *           = "30 18 * * *" in UTC  (IST is UTC+5:30)
 *
 * node-cron interprets the expression in the timezone supplied via the
 * `timezone` option, so we pass "Asia/Kolkata" and use the plain
 * midnight expression "0 0 * * *".
 *
 * The job calls the same helper used by the manual /api/attendance/cron
 * endpoint, so behaviour is identical and idempotent ($setOnInsert ensures
 * running it twice never overwrites an existing attendance record).
 */

export async function register() {
  // Only run in the Node.js runtime, not in the Edge runtime or during
  // client-side bundling.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { default: cron } = await import("node-cron");
  const { connectToDatabase } = await import("@/lib/mongodb");
  const { ensureAttendanceIndexes, autoMarkAbsentees } = await import(
    "@/lib/attendance/helpers"
  );

  // Fires every day at 00:00 IST (midnight India time)
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        console.log("[attendance-cron] Starting nightly absent-marking job…");
        const { db } = await connectToDatabase();
        await ensureAttendanceIndexes(db);
        const marked = await autoMarkAbsentees(db);
        console.log(
          `[attendance-cron] Done — marked ${marked} user(s) absent.`
        );
      } catch (err) {
        console.error("[attendance-cron] Job failed:", err);
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log(
    "[attendance-cron] Scheduled: fires every night at 00:00 IST (Asia/Kolkata)."
  );
}
