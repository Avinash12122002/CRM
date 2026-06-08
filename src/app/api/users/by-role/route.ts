import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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

    const role = new URL(req.url).searchParams.get("role");

    const { db } = await connectToDatabase();

const query = role ? { role } : { role: { $in: ["admin", "employee", "meeting"] }};

const users = await db
  .collection("users")
  .find(query)
  .project({
    id: 1,
    name: 1,
    username: 1,
    role: 1,
  })
  .toArray();

    return NextResponse.json({ users });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 }
    );
  }
}