import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { isMonitoredRole } from "@/lib/activity/audit";

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

    const baseShiftSeconds = (activeActivity.sessions && activeActivity.sessions > 1)
      ? (activeActivity.shiftSeconds || 0)
      : 0;
    const sessionCheckIn = (activeActivity.sessions && activeActivity.sessions > 1)
      ? activeActivity.checkIn
      : (activeActivity.firstCheckIn || activeActivity.checkIn);
    const sessionElapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(sessionCheckIn).getTime()) / 1000));
    const elapsedShiftSeconds = baseShiftSeconds + sessionElapsedSeconds;
    const elapsedShiftHours = Number((elapsedShiftSeconds / 3600).toFixed(2));

    // User currently on break
    let totalBreakSeconds = activeActivity.breakSeconds || 0;
    if (activeActivity.status === "break" && activeActivity.breakStart) {
      totalBreakSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.breakStart).getTime()) / 1000
        )
      );
    }

    // User currently in training
    let totalTrainingSeconds = activeActivity.trainingSeconds || 0;
    if (activeActivity.status === "training" && activeActivity.trainingStart) {
      totalTrainingSeconds += Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(activeActivity.trainingStart).getTime()) / 1000
        )
      );
    }

    // Total clocked-in work time on the shift including training (excluding only break)
    const totalWorkSeconds = Math.max(0, elapsedShiftSeconds - totalBreakSeconds);

    // Effective work time strictly excluding break & training (used only for ghost check)
    const ghostWorkSeconds = Math.max(0, elapsedShiftSeconds - totalBreakSeconds - totalTrainingSeconds);

    const activeSecs = Math.min(activeActivity.activeSeconds || 0, totalWorkSeconds);
    const idleSecs = Math.max(0, totalWorkSeconds - activeSecs);

    const totalWorkHours = Number((totalWorkSeconds / 3600).toFixed(2));
    const totalBreakHours = Number((totalBreakSeconds / 3600).toFixed(2));
    const totalTrainingHours = Number((totalTrainingSeconds / 3600).toFixed(2));
    const activeHours = Number((activeSecs / 3600).toFixed(2));
    const idleHours = Number((idleSecs / 3600).toFixed(2));

    // Exact count of verified work actions from user_action_logs
    const verifiedActionsCount = await db.collection("user_action_logs").countDocuments({
      userId: payload.id,
      date: activeActivity.date,
    });
    const actionsToday = Math.max(verifiedActionsCount, activeActivity.actionsToday || 0);

    let workVerificationStatus: "verified" | "low_activity" | "unverified_ghost" = "verified";

    if (isMonitoredRole(payload.role)) {
      // Permanent Ghost Check-In: Working time >= 30 mins (1800s, strictly excluding break & training) with 0 actions
      if (ghostWorkSeconds >= 1800 && actionsToday === 0) {
        workVerificationStatus = "unverified_ghost";

        // Alert admins about ghost check-in
        try {
          const adminUsers = await db
            .collection("users")
            .find({ role: "admin" }, { projection: { id: 1 } })
            .toArray();

          for (const adm of adminUsers) {
            await createNotification({
              userId: adm.id,
              title: "⚠️ Ghost Check-In Alert",
              message: `${payload.name} (${payload.role.toUpperCase()}) checked out after ${totalWorkHours.toFixed(1)}h of working time with 0 CRM actions performed today.`,
              type: "warning",
              link: "/dashboard/activity",
            });
          }
        } catch (notifyErr) {
          console.error("[checkout] Error notifying admins of ghost check-in:", notifyErr);
        }
      } else if (totalWorkSeconds >= 10800 && actionsToday < 3) {
        // Worked 3+ hours but had fewer than 3 actions
        workVerificationStatus = "low_activity";

        try {
          const adminUsers = await db
            .collection("users")
            .find({ role: "admin" }, { projection: { id: 1 } })
            .toArray();

          for (const adm of adminUsers) {
            await createNotification({
              userId: adm.id,
              title: "⚠️ Low Activity Alert",
              message: `${payload.name} (${payload.role.toUpperCase()}) checked out after ${totalWorkHours.toFixed(1)}h of working time with only ${actionsToday} CRM actions today.`,
              type: "warning",
              link: "/dashboard/activity",
            });
          }
        } catch (notifyErr) {
          console.error("[checkout] Error notifying admins of low activity check-in:", notifyErr);
        }
      }
    }

    const isGhostAlert = workVerificationStatus === "unverified_ghost" || workVerificationStatus === "low_activity";

    await db.collection("activities").updateOne(
      { _id: activeActivity._id },
      {
        $set: {
          checkOut: now,
          lastCheckOut: now,

          shiftSeconds: elapsedShiftSeconds,
          shiftHours: elapsedShiftHours,
          workSeconds: totalWorkSeconds,
          activeSeconds: activeSecs,
          idleSeconds: idleSecs,
          breakSeconds: totalBreakSeconds,
          trainingSeconds: totalTrainingSeconds,
          workHours: totalWorkHours,
          activeHours,
          idleHours,
          breakHours: totalBreakHours,
          trainingHours: totalTrainingHours,

          actionsToday,
          workVerificationStatus,
          isGhostAlert,

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
        activeHours: Number((activeSecs / 3600).toFixed(2)),
        idleHours: Number((idleSecs / 3600).toFixed(2)),
        breakHours: totalBreakHours,
        trainingHours: totalTrainingHours,

        workSeconds: totalWorkSeconds,
        activeSeconds: activeSecs,
        idleSeconds: idleSecs,
        breakSeconds: totalBreakSeconds,
        trainingSeconds: totalTrainingSeconds,

        actionsToday,
        workVerificationStatus,
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
