import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// Read-only lead feed for Case Managers. A case manager only ever sees the
// leads that were handed to them after conversion to "sales" — they cannot
// create, edit, or reassign anything from here. Admins can also view this
// feed (across every case manager) for oversight.
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

    if (payload.role !== "case_manager" && payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.max(parseInt(searchParams.get("limit") || "10"), 1);
    const search = searchParams.get("search") || "";
    const country = searchParams.get("country") || "";
    const assignedTo = searchParams.get("assignedTo") || "";
    const assignedBy = searchParams.get("assignedBy") || "";
    const date = searchParams.get("date") || "";

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { assignedToRole: "case_manager" };

    if (payload.role === "case_manager") {
      filter.assignedTo = payload.id;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (country) {
      filter.country = { $regex: country, $options: "i" };
    }

    // Only admins get to pick an arbitrary case manager — for a case manager
    // this is already pinned to their own id above.
    if (assignedTo && payload.role === "admin") {
      const assignedToId = parseInt(assignedTo);
      if (!isNaN(assignedToId)) {
        filter.assignedTo = assignedToId;
      }
    }

    if (assignedBy) {
      const assignedById = parseInt(assignedBy);
      if (!isNaN(assignedById)) {
        filter.assignedBy = assignedById;
      }
    }

    if (date) {
      const dayStart = new Date(date + "T00:00:00");
      const dayEnd = new Date(date + "T23:59:59.999");
      if (!isNaN(dayStart.getTime())) {
        filter.updatedAt = { $gte: dayStart, $lte: dayEnd };
      }
    }

    const total = await db.collection("leads").countDocuments(filter);

    const leads = await db
      .collection("leads")
      .find(filter)
      .project({
        id: 1,
        name: 1,
        email: 1,
        phone: 1,
        country: 1,
        jobApplied: 1,
        status: 1,
        assignedTo: 1,
        assignedToName: 1,
        assignedBy: 1,
        assignedByName: 1,
        createdAt: 1,
        updatedAt: 1,
        salesDocument: 1,
      })
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      leads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}