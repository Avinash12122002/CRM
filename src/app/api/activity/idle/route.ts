import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getTodayIST } from "@/lib/activity/audit";

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

    const body = await req.json().catch(() => ({}));
    const isIdle = Boolean(body.isIdle);

    const { db } = await connectToDatabase();
    const today = getTodayIST();
    const now = new Date();

    const activeActivity = await db.collection("activities").findOne({
      userId: payload.id,
      date: today,
      checkOut: null,
    });

    if (!activeActivity) {
      return NextResponse.json(
        { isCheckedIn: false, message: "No active check-in found" },
        { status: 200 }
      );
    }

    if (activeActivity.status === "break" || activeActivity.status === "training") {
      return NextResponse.json({
        success: true,
        status: activeActivity.status,
      });
    }

    const newStatus = isIdle ? "idle" : "working";

    await db.collection("activities").updateOne(
      { _id: activeActivity._id },
      {
        $set: {
          status: newStatus,
          lastHeartbeatAt: now,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({
      success: true,
      status: newStatus,
    });
  } catch (err) {
    console.error("[activity/idle] Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
