import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { isMonitoredRole } from "@/lib/activity/audit";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const userIdFilter = searchParams.get("userId");
    const dateFilter = searchParams.get("date");

    const { db } = await connectToDatabase();

    const matchFilter: Record<string, unknown> = {};

    if (payload.role !== "admin") {
      matchFilter.userId = payload.id;
    } else if (userIdFilter) {
      matchFilter.userId = parseInt(userIdFilter);
    }

    if (dateFilter) {
      matchFilter.date = dateFilter;
    }

    const total = await db.collection("activities").countDocuments(matchFilter);

    const activities = await db
      .collection("activities")
      .aggregate([
        {
          $match: matchFilter,
        },

        {
          $sort: {
            date: -1,
            checkIn: -1,
          },
        },

        {
          $skip: skip,
        },

        {
          $limit: limit,
        },

        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "id",
            as: "user",
          },
        },

        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $project: {
            id: 1,
            date: 1,

            userId: 1,

            userName: "$user.name",
            userUsername: "$user.username",
            userRole: "$user.role",

            checkIn: 1,
            checkOut: 1,
            firstCheckIn: 1,
            lastCheckOut: 1,

            breakStart: 1,
            trainingStart: 1,

            status: 1,

            workSeconds: {
              $ifNull: ["$workSeconds", 0],
            },

            activeSeconds: {
              $ifNull: ["$activeSeconds", 0],
            },

            idleSeconds: {
              $ifNull: ["$idleSeconds", 0],
            },

            actionsToday: {
              $ifNull: ["$actionsToday", 0],
            },

            isGhostAlert: {
              $ifNull: ["$isGhostAlert", false],
            },

            lastActionAt: 1,

            workVerificationStatus: {
              $ifNull: ["$workVerificationStatus", "verified"],
            },

            shiftSeconds: {
              $ifNull: ["$shiftSeconds", 0],
            },

            breakSeconds: {
              $ifNull: ["$breakSeconds", 0],
            },

            trainingSeconds: {
              $ifNull: ["$trainingSeconds", 0],
            },

            sessions: {
              $ifNull: ["$sessions", 1],
            },
          },
        },
      ])
      .toArray();

    const formattedActivities = activities.map((activity) => {
      const now = new Date();
      const isCheckedOut = Boolean(activity.checkOut);

      let totalShiftSeconds = 0;
      if (isCheckedOut) {
        totalShiftSeconds = activity.shiftSeconds || Math.max(0, Math.floor((new Date(activity.checkOut).getTime() - new Date(activity.firstCheckIn || activity.checkIn).getTime()) / 1000));
      } else {
        const baseShiftSeconds = (activity.sessions && activity.sessions > 1) ? (activity.shiftSeconds || 0) : 0;
        const sessionCheckIn = (activity.sessions && activity.sessions > 1) ? activity.checkIn : (activity.firstCheckIn || activity.checkIn);
        const sessionElapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(sessionCheckIn).getTime()) / 1000));
        totalShiftSeconds = baseShiftSeconds + sessionElapsedSeconds;
      }

      let breakSeconds = activity.breakSeconds || 0;
      let trainingSeconds = activity.trainingSeconds || 0;

      // Running Break Time
      if (!isCheckedOut && activity.status === "break" && activity.breakStart) {
        breakSeconds += Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(activity.breakStart).getTime()) / 1000,
          ),
        );
      }

      // Running Training Time
      if (!isCheckedOut && activity.status === "training" && activity.trainingStart) {
        trainingSeconds += Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(activity.trainingStart).getTime()) / 1000,
          ),
        );
      }

      // Total working seconds including training (excluding only break)
      const workSeconds = Math.max(0, totalShiftSeconds - breakSeconds);
      // Ghost evaluation seconds strictly excluding break & training
      const ghostWorkSeconds = Math.max(0, totalShiftSeconds - breakSeconds - trainingSeconds);

      const activeSeconds = Math.min(activity.activeSeconds || 0, workSeconds);
      const idleSeconds = Math.max(0, workSeconds - activeSeconds);

      const workHours = Number((workSeconds / 3600).toFixed(2));
      const breakHours = Number((breakSeconds / 3600).toFixed(2));
      const trainingHours = Number((trainingSeconds / 3600).toFixed(2));
      const activeHours = Number((activeSeconds / 3600).toFixed(2));
      const idleHours = Number((idleSeconds / 3600).toFixed(2));

      const totalWorkingDay = workHours;

      let lateMinutes = 0;

      const firstCheckIn = activity.firstCheckIn;

      if (firstCheckIn) {
        const checkInDate = new Date(firstCheckIn);
        // IST is always UTC + 5:30 (India has no DST)
        const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
        const checkInISTShifted = new Date(checkInDate.getTime() + IST_OFFSET_MS);

        const istHours = checkInISTShifted.getUTCHours();
        const istMinutes = checkInISTShifted.getUTCMinutes();
        const checkInMinutes = istHours * 60 + istMinutes;
        const expectedMinutes = 10 * 60; // 10:00 AM IST

        if (checkInMinutes > expectedMinutes) {
          lateMinutes = checkInMinutes - expectedMinutes;
        }
      }

      return {
        id: activity.id,

        date: activity.date,

        userId: activity.userId,

        userName: activity.userName || "Unknown User",

        userUsername: activity.userUsername || "N/A",

        checkIn: activity.checkIn,

        checkOut: activity.checkOut,

        firstCheckIn: activity.firstCheckIn,

        lastCheckOut: activity.lastCheckOut,

        status: activity.status,

        workHours,

        breakHours,

        trainingHours,

        totalWorkingDay,

        activeSeconds,

        idleSeconds,

        activeHours,

        idleHours,

        actionsToday: activity.actionsToday || 0,

        isGhostAlert: (() => {
          if (!isMonitoredRole(activity.userRole)) return false;
          const lastActionTime = activity.lastActionAt;
          const minutesSinceLastAction = lastActionTime
            ? Math.max(0, Math.floor((now.getTime() - new Date(lastActionTime).getTime()) / 60000))
            : Math.floor(ghostWorkSeconds / 60);

          return !isCheckedOut
            ? minutesSinceLastAction >= 10 && !["break", "training"].includes(activity.status)
            : activity.isGhostAlert || activity.workVerificationStatus === "unverified_ghost" || activity.workVerificationStatus === "low_activity" || (Math.floor(ghostWorkSeconds / 60) >= 30 && (activity.actionsToday || 0) === 0);
        })(),

        workVerificationStatus: activity.workVerificationStatus || "verified",

        sessions: activity.sessions,

        lateMinutes,
      };
    });

    return NextResponse.json({
      activities: formattedActivities,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
