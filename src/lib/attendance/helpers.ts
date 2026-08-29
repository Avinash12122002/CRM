/**
 * Attendance Module — Helpers
 *
 * Provides:
 *  - todayIST()                          — "YYYY-MM-DD" in Asia/Kolkata (matches IST_OFFSET_MS convention)
 *  - yesterdayIST()                      — "YYYY-MM-DD" in Asia/Kolkata for the day that just ended
 *  - dateToISTString(date)               — Converts a Date object to "YYYY-MM-DD" in Asia/Kolkata
 *  - getDatesBetween(startDate, endDate) — Array of "YYYY-MM-DD" strings between start and end inclusive
 *  - ensureAttendanceIndexes(db)         — lazy, once-per-warm-instance index bootstrap
 *  - autoMarkAbsenteesForDate(db, date)  — inserts absent for all non-admin users missing a record for a specific past date
 *  - autoMarkAbsentees(db, targetDate?)  — inserts absent for every user missing targetDate (defaults to yesterday)
 *  - autoMarkMissingDays(db, daysBack?)  — catches up missing absent records across the last N days up to yesterday
 *  - ensureUserAttendanceForPastDays()   — ensures a specific user has absent records for any past dates they missed
 *
 * IST date calculation matches the exact same IST_OFFSET_MS arithmetic already
 * used throughout this codebase (e.g. src/app/api/activity/checkin/route.ts).
 *
 * NOTE: We do NOT use getNextId() from @/lib/auth here.
 * auth.ts checks `result.value` which is undefined on MongoDB driver v5+
 * (installed version: ^5.9.0). Instead we use an inline findOneAndUpdate
 * that reads the result directly.
 */

import type { Db } from "mongodb";
import { ATTENDANCE_COLLECTION } from "./constants";

// ── Timezone helpers ─────────────────────────────────────────────────────────

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 5h 30m in ms

/**
 * Returns today's date string in "YYYY-MM-DD" format using Asia/Kolkata timezone.
 * Uses the same IST_OFFSET_MS arithmetic as src/app/api/activity/checkin/route.ts
 * to avoid midnight drift from UTC.
 */
