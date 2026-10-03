import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getTodayIST, isMonitoredRole } from "@/lib/activity/audit";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    const today = getTodayIST();

    const activeActivity = await db.collection("activities").findOne({
      userId: payload.id,
      checkOut: null,
    });

    if (!activeActivity) {
      return NextResponse.json({
        isCheckedIn: false,
        activity: null,
      });
    }

    const now = new Date();

    // Accurate shift duration: previous completed sessions' shiftSeconds + current session elapsed
    const baseShiftSeconds = (activeActivity.sessions && activeActivity.sessions > 1)
      ? (activeActivity.shiftSeconds || 0)
      : 0;
    const sessionCheckIn = (activeActivity.sessions && activeActivity.sessions > 1)
      ? activeActivity.checkIn
      : (activeActivity.firstCheckIn || activeActivity.checkIn);
    const sessionElapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(sessionCheckIn).getTime()) / 1000));
    const shiftSeconds = baseShiftSeconds + sessionElapsedSeconds;

    let breakSeconds = activeActivity.breakSeconds || 0;
    let trainingSeconds = activeActivity.trainingSeconds || 0;

    // Running Break Time
    if (activeActivity.status === "break" && activeActivity.breakStart) {
      breakSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.breakStart).getTime()) / 1000
        )
      );
    }

    // Running Training Time
    if (activeActivity.status === "training" && activeActivity.trainingStart) {
      trainingSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.trainingStart).getTime()) / 1000
        )
      );
    }

    // Total clocked-in work time on the shift including training (excluding only break)
    const workSeconds = Math.max(0, shiftSeconds - breakSeconds);

    // Effective work time strictly excluding break & training (used only for ghost alert evaluation)
    const ghostWorkSeconds = Math.max(0, shiftSeconds - breakSeconds - trainingSeconds);

    // Active seconds: base activeSeconds from DB + current ongoing active seconds since last heartbeat
    let activeSeconds = activeActivity.activeSeconds || 0;
    if (activeActivity.status === "working" && activeActivity.lastHeartbeatAt) {
      const msSinceHeartbeat = now.getTime() - new Date(activeActivity.lastHeartbeatAt).getTime();
      if (msSinceHeartbeat > 0 && msSinceHeartbeat <= 65000) {
        activeSeconds += Math.floor(msSinceHeartbeat / 1000);
      }
    }
    activeSeconds = Math.min(activeSeconds, workSeconds);

    // Idle seconds: exactly all remaining work time not actively verified
    const idleSeconds = Math.max(0, workSeconds - activeSeconds);

    // Exact count of verified work actions from user_action_logs to guarantee 100% parity with admin timeline
    const verifiedActionsCount = await db.collection("user_action_logs").countDocuments({
      userId: activeActivity.userId,
      date: activeActivity.date || today,
    });

    const isMonitored = isMonitoredRole(payload.role);

    // Real-time ghost alert: 10+ mins without any CRM actions (only for monitored roles)
    const isOnBreakOrTraining = activeActivity.status === "break" || activeActivity.status === "training";
    const lastActionTime = activeActivity.lastActionAt;
    const minutesSinceLastAction = lastActionTime
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastActionTime).getTime()) / 60000))
      : Math.floor(ghostWorkSeconds / 60);

    const liveGhostAlert = isMonitored && minutesSinceLastAction >= 10 && !isOnBreakOrTraining;

    return NextResponse.json({
      isCheckedIn: true,
      isMonitored,
      userRole: payload.role,

      activity: {
        id: activeActivity.id,

        userId: activeActivity.userId,

        firstCheckIn:
          activeActivity.firstCheckIn ||
          activeActivity.checkIn,

        checkIn: activeActivity.checkIn,

        checkOut: activeActivity.checkOut,

        lastCheckOut:
          activeActivity.lastCheckOut || null,

        status:
          activeActivity.status || "working",

        shiftSeconds,
        workSeconds,
        activeSeconds,
        idleSeconds,

        breakSeconds,

        trainingSeconds,

        actionsToday: verifiedActionsCount,
        lastActionAt: activeActivity.lastActionAt || null,
        lastHeartbeatAt: activeActivity.lastHeartbeatAt || null,
        isGhostAlert: isMonitored ? (liveGhostAlert || Boolean(activeActivity.isGhostAlert)) : false,

        breakStart:
          activeActivity.breakStart || null,

        trainingStart:
          activeActivity.trainingStart || null,

        sessions:
          activeActivity.sessions || 1,

        date: activeActivity.date,
      },
    });
  } catch (err) {
    console.error(err);

    const errorMessage =
      err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}