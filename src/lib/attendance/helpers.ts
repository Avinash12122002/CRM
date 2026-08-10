/**
 * Attendance Module — Helpers
 *
 * Provides:
 *  - todayIST()               — "YYYY-MM-DD" in Asia/Kolkata (matches IST_OFFSET_MS convention)
 *  - ensureAttendanceIndexes(db) — lazy, once-per-warm-instance index bootstrap
 *  - autoMarkAbsentees(db)      — inserts absent for every user missing today's record
 *
 * IST date calculation matches the exact same IST_OFFSET_MS arithmetic already
 * used throughout this codebase (e.g. src/app/api/activity/checkin/route.ts).
 *
 * NOTE: We do NOT use getNextId() from @/lib/auth here.
 * auth.ts checks `result.value` which is undefined on MongoDB driver v5+
 * (your installed version: ^5.9.0). Instead we use an inline findOneAndUpdate
 * that reads the result directly — same approach the rest of the app actually
 * relies on at runtime (billing, BD all hit the same driver behavior).
 */

import type { Db } from "mongodb";
import { ATTENDANCE_COLLECTION } from "./constants";

// ── Timezone helper ──────────────────────────────────────────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 5h 30m in ms

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
  // Subtract one day
  const yesterdayIST = new Date(nowIST.getTime() - 24 * 60 * 60 * 1000);
  const y = yesterdayIST.getUTCFullYear();
  const m = String(yesterdayIST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(yesterdayIST.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Safe ID helper (MongoDB v5 compatible) ───────────────────────────────────

/**
 * Gets the next auto-increment ID for the given collection name.
 *
 * MongoDB driver v5 returns the document directly from findOneAndUpdate
 * (not wrapped in { value: ... } as in v4). We read the result directly
 * to avoid the `!result.value` check in auth.ts which always fails on v5.
 */
async function getNextAttendanceId(db: Db): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await db.collection("counters").findOneAndUpdate(
    { _id: ATTENDANCE_COLLECTION } as never,
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  // Driver v5: result is the document directly
  // Driver v4: result is { value: document }
  const doc = result?.value ?? result;
  if (!doc || doc.seq === undefined) {
    throw new Error("[attendance] Failed to generate ID from counters");
  }
  return doc.seq as number;
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

// ── Auto-absent job ──────────────────────────────────────────────────────────

/**
 * Called by the nightly cron endpoint.
 *
 * For every active user who has NO attendance record for today, inserts an
 * "absent" record. Uses $setOnInsert inside an upsert so it is completely
 * safe to call multiple times — it will never overwrite an existing record.
 *
 * Returns the count of newly-inserted absent records.
 */
export async function autoMarkAbsentees(db: Db): Promise<number> {
  // The cron fires at 00:00 IST (midnight). At that moment the "new day" has
  // already begun in IST, so we must mark absent for the day that just ended
  // (yesterday IST), not today.
  const today = yesterdayIST();
  const now = new Date();

  // Load all non-admin users
  const users = await db
    .collection("users")
    .find({ role: { $ne: "admin" } })
    .project({ id: 1, name: 1, role: 1 })
    .toArray();

  // Find which users already have a record for today
  const existing = await db
    .collection(ATTENDANCE_COLLECTION)
    .find({ date: today })
    .project({ userId: 1 })
    .toArray();

  const markedUserIds = new Set(existing.map((r) => r.userId as number));

  let inserted = 0;
  for (const user of users) {
    const uid = user.id as number;
    if (markedUserIds.has(uid)) continue;

    try {
      const id = await getNextAttendanceId(db);
      const result = await db.collection(ATTENDANCE_COLLECTION).updateOne(
        { userId: uid, date: today },
        {
          $setOnInsert: {
            id,
            userId: uid,
            userName: user.name as string,
            role: user.role as string,
            date: today,
            status: "absent",
            markedBy: "system",
            checkInTime: null,
            note: "Auto-marked absent by system",
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      // Only count if a new document was actually inserted (upsertedCount === 1)
      if (result.upsertedCount === 1) {
        inserted++;
      }
    } catch (err) {
      // E11000 = duplicate key = already marked between query and upsert — safe to ignore
      const isdup =
        err instanceof Error && err.message.includes("E11000");
      if (!isdup) console.error(`[attendance] Failed to mark absent userId=${uid}:`, err);
    }
  }

  return inserted;
}