export function todayIST(): string {
  const now = new Date();
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = String(nowIST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns yesterday's date string in "YYYY-MM-DD" format (IST).
 * Used by the midnight cron — when the cron fires at 00:00 IST the "new day"
 * has already started, so absent records must be written for the day that
 * just ended (i.e. yesterday IST).
 */
export function yesterdayIST(): string {
  const now = new Date();
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const yest = new Date(nowIST.getTime() - 24 * 60 * 60 * 1000);
  const y = yest.getUTCFullYear();
  const m = String(yest.getUTCMonth() + 1).padStart(2, "0");
  const d = String(yest.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Converts any Date object to "YYYY-MM-DD" in IST.
 */
export function dateToISTString(date: Date): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(istDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns array of "YYYY-MM-DD" strings between start and end (inclusive).
 */
export function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (curr <= end) {
    const y = curr.getUTCFullYear();
    const m = String(curr.getUTCMonth() + 1).padStart(2, "0");
    const d = String(curr.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
}

// ── Index bootstrap ──────────────────────────────────────────────────────────

let indexEnsured = false;

/**
 * Lazily creates attendance collection indexes — runs once per warm serverless
 * instance (same pattern used in src/lib/mongodb.ts for other collections).
 *
 * The unique compound index on {userId, date} makes double-marking impossible
 * even under race conditions at the DB level.
 */
export async function ensureAttendanceIndexes(db: Db): Promise<void> {
  if (indexEnsured) return;
  indexEnsured = true;
  await Promise.all([
    db
      .collection(ATTENDANCE_COLLECTION)
      .createIndex({ userId: 1, date: 1 }, { unique: true }),
    db.collection(ATTENDANCE_COLLECTION).createIndex({ date: 1 }),
    db.collection(ATTENDANCE_COLLECTION).createIndex({ userId: 1 }),
    db.collection(ATTENDANCE_COLLECTION).createIndex({ status: 1 }),
  ]).catch((err) =>
    console.error("[attendance] Index creation error:", err)
  );
}

// ── Auto-absent core logic ───────────────────────────────────────────────────

/**
 * Marks absent for all active non-admin users who have no attendance record
 * for a specific past date. Never marks for today or future dates.
 *
 * Fully idempotent using { userId, date } upsert with $setOnInsert.
 */
export async function autoMarkAbsenteesForDate(db: Db, date: string): Promise<number> {
  const today = todayIST();
  // Never auto-mark absent for today or future dates (today's shift is ongoing)
  if (date >= today) return 0;

  const now = new Date();

  // Load all non-admin users
  const users = await db
    .collection("users")
    .find({ role: { $ne: "admin" } })
    .project({ id: 1, name: 1, role: 1, createdAt: 1 })
    .toArray();

  if (users.length === 0) return 0;

  // Find existing attendance records for this date
  const existing = await db
    .collection(ATTENDANCE_COLLECTION)
    .find({ date })
    .project({ userId: 1 })
    .toArray();

  const markedUserIds = new Set(existing.map((r) => r.userId as number));

  // Filter to users missing this date who were created on or before this date
  const missingUsers = users.filter((u) => {
    const uid = u.id as number;
    if (markedUserIds.has(uid)) return false;
    if (u.createdAt) {
      const createdStr = dateToISTString(new Date(u.createdAt));
      if (createdStr > date) return false;
    }
    return true;
  });

  if (missingUsers.length === 0) return 0;

  // Allocate auto-increment IDs atomically
  const count = missingUsers.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counterResult: any = await db.collection("counters").findOneAndUpdate(
    { _id: ATTENDANCE_COLLECTION } as never,
    { $inc: { seq: count } },
    { upsert: true, returnDocument: "after" }
  );
  const counterDoc = counterResult?.value ?? counterResult;
  if (!counterDoc || counterDoc.seq === undefined) {
    throw new Error("[attendance] Failed to generate ID from counters");
  }
  const endSeq = counterDoc.seq as number;
  const startSeq = endSeq - count + 1;

  const ops = missingUsers.map((user, idx) => ({
    updateOne: {
      filter: { userId: user.id as number, date },
      update: {
        $setOnInsert: {
          id: startSeq + idx,
          userId: user.id as number,
          userName: (user.name as string) || "Unknown",
          role: (user.role as string) || "unknown",
          date,
          status: "absent",
          markedBy: "system",
          checkInTime: null,
          note: "Auto-marked absent by system",
          createdAt: now,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  }));

  const res = await db.collection(ATTENDANCE_COLLECTION).bulkWrite(ops, { ordered: false });
  return res.upsertedCount;
}

/**
 * Called by cron or manual triggers.
 * Defaults to yesterdayIST() if targetDate is omitted.
 */
export async function autoMarkAbsentees(db: Db, targetDate?: string): Promise<number> {
  const date = targetDate || yesterdayIST();
  return autoMarkAbsenteesForDate(db, date);
}

/**
 * Iterates through the last `daysBack` days up to yesterday and ensures
 * absent records are marked for any user missing a record.
 * Self-healing: handles cases where cron failed or server was down.
 */
export async function autoMarkMissingDays(db: Db, daysBack = 7): Promise<number> {
  const yesterday = yesterdayIST();
  const now = new Date();
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const startObj = new Date(nowIST.getTime() - (daysBack + 1) * 24 * 60 * 60 * 1000);
  const y = startObj.getUTCFullYear();
  const m = String(startObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startObj.getUTCDate()).padStart(2, "0");
  const startDate = `${y}-${m}-${d}`;

  const dates = getDatesBetween(startDate, yesterday);
  let totalMarked = 0;
  for (const dt of dates) {
    try {
      totalMarked += await autoMarkAbsenteesForDate(db, dt);
    } catch (err) {
      console.error(`[attendance] Failed autoMarkAbsenteesForDate for ${dt}:`, err);
    }
  }
  return totalMarked;
}

/**
 * Ensures a single user has absent records for any past days they missed
 * within a date range (up to yesterday).
 * Used by /api/attendance/my when an employee loads their attendance page.
 */
export async function ensureUserAttendanceForPastDays(
  db: Db,
  userId: number,
  user: { name: string; role: string; createdAt?: Date },
  startDate?: string,
  endDate?: string
): Promise<number> {
  const yesterday = yesterdayIST();
  const effectiveEnd = endDate && endDate < yesterday ? endDate : yesterday;

  // Default to start of current month or 31 days back
  const defaultStart = yesterday.slice(0, 7) + "-01";
  const effectiveStart = startDate && startDate <= effectiveEnd ? startDate : defaultStart;

  if (effectiveStart > effectiveEnd) return 0;

  // If user was created recently, do not backfill before their registration date
  let userMinDate = effectiveStart;
  if (user.createdAt) {
    const userCreatedStr = dateToISTString(new Date(user.createdAt));
    if (userCreatedStr > userMinDate) {
      userMinDate = userCreatedStr;
    }
  }

  if (userMinDate > effectiveEnd) return 0;

  const dates = getDatesBetween(userMinDate, effectiveEnd);
  if (dates.length === 0) return 0;

  // Find existing records for this user in this range
  const existing = await db
    .collection(ATTENDANCE_COLLECTION)
    .find({
      userId,
      date: { $gte: userMinDate, $lte: effectiveEnd },
    })
    .project({ date: 1 })
    .toArray();

  const markedDates = new Set(existing.map((r) => r.date as string));
  const missingDates = dates.filter((d) => !markedDates.has(d));

  if (missingDates.length === 0) return 0;

  // Allocate IDs in batch
  const count = missingDates.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counterResult: any = await db.collection("counters").findOneAndUpdate(
    { _id: ATTENDANCE_COLLECTION } as never,
    { $inc: { seq: count } },
    { upsert: true, returnDocument: "after" }
  );
  const counterDoc = counterResult?.value ?? counterResult;
  if (!counterDoc || counterDoc.seq === undefined) {
    throw new Error("[attendance] Failed to generate ID from counters");
  }
  const endSeq = counterDoc.seq as number;
  const startSeq = endSeq - count + 1;

  const now = new Date();
  const ops = missingDates.map((d, idx) => ({
    updateOne: {
      filter: { userId, date: d },
      update: {
        $setOnInsert: {
          id: startSeq + idx,
          userId,
          userName: user.name || "Unknown",
          role: user.role || "unknown",
          date: d,
          status: "absent",
          markedBy: "system",
          checkInTime: null,
          note: "Auto-marked absent by system",
          createdAt: now,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  }));

  const res = await db.collection(ATTENDANCE_COLLECTION).bulkWrite(ops, { ordered: false });
  return res.upsertedCount;
}
