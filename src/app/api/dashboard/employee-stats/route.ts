import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { role, id: userId } = payload;

    // Employees and Meeting users can access this endpoint
    if (role !== "employee" && role !== "meeting") {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 },
      );
    }

    const { db } = await connectToDatabase();

    const leadsCollection = db.collection("leads");

    const todayString = new Date()
      .toISOString()
      .split("T")[0];

    // Date range for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(
      sevenDaysAgo.getDate() - 7,
    );

    // Today's scheduled meetings
    const todayMeetingSlots =
      await leadsCollection.countDocuments({
        assignedTo: userId,
        assignedToRole: "meeting",
        meetingStatus: "scheduled",
        "meetingDetails.meetingDate":
          todayString,
      });

    const stats = await leadsCollection
      .aggregate([
        {
          $match: {
            assignedTo: userId,
          },
        },
        {
          $facet: {
            dueToday: [
              {
                $match: {
                  dueDate: {
                    $gte: today,
                    $lt: tomorrow,
                  },
                },
              },
              {
                $count: "count",
              },
            ],

            newAssigned: [
              {
                $match: {
                  createdAt: {
                    $gte: sevenDaysAgo,
                  },
                },
              },
              {
                $count: "count",
              },
            ],

            upcomingMeetings: [
              {
                $match: {
                  meetingStatus: "scheduled",
                },
              },
              {
                $count: "count",
              },
            ],

            completedMeetings: [
              {
                $match: {
                  meetingStatus: "completed",
                },
              },
              {
                $count: "count",
              },
            ],

            cancelledMeetings: [
              {
                $match: {
                  meetingStatus: "cancelled",
                },
              },
              {
                $count: "count",
              },
            ],
          },
        },
      ])
      .toArray();

    const result = stats[0] || {};

    return NextResponse.json({
      dueToday:
        result.dueToday?.[0]?.count || 0,

      newAssigned:
        result.newAssigned?.[0]?.count || 0,

      upcomingMeetings:
        result.upcomingMeetings?.[0]
          ?.count || 0,

      completedMeetings:
        result.completedMeetings?.[0]
          ?.count || 0,

      cancelledMeetings:
        result.cancelledMeetings?.[0]
          ?.count || 0,

      todayMeetingSlots,
    });
  } catch (error) {
    console.error(
      "Error fetching employee statistics:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch employee statistics",
      },
      {
        status: 500,
      },
    );
  }
}