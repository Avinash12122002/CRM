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
 * Keeps a single pointer document in bdconfig so distribution is even
 * and survives restarts/deploys.
 */
export async function pickNextBDUser(db: Db) {
  const bdUsers = await db
    .collection("users")
    .find({ role: BD_ROLE })
    .project({ id: 1, name: 1 })
    .sort({ id: 1 })
    .toArray();

  if (!bdUsers.length) return null;

  const configDoc = await db
    .collection(BD_COLLECTIONS.config)
    .findOne({ _id: "bd_round_robin" } as never);

  const lastId = configDoc?.lastAssignedUserId;
  let nextIndex = 0;

  if (lastId !== undefined && lastId !== null) {
    const lastIndex = bdUsers.findIndex((u) => u.id === lastId);
    nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % bdUsers.length;
  }

  const nextUser = bdUsers[nextIndex];

  await db.collection(BD_COLLECTIONS.config).updateOne(
    { _id: "bd_round_robin" } as never,
    { $set: { lastAssignedUserId: nextUser.id, updatedAt: new Date() } },
    { upsert: true }
  );

  return nextUser as { id: number; name: string };
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
