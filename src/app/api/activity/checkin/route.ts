import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken, getNextId } from "@/lib/auth";

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

    const indiaNow = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      }),
    );

    const today = `${indiaNow.getFullYear()}-${String(
      indiaNow.getMonth() + 1,
    ).padStart(2, "0")}-${String(indiaNow.getDate()).padStart(2, "0")}`;

    // Already checked in
    const activeCheckIn = await db.collection("activities").findOne({
      userId: payload.id,
      checkOut: null,
    });

    if (activeCheckIn) {
      const activeDate = activeCheckIn.date;

      if (activeDate !== today) {
        // Auto checkout at end of previous day
        const autoCheckout = new Date(`${activeDate}T23:59:59.999+05:30`);

        let totalWorkSeconds = activeCheckIn.workSeconds || 0;

        if (activeCheckIn.status === "working") {
          totalWorkSeconds += Math.floor(
            (autoCheckout.getTime() -
              new Date(activeCheckIn.checkIn).getTime()) /
              1000,
          );
        }

        await db.collection("activities").updateOne(
          { _id: activeCheckIn._id },
          {
            $set: {
              checkOut: autoCheckout,
              workSeconds: totalWorkSeconds,
              status: "completed",
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

      workSeconds: 0,
      breakSeconds: 0,
      trainingSeconds: 0,

      breakStart: null,
      trainingStart: null,

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
