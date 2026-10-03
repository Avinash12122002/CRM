import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

async function getAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

// GET /api/email/workflows-list
export async function GET() {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { db } = await connectToDatabase();

    const workflows = await db
      .collection("lead_workflows")
      .find({ currentStage: { $ne: null } })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ workflows });
  } catch (err) {
    console.error("[GET /api/email/workflows-list]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
