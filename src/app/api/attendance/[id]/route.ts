/**
 * PATCH /api/attendance/[id]
 *
 * Admin-only: override any attendance record's status.
 * Requires a mandatory `note` explaining the change.
 * Sets markedBy to "admin" and updates updatedAt.
 *
 * Uses findOneAndUpdate result directly — matches the MongoDB driver version
 * already in use across this codebase where result IS the returned document.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { ensureAttendanceIndexes } from "@/lib/attendance/helpers";
import { ATTENDANCE_COLLECTION, ATTENDANCE_STATUSES } from "@/lib/attendance/constants";
import type { AttendanceStatus } from "@/lib/attendance/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ message: "Invalid record ID" }, { status: 400 });
    }

    let body: { status?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const { status, note } = body;

    if (!status || !ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
      return NextResponse.json(
        { message: `Invalid status. Allowed: ${ATTENDANCE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!note || note.trim().length < 1) {
      return NextResponse.json(
        { message: "A note is required for admin overrides" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    await ensureAttendanceIndexes(db);

    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await db.collection(ATTENDANCE_COLLECTION).findOneAndUpdate(
      { id },
      {
        $set: {
          status: status as AttendanceStatus,
          markedBy: "admin" as const,
          note: note.trim(),
          updatedAt: now,
        },
      },
      { returnDocument: "after", projection: { _id: 0 } }
    );

    // Support both old driver (result.value) and new driver (result directly)
    const updated = result?.value ?? result;

    if (!updated) {
      return NextResponse.json({ message: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Record updated", record: updated });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
