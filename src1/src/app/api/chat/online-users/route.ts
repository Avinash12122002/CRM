import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token = matches
      ? matches[2]
      : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { db } =
      await connectToDatabase();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const onlineUsers = await db
      .collection("activities")
      .aggregate([
        {
          $match: {
            checkOut: null,
            $or: [
              { lastHeartbeatAt: { $gte: fiveMinutesAgo } },
              { updatedAt: { $gte: fiveMinutesAgo } },
              { checkIn: { $gte: fiveMinutesAgo } },
            ],
          },
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
          $unwind: "$user",
        },
        {
          $project: {
            _id: 0,
            userId: "$user.id",
            userName: "$user.name",
            username: "$user.username",
            role: "$user.role",
            online: true,
            status: "$status",
            lastSeen: { $ifNull: ["$lastHeartbeatAt", "$updatedAt"] },
          },
        },
        {
          $sort: { userName: 1 },
        },
      ])
      .toArray();

    return NextResponse.json({
      onlineUsers,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 },
    );
  }
}
