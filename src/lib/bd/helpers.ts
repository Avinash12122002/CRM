import type { NextRequest } from "next/server";
import type { Db } from "mongodb";
import { verifyToken, getNextId } from "@/lib/auth";
import { BD_COLLECTIONS, BD_ROLE } from "./constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAuthPayload(req: NextRequest): Record<string, any> | null {
  const cookie = req.headers.get("cookie") || "";
  const matches = cookie.match(/(^|; )token=([^;]+)/);
  const token = matches ? matches[2] : null;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Round-robin picker for Business Development users.
 *
 * Keeps a single pointer document in bdconfig so distribution is even and
 * survives restarts/deploys. The pointer is advanced with an atomic
 * findOneAndUpdate $inc (same pattern as getNextId) so two leads submitted at
 * the exact same instant each read a distinct sequence value and land on
 * different BD users instead of colliding on the same one.
 */
export async function pickNextBDUser(db: Db) {
  const bdUsers = await db
    .collection("users")
    .find({ role: BD_ROLE })
    .project({ id: 1, name: 1 })
    .sort({ id: 1 })
    .toArray();

  if (!bdUsers.length) return null;

  // Atomically claim the next sequence number. Concurrent callers can never
  // observe the same value, which closes the previous read-then-write race.
  const result = await db.collection(BD_COLLECTIONS.config).findOneAndUpdate(
    { _id: "bd_round_robin" } as never,
    { $inc: { assignSeq: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: "after" }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (result?.value ?? result) as any;
  const seq: number = doc?.assignSeq ?? 1;
  const index = (seq - 1) % bdUsers.length;
  const nextUser = bdUsers[index];

  // Keep lastAssignedUserId around purely for observability/debugging.
  await db.collection(BD_COLLECTIONS.config).updateOne(
    { _id: "bd_round_robin" } as never,
    { $set: { lastAssignedUserId: nextUser.id } }
  );

  return nextUser as { id: number; name: string };
}

/**
 * Resolve a real Admin account to receive ownership of a lead once it closes
 * (Deal Done / Lead Lost). Returns the lowest-id admin so ownership transfer
 * is deterministic, or null if no admin exists (caller then leaves the lead
 * with its current owner rather than pointing assignedTo at a missing user).
 */
export async function getAdminUser(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _payload?: Record<string, any>
): Promise<{ id: number; name: string } | null> {
  const admin = await db
    .collection("users")
    .find({ role: "admin" })
    .project({ id: 1, name: 1 })
    .sort({ id: 1 })
    .limit(1)
    .toArray();

  if (!admin.length) return null;
  return { id: admin[0].id, name: admin[0].name };
}

/**
 * Every admin account (used to fan out notifications so a newly created BD
 * lead is visible to all admins, not just one).
 */
export async function getAllAdmins(db: Db) {
  return db
    .collection("users")
    .find({ role: "admin" })
    .project({ id: 1, name: 1 })
    .toArray() as Promise<{ id: number; name: string }[]>;
}

interface LogActivityParams {
  db: Db;
  leadId: number;
  action: string;
  userId: number;
  userName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previousValue?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newValue?: any;
}

export async function logBDActivity({
  db,
  leadId,
  action,
  userId,
  userName,
  previousValue = null,
  newValue = null,
}: LogActivityParams) {
  const id = await getNextId(db, BD_COLLECTIONS.activityLogs);
  await db.collection(BD_COLLECTIONS.activityLogs).insertOne({
    id,
    leadId,
    action,
    userId,
    userName,
    previousValue,
    newValue,
    createdAt: new Date(),
  });
}

// Date-only string in Asia/Kolkata, e.g. "2026-07-22"
export function todayDateStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
