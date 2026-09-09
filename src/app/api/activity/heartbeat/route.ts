import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getTodayIST, isMonitoredRole } from "@/lib/activity/audit";
import { createNotification } from "@/lib/notifications";

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
    const today = getTodayIST();
    const now = new Date();

    const activeActivity = await db.collection("activities").findOne({
      userId: payload.id,
      date: today,
      checkOut: null,
    });

    if (!activeActivity) {
      return NextResponse.json(
        { isCheckedIn: false, message: "No active check-in found for today" },
        { status: 200 }
      );
    }

    // Parse body if provided
    let body: { isIdle?: boolean; activeSecondsDelta?: number; idleSecondsDelta?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const isOnBreakOrTraining = activeActivity.status === "break" || activeActivity.status === "training";
    const isIdle = Boolean(body.isIdle);

    const activeDelta = isOnBreakOrTraining
      ? 0
      : typeof body.activeSecondsDelta === "number" && body.activeSecondsDelta >= 0
      ? Math.min(body.activeSecondsDelta, 300) // cap to prevent tampering
      : isIdle ? 0 : 60;

    // Calculate total shift work seconds accurately across sessions
    const baseShiftSeconds = (activeActivity.sessions && activeActivity.sessions > 1)
      ? (activeActivity.shiftSeconds || 0)
      : 0;
    const sessionCheckIn = (activeActivity.sessions && activeActivity.sessions > 1)
      ? activeActivity.checkIn
      : (activeActivity.firstCheckIn || activeActivity.checkIn);
    const sessionElapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(sessionCheckIn).getTime()) / 1000));
    const elapsedShiftSeconds = baseShiftSeconds + sessionElapsedSeconds;
    let breakSeconds = activeActivity.breakSeconds || 0;
    let trainingSeconds = activeActivity.trainingSeconds || 0;
    if (activeActivity.status === "break" && activeActivity.breakStart) {
      breakSeconds += Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeActivity.breakStart).getTime()) / 1000)
      );
    }
    if (activeActivity.status === "training" && activeActivity.trainingStart) {
      trainingSeconds += Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeActivity.trainingStart).getTime()) / 1000)
      );
    }
    // Total clocked-in work time on the shift including training (excluding only break)
    const totalWorkSeconds = Math.max(0, elapsedShiftSeconds - breakSeconds);

    // Effective work time strictly excluding break and training (used only for Ghost Alert)
    const effectiveGhostWorkSeconds = Math.max(0, elapsedShiftSeconds - breakSeconds - trainingSeconds);

    const newActiveSeconds = Math.min((activeActivity.activeSeconds || 0) + activeDelta, totalWorkSeconds);
    const newIdleSeconds = Math.max(0, totalWorkSeconds - newActiveSeconds);

    // Check Ghost Condition:
    // If effective working time (strictly excluding break and training) is >= 10 mins (600s)
    // and 0 tangible actions recorded today, trigger ghost alert (unless currently on break/training)
    const effectiveGhostWorkMinutes = Math.floor(effectiveGhostWorkSeconds / 60);
    const actionsToday = await db.collection("user_action_logs").countDocuments({
      userId: activeActivity.userId,
      date: activeActivity.date || today,
    });

    // Inactivity evaluation:
    // Either 0 actions in 10+ mins, OR 10+ mins have passed since the last action
    const lastActionTime = activeActivity.lastActionAt;
    const minutesSinceLastAction = lastActionTime
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastActionTime).getTime()) / 60000))
      : effectiveGhostWorkMinutes;

    const isMonitored = isMonitoredRole(payload.role);
    const isGhost = isMonitored && minutesSinceLastAction >= 10 && !isOnBreakOrTraining;

    // Send a live notification to all admins when the 10-minute threshold is first reached
    if (!activeActivity.isGhostAlert && isGhost) {
      try {
        const adminUsers = await db
          .collection("users")
          .find({ role: "admin" }, { projection: { id: 1 } })
          .toArray();

        const employeeName = activeActivity.userName || payload.name || "An employee";
        const message = actionsToday === 0
          ? `${employeeName} has been clocked in for 10+ minutes without performing any CRM actions today.`
          : `${employeeName} has been inactive with no CRM actions for over 10 minutes.`;

        for (const adm of adminUsers) {
          await createNotification({
            userId: adm.id,
            title: "⚠️ Live Inactivity Alert",
            message,
            type: "warning",
            link: "/dashboard/activity",
          });
        }
      } catch (notifyErr) {
        console.error("[heartbeat] Error notifying admins of live ghost alert:", notifyErr);
      }
    }

    // Determine current status: do not overwrite break/training
    let newStatus = activeActivity.status;
    if (!isOnBreakOrTraining) {
      newStatus = isIdle ? "idle" : "working";
    }

    await db.collection("activities").updateOne(
      { _id: activeActivity._id },
      {
        $set: {
          activeSeconds: newActiveSeconds,
          idleSeconds: newIdleSeconds,
          workSeconds: totalWorkSeconds,
          lastHeartbeatAt: now,
          status: newStatus,
          isGhostAlert: isGhost,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({
      success: true,
      isCheckedIn: true,
      isGhostAlert: isGhost,
      actionsToday,
      status: newStatus,
    });
  } catch (err) {
    console.error("[activity/heartbeat] Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
