/**
 * POST /api/attendance/mark
 *
 * Allows any authenticated user to mark their own attendance for today (IST).
 * Employees cannot self-mark "absent" — only present, half-day, or leave.
 * The DB unique index on {userId, date} prevents double-marking at DB level;
 * we also check first and return a clear 409 to the client.
 *
 * Pattern matches src/app/api/activity/checkin/route.ts and
 * src/app/api/billing/create/route.ts exactly.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import {
  todayIST,
  ensureAttendanceIndexes,
} from "@/lib/attendance/helpers";
import {
  ATTENDANCE_COLLECTION,
  SELF_MARK_STATUSES,
} from "@/lib/attendance/constants";
import type { AttendanceStatus } from "@/lib/attendance/types";

export async function POST(req: NextRequest) {
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

    // Validate body
    let body: { status?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const { status, note } = body;

    if (!status || !SELF_MARK_STATUSES.includes(status as AttendanceStatus)) {
      return NextResponse.json(
        {
          message: `Invalid status. Allowed values: ${SELF_MARK_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const trimmedNote = typeof note === "string" ? note.trim() : "";

    if ((status === "half-day" || status === "leave") && !trimmedNote) {
      return NextResponse.json(
        {
          message: `A reason is required when marking ${status === "leave" ? "Leave" : "Half Day"}`,
        },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    const today = todayIST();
    const now = new Date();

    // Check for existing record for today
    const existing = await db
      .collection(ATTENDANCE_COLLECTION)
      .findOne({ userId: payload.id, date: today });

    if (existing) {
      return NextResponse.json(
        {
          message: "Attendance already marked for today",
          record: existing,
        },
        { status: 409 }
      );
    }

    // Fetch user details for denormalization
    const user = await db
      .collection("users")
      .findOne({ id: payload.id }, { projection: { name: 1, role: 1 } });

    // Get next ID — inline to handle MongoDB v5 result format
    // (auth.ts getNextId checks result.value which is undefined in v5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counterResult: any = await db.collection("counters").findOneAndUpdate(
      { _id: ATTENDANCE_COLLECTION } as never,
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    const counterDoc = counterResult?.value ?? counterResult;
    if (!counterDoc || counterDoc.seq === undefined) {
      throw new Error("Failed to generate attendance ID");
    }
    const id = counterDoc.seq as number;

    const record = {
      id,
      userId: payload.id as number,
      userName: (user?.name as string) || (payload.name as string) || "Unknown",
      role: (user?.role as string) || (payload.role as string) || "unknown",
      date: today,
      status: status as AttendanceStatus,
      markedBy: "self" as const,
      checkInTime: now,
      note: trimmedNote || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(ATTENDANCE_COLLECTION).insertOne(record);

    return NextResponse.json(
      { message: "Attendance marked successfully", record },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
