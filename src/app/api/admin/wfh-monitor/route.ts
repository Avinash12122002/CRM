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
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden. Admin access only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayIST();

    const { db } = await connectToDatabase();

    // 1. Fetch all non-admin users
    const users = await db
      .collection("users")
      .find({ role: { $ne: "admin" } }, { projection: { password_hash: 0 } })
      .sort({ name: 1 })
      .toArray();

    // 2. Fetch all activity records for this date
    const activities = await db
      .collection("activities")
      .find({ date: today })
      .toArray();

    const activityMap = new Map();
    for (const act of activities) {
      activityMap.set(act.userId, act);
    }

    // 3. Fetch latest action for each user for today from user_action_logs
    const recentLogs = await db
      .collection("user_action_logs")
      .aggregate([
        { $match: { date: today } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$userId",
            latestAction: { $first: "$summary" },
            latestActionTime: { $first: "$timestamp" },
            actionCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const logsMap = new Map();
    for (const log of recentLogs) {
      logsMap.set(log._id, log);
    }

    const now = Date.now();
    const threeMinutesAgo = now - 3 * 60 * 1000;

    let activeNowCount = 0;
    let idleNowCount = 0;
    let breakNowCount = 0;
    let ghostAlertCount = 0;
    let checkedOutCount = 0;

    const monitoredUsers = users.map((u) => {
      const act = activityMap.get(u.id);
      const log = logsMap.get(u.id);

      if (!act) {
        return {
          userId: u.id,
          name: u.name,
          username: u.username,
          role: u.role,
          isCheckedIn: false,
          status: "not_checked_in",
          checkIn: null,
          checkOut: null,
          elapsedMinutes: 0,
          activeMinutes: 0,
          idleMinutes: 0,
          breakMinutes: 0,
          actionsToday: 0,
          lastActionAt: null,
          latestActionSummary: null,
          isGhostAlert: false,
          workVerificationStatus: "none",
        };
      }

      const isCheckedOut = Boolean(act.checkOut);
      let totalShiftSeconds = 0;
      if (isCheckedOut) {
        totalShiftSeconds = act.shiftSeconds || Math.max(0, Math.floor((new Date(act.checkOut).getTime() - new Date(act.firstCheckIn || act.checkIn).getTime()) / 1000));
      } else {
        const baseShiftSeconds = (act.sessions && act.sessions > 1) ? (act.shiftSeconds || 0) : 0;
        const sessionCheckIn = (act.sessions && act.sessions > 1) ? act.checkIn : (act.firstCheckIn || act.checkIn);
        const sessionElapsedSeconds = Math.max(0, Math.floor((now - new Date(sessionCheckIn).getTime()) / 1000));
        totalShiftSeconds = baseShiftSeconds + sessionElapsedSeconds;
      }

      let breakSeconds = act.breakSeconds || 0;
      let trainingSeconds = act.trainingSeconds || 0;
      if (!isCheckedOut && act.status === "break" && act.breakStart) {
        breakSeconds += Math.max(0, Math.floor((now - new Date(act.breakStart).getTime()) / 1000));
      }
      if (!isCheckedOut && act.status === "training" && act.trainingStart) {
        trainingSeconds += Math.max(0, Math.floor((now - new Date(act.trainingStart).getTime()) / 1000));
      }

      const elapsedMinutes = Math.floor(totalShiftSeconds / 60);
      const breakMinutes = Math.floor(breakSeconds / 60);
      const trainingMinutes = Math.floor(trainingSeconds / 60);

      // Total working minutes including training (excluding only break)
      const effectiveWorkMinutes = Math.max(0, Math.floor((totalShiftSeconds - breakSeconds) / 60));

      // Ghost evaluation minutes strictly excluding break & training
      const ghostEvaluationMinutes = Math.max(0, Math.floor((totalShiftSeconds - breakSeconds - trainingSeconds) / 60));

      const activeMinutes = Math.min(Math.floor((act.activeSeconds || 0) / 60), effectiveWorkMinutes);
      const idleMinutes = Math.max(0, effectiveWorkMinutes - activeMinutes);
      const actionsToday = log?.actionCount || act.actionsToday || 0;

      // Real-time status determination
      const lastHeartbeatMs = act.lastHeartbeatAt ? new Date(act.lastHeartbeatAt).getTime() : 0;
      const isHeartbeatFresh = lastHeartbeatMs >= threeMinutesAgo;

      let liveStatus = act.status || "working";
      if (isCheckedOut) {
        liveStatus = "completed";
      } else if (act.status === "break") {
        liveStatus = "break";
      } else if (act.status === "training") {
        liveStatus = "training";
      } else if (!isHeartbeatFresh || act.status === "idle") {
        liveStatus = "idle";
      } else {
        liveStatus = "working";
      }

      const isMonitored = isMonitoredRole(u.role);

      // Ghost / Inactivity Evaluation (applies only to monitored roles):
      // Live: Clocked in with 0 actions for 10+ mins, OR 10+ mins have passed since the last action without working (excluding break/training)
      // Permanent: Marked unverified_ghost at checkout, OR worked 30+ mins with 0 actions
      const lastActionTime = log?.latestActionTime || act.lastActionAt;
      const minutesSinceLastAction = lastActionTime
        ? Math.max(0, Math.floor((now - new Date(lastActionTime).getTime()) / 60000))
        : ghostEvaluationMinutes;

      const isGhost = isMonitored
        ? (!isCheckedOut
            ? minutesSinceLastAction >= 10 && !["break", "training"].includes(liveStatus)
            : act.workVerificationStatus === "unverified_ghost" || (ghostEvaluationMinutes >= 30 && actionsToday === 0))
        : false;

      if (isGhost) ghostAlertCount++;
      if (isCheckedOut) checkedOutCount++;
      else if (liveStatus === "working" && !isGhost) activeNowCount++;
      else if (liveStatus === "idle" && !isGhost) idleNowCount++;
      else if (liveStatus === "break" && !isGhost) breakNowCount++;

      return {
        userId: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        isMonitored,
        isCheckedIn: !isCheckedOut,
        status: liveStatus,
        checkIn: act.firstCheckIn || act.checkIn,
        checkOut: act.checkOut || null,
        elapsedMinutes,
        effectiveWorkMinutes,
        activeMinutes,
        idleMinutes,
        breakMinutes,
        trainingMinutes,
        actionsToday,
        lastActionAt: log?.latestActionTime || act.lastActionAt || null,
        latestActionSummary: log?.latestAction || null,
        isGhostAlert: isGhost,
        workVerificationStatus: act.workVerificationStatus || (isGhost ? "unverified_ghost" : "verified"),
      };
    });

    return NextResponse.json({
      date: today,
      summary: {
        totalWorkforce: users.length,
        activeNow: activeNowCount,
        idleNow: idleNowCount,
        onBreak: breakNowCount,
        ghostAlerts: ghostAlertCount,
        checkedOut: checkedOutCount,
      },
      users: monitoredUsers,
    });
  } catch (err) {
    console.error("[admin/wfh-monitor] Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
