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

    let query: Record<string, any> = {
      role: {
        $in: [
          "admin",
          "telecaller",
          "employee",
          "meeting",
          "wtc",
          "wm",
          "supervisor",
          "case_manager",
          "wcm",
        ],
      },
    };

    if (role) {
      if (role === "meeting") {
        query = { role: { $in: ["meeting", "wm"] } };
      } else if (role === "telecaller") {
        query = { role: { $in: ["telecaller", "employee", "wtc", "supervisor"] } };
      } else if (role === "case_manager") {
        query = { role: { $in: ["case_manager", "wcm"] } };
      } else if (role.includes(",")) {
        query = { role: { $in: role.split(",").map((r) => r.trim()) } };
      } else {
        query = { role };
      }
    }

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