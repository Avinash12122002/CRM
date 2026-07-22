import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload, todayDateStr } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, DATA_ENTRY_ROLES, DAILY_LEAD_TARGET } from "@/lib/bd/constants";

export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!DATA_ENTRY_ROLES.includes(payload.role)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayDateStr();

    const { db } = await connectToDatabase();
    const target = await db
      .collection(BD_COLLECTIONS.dailyTargets)
      .findOne({ userId: payload.id, date });

    const totalCreated = target?.totalCreated || 0;

    return NextResponse.json({
      date,
      target: DAILY_LEAD_TARGET,
      totalCreated,
      remaining: Math.max(DAILY_LEAD_TARGET - totalCreated, 0),
      targetCompleted: totalCreated >= DAILY_LEAD_TARGET,
      overflowCreated: totalCreated > DAILY_LEAD_TARGET ? totalCreated : 0,
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
