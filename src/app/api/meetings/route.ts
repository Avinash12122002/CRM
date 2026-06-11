import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

// RECOMMENDED INDEXES (run once in MongoDB shell or a migration script):
// db.leads.createIndex({ "meetingDetails.meetingDate": -1, "meetingDetails.startTime": -1 })
// db.leads.createIndex({ "meetingDetails.meetingUserId": 1, "meetingDetails.meetingDate": -1 })
// db.leads.createIndex({ "assignedTo": 1, "meetingDetails.meetingDate": -1 })

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
    const page  = parseInt(searchParams.get("page")  || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip  = (page - 1) * limit;

    const { db } = await connectToDatabase();

    const filter: Record<string, any> = {
      meetingDetails: { $exists: true, $ne: null },
    };

    if (payload.role === "meeting") {
      filter["meetingDetails.meetingUserId"] = payload.id;
    } else if (payload.role === "employee") {
      filter.assignedTo = payload.id;
    }

    // ─── SINGLE AGGREGATION replaces 5 separate queries ───────────────────
    // Before: countDocuments + find + 3× countDocuments = 5 round-trips
    // After:  1 $facet pipeline = 1 round-trip
    const [result] = await db
      .collection("leads")
      .aggregate([
        { $match: filter },
        {
          $facet: {
            // Paginated rows
            data: [
              {
                $sort: {
                  "meetingDetails.meetingDate": -1,
                  "meetingDetails.startTime": -1,
                },
              },
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  id: 1,
                  name: 1,
                  phone: 1,
                  status: 1,
                  meetingStatus: 1,
                  meetingDetails: 1,
                },
              },
            ],
            // Stats — all counted in one pass, no extra queries
            stats: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  scheduled: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$meetingStatus", "scheduled"] },
                            { $eq: [{ $ifNull: ["$meetingStatus", null] }, null] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  completed: {
                    $sum: { $cond: [{ $eq: ["$meetingStatus", "completed"] }, 1, 0] },
                  },
                  cancelled: {
                    $sum: { $cond: [{ $eq: ["$meetingStatus", "cancelled"] }, 1, 0] },
                  },
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const meetings  = result.data;
    const statsRaw  = result.stats[0] ?? { total: 0, scheduled: 0, completed: 0, cancelled: 0 };
    const { total, scheduled, completed, cancelled } = statsRaw;

    return NextResponse.json({
      meetings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: { total, scheduled, completed, cancelled },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Server Error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}