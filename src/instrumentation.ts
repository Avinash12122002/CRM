/**
 * Next.js Instrumentation Hook — runs once on server startup (Node.js runtime only).
 *
 * Schedules a nightly cron job that auto-marks absent every non-admin user
 * who has no attendance record for past days that have ended.
 *
 * Schedule: 00:00 IST every day   →  cron expression "0 0 * * *" in IST
 *           = "30 18 * * *" in UTC  (IST is UTC+5:30)
 *
 * node-cron interprets the expression in the timezone supplied via the
 * `timezone` option, so we pass "Asia/Kolkata" and use the plain
 * midnight expression "0 0 * * *".
 *
 * The job calls autoMarkMissingDays to ensure self-healing and catch up any
 * missed days even if the server was restarted or temporarily offline.
 */

export async function register() {
  // Only run in the Node.js runtime, not in the Edge runtime or during
  // client-side bundling.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { default: cron } = await import("node-cron");
  const { connectToDatabase } = await import("@/lib/mongodb");
  const { ensureAttendanceIndexes, autoMarkMissingDays } = await import(
    "@/lib/attendance/helpers"
  );

  // Catch-up run on server startup (non-blocking)
  (async () => {
    try {
      const { db } = await connectToDatabase();
      await ensureAttendanceIndexes(db);
      const marked = await autoMarkMissingDays(db, 7);
      if (marked > 0) {
        console.log(`[attendance-startup] Auto-marked ${marked} missing absent record(s).`);
      }
    } catch (err) {
      console.error("[attendance-startup] Catch-up check failed:", err);
    }
  })();

  // Fires every day at 00:00 IST (midnight India time)
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        console.log("[attendance-cron] Starting nightly absent-marking job…");
        const { db } = await connectToDatabase();
        await ensureAttendanceIndexes(db);
        const marked = await autoMarkMissingDays(db, 3);
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
