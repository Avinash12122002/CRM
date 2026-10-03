import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getTodayIST, getUserActionsForDate, isMonitoredRole } from "@/lib/activity/audit";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden. Admin access only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get("userId");
    const dateParam = searchParams.get("date");

    if (!userIdParam) {
      return NextResponse.json({ message: "userId is required" }, { status: 400 });
    }

    const userId = parseInt(userIdParam, 10);
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayIST();

    const { db } = await connectToDatabase();

    const user = await db
      .collection("users")
      .findOne({ id: userId }, { projection: { password_hash: 0 } });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const actions = await getUserActionsForDate(db, userId, today, 100);

    const activity = await db
      .collection("activities")
      .findOne({ userId, date: today });

    let formattedActivity = null;
    if (activity) {
      const now = Date.now();
      const isCheckedOut = Boolean(activity.checkOut);

      let totalShiftSeconds = 0;
      if (isCheckedOut) {
        totalShiftSeconds = activity.shiftSeconds || Math.max(0, Math.floor((new Date(activity.checkOut).getTime() - new Date(activity.firstCheckIn || activity.checkIn).getTime()) / 1000));
      } else {
        const baseShiftSeconds = (activity.sessions && activity.sessions > 1) ? (activity.shiftSeconds || 0) : 0;
        const sessionCheckIn = (activity.sessions && activity.sessions > 1) ? activity.checkIn : (activity.firstCheckIn || activity.checkIn);
        const sessionElapsedSeconds = Math.max(0, Math.floor((now - new Date(sessionCheckIn).getTime()) / 1000));
        totalShiftSeconds = baseShiftSeconds + sessionElapsedSeconds;
      }

      let breakSeconds = activity.breakSeconds || 0;
      let trainingSeconds = activity.trainingSeconds || 0;

      if (!isCheckedOut && activity.status === "break" && activity.breakStart) {
        breakSeconds += Math.max(0, Math.floor((now - new Date(activity.breakStart).getTime()) / 1000));
      }
      if (!isCheckedOut && activity.status === "training" && activity.trainingStart) {
        trainingSeconds += Math.max(0, Math.floor((now - new Date(activity.trainingStart).getTime()) / 1000));
      }

      const effectiveWorkSeconds = Math.max(0, totalShiftSeconds - breakSeconds);
      const ghostWorkSeconds = Math.max(0, totalShiftSeconds - breakSeconds - trainingSeconds);

      let activeSeconds = activity.activeSeconds || 0;
      if (!isCheckedOut && activity.status === "working" && activity.lastHeartbeatAt) {
        const msSinceHeartbeat = now - new Date(activity.lastHeartbeatAt).getTime();
        if (msSinceHeartbeat > 0 && msSinceHeartbeat <= 65000) {
          activeSeconds += Math.floor(msSinceHeartbeat / 1000);
        }
      }
      activeSeconds = Math.min(activeSeconds, effectiveWorkSeconds);
      const idleSeconds = Math.max(0, effectiveWorkSeconds - activeSeconds);

      const latestActionTime = actions[0]?.timestamp || activity.lastActionAt;
      const minutesSinceLastAction = latestActionTime
        ? Math.max(0, Math.floor((now - new Date(latestActionTime).getTime()) / 60000))
        : Math.floor(ghostWorkSeconds / 60);

      const isMonitored = isMonitoredRole(user.role);
      const isGhost = isMonitored
        ? (!isCheckedOut
            ? minutesSinceLastAction >= 10 && !["break", "training"].includes(activity.status)
            : activity.workVerificationStatus === "unverified_ghost" || activity.workVerificationStatus === "low_activity" || (Math.floor(ghostWorkSeconds / 60) >= 30 && actions.length === 0))
        : false;

      formattedActivity = {
        ...activity,
        isMonitored,
        shiftSeconds: totalShiftSeconds,
        workSeconds: effectiveWorkSeconds,
        activeSeconds,
        idleSeconds,
        breakSeconds,
        trainingSeconds,
        actionsToday: actions.length,
        isGhostAlert: isGhost,
        minutesSinceLastAction,
      };
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
      date: today,
      activity: formattedActivity,
      actions,
    });
  } catch (err) {
    console.error("[admin/wfh-monitor/timeline] Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
