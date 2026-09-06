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

    // Telecallers and Meeting users can access this endpoint
    if (
      role !== "telecaller" &&
      role !== "employee" &&
      role !== "meeting" &&
      role !== "wtc" &&
      role !== "wm" &&
      role !== "supervisor" &&
      role !== "follow_up" &&
      role !== "trainee"
    ) {
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
        assignedToRole: { $in: ["meeting", "wm"] },
        meetingStatus: "scheduled",
        "meetingDetails.meetingDate":
          todayString,
      });

    const now = new Date();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let dueMatchCondition: any;
    if (role === "follow_up") {
      dueMatchCondition = {
        $or: [
          {
            status: "follow-up",
            "followUpWorkflow.status": { $nin: ["not_interested", "completed"] },
            $or: [
              { "followUpWorkflow.nextFollowupAt": { $lte: now } },
              { "followUpWorkflow.nextFollowupAt": { $lte: now.toISOString() } },
              { followUpWorkflow: null },
              { "followUpWorkflow.currentStage": "info", "followUpWorkflow.stages.info": { $exists: false } },
            ],
          },
          {
            status: "call-back",
            callbackDate: { $ne: null },
            $or: [
              { callbackDate: { $lte: endOfToday } },
              { callbackDate: { $lte: endOfToday.toISOString() } },
            ],
          },
        ],
      };
    } else {
      dueMatchCondition = {
        status: "call-back",
        callbackDate: { $ne: null },
        $or: [
          { callbackDate: { $lte: endOfToday } },
          { callbackDate: { $lte: endOfToday.toISOString() } },
        ],
      };
    }

    let newAssignedCondition: any;
    if (role === "follow_up") {
      newAssignedCondition = {
        status: "follow-up",
      };
    } else if (role === "trainee") {
      newAssignedCondition = {
        status: "sales",
      };
    } else {
      newAssignedCondition = {
        $or: [
          { createdAt: { $gte: sevenDaysAgo } },
          { assignedAt: { $gte: sevenDaysAgo } },
        ],
      };
    }

    const stats = await leadsCollection
      .aggregate([
        {
          $match: {
            $or: [
              { assignedTo: userId },
              ...(role === "trainee" ? [{ status: "sales" }] : []),
            ],
          },
        },
        {
          $facet: {
            dueToday: [
              {
                $match: dueMatchCondition,
              },
              {
                $count: "count",
              },
            ],

            newAssigned: [
              {
                $match: newAssignedCondition,
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
      "Error fetching telecaller statistics:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch telecaller statistics",
      },
      {
        status: 500,
      },
    );
  }
}