import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken, getNextId } from "@/lib/auth";
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

    const now = new Date();

    // IST is always UTC+5:30 — compute the IST date directly without
    // relying on toLocaleString+new Date() which uses the server's local timezone
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS);

    const today = `${nowIST.getUTCFullYear()}-${String(
      nowIST.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;

    // Already checked in
    const activeCheckIn = await db.collection("activities").findOne({
      userId: payload.id,
      checkOut: null,
    });

    if (activeCheckIn) {
      const activeDate = activeCheckIn.date;

      if (activeDate !== today) {
        // Auto checkout: Cap to user's last interaction, capped at 19:00 IST (never midnight)
        const shiftEndCap = new Date(`${activeDate}T19:00:00.000+05:30`);
        let autoCheckoutTime = activeCheckIn.lastHeartbeatAt
          ? new Date(activeCheckIn.lastHeartbeatAt)
          : activeCheckIn.lastActionAt
          ? new Date(activeCheckIn.lastActionAt)
          : shiftEndCap;

        if (autoCheckoutTime.getTime() > shiftEndCap.getTime()) {
          autoCheckoutTime = shiftEndCap;
        }

        const baseShiftSeconds = (activeCheckIn.sessions && activeCheckIn.sessions > 1)
          ? (activeCheckIn.shiftSeconds || 0)
          : 0;
        const sessionCheckIn = (activeCheckIn.sessions && activeCheckIn.sessions > 1)
          ? activeCheckIn.checkIn
          : (activeCheckIn.firstCheckIn || activeCheckIn.checkIn);

        if (autoCheckoutTime.getTime() <= new Date(sessionCheckIn).getTime()) {
          autoCheckoutTime = new Date(new Date(sessionCheckIn).getTime() + 60000);
        }

        const autoCheckout = autoCheckoutTime;
        const sessionElapsedSeconds = Math.max(
          0,
          Math.floor((autoCheckout.getTime() - new Date(sessionCheckIn).getTime()) / 1000)
        );
        const elapsedShiftSeconds = baseShiftSeconds + sessionElapsedSeconds;

        let breakSeconds = activeCheckIn.breakSeconds || 0;
        let trainingSeconds = activeCheckIn.trainingSeconds || 0;

        if (activeCheckIn.status === "break" && activeCheckIn.breakStart) {
          breakSeconds += Math.max(
            0,
            Math.floor((autoCheckout.getTime() - new Date(activeCheckIn.breakStart).getTime()) / 1000)
          );
        }

        if (activeCheckIn.status === "training" && activeCheckIn.trainingStart) {
          trainingSeconds += Math.max(
            0,
            Math.floor((autoCheckout.getTime() - new Date(activeCheckIn.trainingStart).getTime()) / 1000)
          );
        }

        const totalWorkSeconds = Math.max(0, elapsedShiftSeconds - breakSeconds);
        const ghostWorkSeconds = Math.max(0, elapsedShiftSeconds - breakSeconds - trainingSeconds);
        const activeSecs = Math.min(activeCheckIn.activeSeconds || 0, totalWorkSeconds);
        const idleSecs = Math.max(0, totalWorkSeconds - activeSecs);

        const actionsToday = await db.collection("user_action_logs").countDocuments({
          userId: payload.id,
          date: activeDate,
        });

        const isMonitored = isMonitoredRole(payload.role);
        const isGhost = isMonitored && ((ghostWorkSeconds >= 1800 && actionsToday === 0) || (totalWorkSeconds >= 10800 && actionsToday < 3));
        const workVerificationStatus = (isMonitored && ghostWorkSeconds >= 1800 && actionsToday === 0)
          ? "unverified_ghost"
          : (isMonitored && totalWorkSeconds >= 10800 && actionsToday < 3)
          ? "low_activity"
          : (activeCheckIn.workVerificationStatus || "verified");

        await db.collection("activities").updateOne(
          { _id: activeCheckIn._id },
          {
            $set: {
              checkOut: autoCheckout,
              lastCheckOut: autoCheckout,
              shiftSeconds: elapsedShiftSeconds,
              shiftHours: Number((elapsedShiftSeconds / 3600).toFixed(2)),
              workSeconds: totalWorkSeconds,
              workHours: Number((totalWorkSeconds / 3600).toFixed(2)),
              activeSeconds: activeSecs,
              activeHours: Number((activeSecs / 3600).toFixed(2)),
              idleSeconds: idleSecs,
              idleHours: Number((idleSecs / 3600).toFixed(2)),
              breakSeconds,
              breakHours: Number((breakSeconds / 3600).toFixed(2)),
              trainingSeconds,
              trainingHours: Number((trainingSeconds / 3600).toFixed(2)),
              breakStart: null,
              trainingStart: null,
              actionsToday,
              status: "completed",
              isGhostAlert: isGhost,
              workVerificationStatus,
              updatedAt: now,
            },
          },
        );
      } else {
        return NextResponse.json(
          { message: "Already checked in" },
          { status: 400 },
        );
      }
    }

    // Existing record for today
    const todayActivity = await db.collection("activities").findOne({
      userId: payload.id,
      date: today,
    });

    // Re-check-in on same day
    if (todayActivity) {
      await db.collection("activities").updateOne(
        { _id: todayActivity._id },
        {
          $set: {
            checkIn: now,
            checkOut: null,
            status: "working",
            lastHeartbeatAt: now,
            // Reset ghost flag on re-checkin — a new session starts clean
            isGhostAlert: false,
            workVerificationStatus: "pending",
            // Clear any dangling break/training state
            breakStart: null,
            trainingStart: null,
            updatedAt: now,
          },
          $inc: {
            sessions: 1,
          },
        },
      );

      const updatedActivity = await db.collection("activities").findOne({
        _id: todayActivity._id,
      });

      return NextResponse.json(
        {
          message: "Checked in successfully",
          activity: updatedActivity,
        },
        { status: 200 },
      );
    }

    // First check-in of the day
    const id = await getNextId(db, "activities");

    const activity = {
      id,

      userId: payload.id,
      userRole: payload.role,

      date: today,

      firstCheckIn: now, // never changes

      checkIn: now,
      checkOut: null,

      shiftSeconds: 0,
      workSeconds: 0,
      activeSeconds: 0,
      idleSeconds: 0,
      breakSeconds: 0,
      trainingSeconds: 0,

      breakStart: null,
      trainingStart: null,

      actionsToday: await db.collection("user_action_logs").countDocuments({
        userId: payload.id,
        date: today,
      }),
      lastActionAt: null,
      lastHeartbeatAt: now,
      isGhostAlert: false,
      workVerificationStatus: "pending",

      sessions: 1,

      status: "working",

      createdAt: now,
      updatedAt: now,
    };

    await db.collection("activities").insertOne(activity);

    return NextResponse.json(
      {
        message: "Checked in successfully",
        activity,
      },
      { status: 201 },
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
