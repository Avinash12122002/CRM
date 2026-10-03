import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";

    const matches =
      cookie.match(/(^|; )token=([^;]+)/);

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

    const { db } =
      await connectToDatabase();

    const users = await db
      .collection("users")
      .find({
        id: { $ne: payload.id },
      })
      .project({
        _id: 0,
        id: 1,
        name: 1,
        username: 1,
        role: 1,
      })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({
      users,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 }
    );
  }
}