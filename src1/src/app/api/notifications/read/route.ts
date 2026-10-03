import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const { notificationId } = body;

    const { db } = await connectToDatabase();

    await db.collection("notifications").updateOne(
      {
        id: notificationId,
        userId: payload.id,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Notification read",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message:
          "Server Error",
      },
      {
        status: 500,
      }
    );
  }
}