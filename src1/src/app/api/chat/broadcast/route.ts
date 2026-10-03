import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken, getNextId } from "@/lib/auth";

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

    const broadcasts = await db
      .collection("broadcasts")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      broadcasts,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
) {
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

    if (payload.role !== "admin") {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await req.json();

    const { message } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { message: "Message is required" },
        { status: 400 },
      );
    }

    const { db } =
      await connectToDatabase();

    const id = await getNextId(db, "broadcasts");

    await db.collection("broadcasts").insertOne({
      id,
      senderId: payload.id,
      senderName: payload.name,
      message,
      createdAt: new Date(),
    });

    return NextResponse.json({
      message: "Broadcast sent",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 },
    );
  }
}
