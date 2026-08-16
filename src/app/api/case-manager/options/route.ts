import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// Returns every Case Manager along with how many leads currently sit with
// them, so the "convert to Sales" flow can show a dropdown like
// "Priya (3 leads)" and let the person choose who the lead goes to instead
// of always auto-assigning to the least-loaded one.
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

    const { db } = await connectToDatabase();

    const caseManagers = await db
      .collection("users")
      .find({ role: { $in: ["case_manager", "wcm"] } })
      .project({ id: 1, name: 1 })
      .sort({ name: 1 })
      .toArray();

    const loadCounts = await db
      .collection("leads")
      .aggregate([
        { $match: { assignedToRole: { $in: ["case_manager", "wcm"] } } },
        { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
      ])
      .toArray();

    const loadMap = new Map<number, number>(
      loadCounts.map((c) => [c._id, c.count as number]),
    );

    const result = caseManagers.map((cm) => ({
      id: cm.id,
      name: cm.name,
      leadCount: loadMap.get(cm.id) || 0,
    }));

    return NextResponse.json({ caseManagers: result });
  } catch (err) {
    console.error("CASE MANAGER OPTIONS ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
