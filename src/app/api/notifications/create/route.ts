import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId, verifyToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
) {
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
    const body =
      await req.json();

    const {
      userId,
      title,
      message,
      type,
      link,
    } = body;

    if (!userId || !message) {
      return NextResponse.json(
        {
          message:
            "userId and message are required",
        },
        { status: 400 },
      );
    }

    const { db } =
      await connectToDatabase();

    const id =
      await getNextId(
        db,
        "notifications",
      );

    await db
      .collection("notifications")
      .insertOne({
        id,
        userId,
        title,
        message,
        type: type || "general",
        link: link || null,
        read: false,
        createdAt: new Date(),
      });

    return NextResponse.json({
      message: "Notification created",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 },
    );
  }
}
