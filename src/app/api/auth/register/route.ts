import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { hashPassword, getNextId, verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // Only admin can create users
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);

    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, username, password, role } = body;

    if (!name || !username || !password || !role) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    // Allow only employee and meeting roles
    if (!["employee", "meeting"].includes(role)) {
      return NextResponse.json({ message: "Invalid role" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const existing = await db.collection("users").findOne({ username });

    if (existing) {
      return NextResponse.json(
        { message: "Username already exists" },
        { status: 409 },
      );
    }

    const id = await getNextId(db, "users");

    const user = {
      id,
      name,
      username,
      role,
      password_hash: hashPassword(password),
      createdAt: new Date(),
    };

    await db.collection("users").insertOne(user);

    return NextResponse.json(
      {
        message: `${
          role === "meeting" ? "Meeting user" : "Employee"
        } created successfully`,
        user: {
          id,
          name,
          username,
          role,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
