import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { role, id: userId } = payload;

    // Only employees should access this endpoint
    if (role !== "employee" && role !== "meeting") {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const leadsCollection = db.collection("leads");

    // Get current date range for "today"
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get date for "new leads" (assigned in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Aggregate all stats in one query
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
              { $count: "count" },
            ],
            newAssigned: [
              {
                $match: {
                  createdAt: { $gte: sevenDaysAgo },
                },
              },
              { $count: "count" },
            ],
           pendingMeetings:[
              {
                $match: {
                  status: "meeting-scheduled",
                },
              },
              { $count: "count" },
            ],
          },
        },
      ])
      .toArray();

    const result = stats[0];

    return NextResponse.json({
      dueToday: result.dueToday[0]?.count || 0,
      newAssigned: result.newAssigned[0]?.count || 0,
      pendingMeetings: result.pendingMeetings[0]?.count || 0,
    });
  } catch (error) {
    console.error("Error fetching employee stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch employee statistics" },
      { status: 500 }
    );
  }
}
