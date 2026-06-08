import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
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

  // expose limited user info
  return NextResponse.json({
    id: payload.id,
    name: payload.name,
    email: payload.email,
    role: payload.role,
  });
}
