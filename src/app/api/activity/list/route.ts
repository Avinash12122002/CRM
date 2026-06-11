import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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

    const matchFilter: Record<string, any> = {};

    if (payload.role === "employee" || payload.role === "meeting") {
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

      let workSeconds = activity.workSeconds || 0;
      let breakSeconds = activity.breakSeconds || 0;
      let trainingSeconds = activity.trainingSeconds || 0;

      // Running Work Time
      if (
        activity.status === "working" &&
        !activity.checkOut &&
        activity.checkIn
      ) {
        workSeconds += Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(activity.checkIn).getTime()) / 1000,
          ),
        );
      }

      // Running Break Time
      if (activity.status === "break" && activity.breakStart) {
        breakSeconds += Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(activity.breakStart).getTime()) / 1000,
          ),
        );
      }

      // Running Training Time
      if (activity.status === "training" && activity.trainingStart) {
        trainingSeconds += Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(activity.trainingStart).getTime()) / 1000,
          ),
        );
      }

      const workHours = Number((workSeconds / 3600).toFixed(2));

      const breakHours = Number((breakSeconds / 3600).toFixed(2));

      const trainingHours = Number((trainingSeconds / 3600).toFixed(2));

      const totalWorkingDay = Number(
        ((workSeconds + trainingSeconds) / 3600).toFixed(2),
      );

     let lateMinutes = 0;

const firstCheckIn =
  activity.firstCheckIn || activity.checkIn;

if (firstCheckIn) {
  const checkInIST = new Date(
    new Date(firstCheckIn).toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    }),
  );

  const expectedIST = new Date(checkInIST);

  expectedIST.setHours(10, 0, 0, 0);

  if (checkInIST > expectedIST) {
    lateMinutes = Math.floor(
      (checkInIST.getTime() - expectedIST.getTime()) /
        (1000 * 60),
    );
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
