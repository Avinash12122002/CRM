import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

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

    if (payload.role !== "case_manager" && payload.role !== "wcm") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const leadsCollection = db.collection("leads");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const stats = await leadsCollection
      .aggregate([
        {
          $match: {
            assignedTo: payload.id,
            assignedToRole: { $in: ["case_manager", "wcm"] },
          },
        },
        {
          $facet: {
            total: [{ $count: "count" }],
            // "Newly handed to me" — driven by the history entry the
            // convert-to-sales/reassign flows push, not updatedAt, so a
            // later contact-detail edit doesn't make a lead look "new".
            newAssigned: [
              {
                $match: {
                  history: {
                    $elemMatch: {
                      action: "assigned",
                      newAssignee: payload.id,
                      timestamp: { $gte: sevenDaysAgo },
                    },
                  },
                },
              },
              { $count: "count" },
            ],
            withDocument: [
              { $match: { "salesDocument.fileId": { $exists: true } } },
              { $count: "count" },
            ],
          },
        },
      ])
      .toArray();

    const result = stats[0] || {};

    const totalAssigned = result.total?.[0]?.count || 0;
    const withDocument = result.withDocument?.[0]?.count || 0;

    return NextResponse.json({
      totalAssigned,
      newAssigned: result.newAssigned?.[0]?.count || 0,
      withDocument,
      missingDocument: Math.max(totalAssigned - withDocument, 0),
    });
  } catch (err) {
    console.error("CASE MANAGER STATS ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
