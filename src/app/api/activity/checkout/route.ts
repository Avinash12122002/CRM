import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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

    const { db } = await connectToDatabase();

    const activeActivity = await db.collection("activities").findOne({
      userId: payload.id,
      checkOut: null,
    });

    if (!activeActivity) {
      return NextResponse.json(
        { message: "No active check-in found" },
        { status: 400 },
      );
    }

    const now = new Date();

    let totalWorkSeconds = activeActivity.workSeconds || 0;
    let totalBreakSeconds = activeActivity.breakSeconds || 0;
    let totalTrainingSeconds = activeActivity.trainingSeconds || 0;

    // User currently working
    if (activeActivity.status === "working") {
      totalWorkSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.checkIn).getTime()) / 1000,
        ),
      );
    }

    // User currently on break
    if (activeActivity.status === "break" && activeActivity.breakStart) {
      totalBreakSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.breakStart).getTime()) /
            1000,
        ),
      );
    }

    // User currently in training
    if (activeActivity.status === "training" && activeActivity.trainingStart) {
      totalTrainingSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.trainingStart).getTime()) /
            1000,
        ),
      );
    }

    const totalWorkHours = Number((totalWorkSeconds / 3600).toFixed(2));

    const totalBreakHours = Number((totalBreakSeconds / 3600).toFixed(2));

    const totalTrainingHours = Number((totalTrainingSeconds / 3600).toFixed(2));

    await db.collection("activities").updateOne(
      { _id: activeActivity._id },
      {
        $set: {
          checkOut: now,

          workSeconds: totalWorkSeconds,
          breakSeconds: totalBreakSeconds,
          trainingSeconds: totalTrainingSeconds,

          breakStart: null,
          trainingStart: null,

          status: "completed",

          updatedAt: now,
        },
      },
    );

    return NextResponse.json(
      {
        message: "Checked out successfully",

        workHours: totalWorkHours,
        breakHours: totalBreakHours,
        trainingHours: totalTrainingHours,

        workSeconds: totalWorkSeconds,
        breakSeconds: totalBreakSeconds,
        trainingSeconds: totalTrainingSeconds,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
