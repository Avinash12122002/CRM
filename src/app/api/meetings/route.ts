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
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const { db } = await connectToDatabase();

    const filter: Record<string, any> = {
      meetingDetails: { $ne: null },
    };

    if (payload.role === "meeting") {
      filter["meetingDetails.meetingUserId"] = payload.id;
    }

    if (payload.role === "employee") {
      filter.assignedTo = payload.id;
    }

    const total = await db
      .collection("leads")
      .countDocuments(filter);

    const meetings = await db
      .collection("leads")
      .find(filter)
      .project({
        _id: 0,
        id: 1,
        name: 1,
        phone: 1,
        status: 1,
        meetingStatus: 1,
        meetingDetails: 1,
      })
      .sort({
        "meetingDetails.meetingDate": -1,
        "meetingDetails.startTime": -1,
      })
      .skip(skip)
      .limit(limit)
      .toArray();

    let stats = null;

    // Only calculate stats on first page
    if (page === 1) {
      const [scheduled, completed, cancelled] =
        await Promise.all([
          db.collection("leads").countDocuments({
            ...filter,
            $or: [
              { meetingStatus: "scheduled" },
              { meetingStatus: null },
            ],
          }),

          db.collection("leads").countDocuments({
            ...filter,
            meetingStatus: "completed",
          }),

          db.collection("leads").countDocuments({
            ...filter,
            meetingStatus: "cancelled",
          }),
        ]);

      stats = {
        total,
        scheduled,
        completed,
        cancelled,
      };
    }

    return NextResponse.json({
      meetings,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },

      stats,
    });
  } catch (err) {
    console.error(err);

    const errorMessage =
      err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server Error",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}