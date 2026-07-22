import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, DATA_ENTRY_ROLES, BD_ROLE } from "@/lib/bd/constants";

export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || "";
    const stage = searchParams.get("stage") || "";
    const status = searchParams.get("status") || "";
    const priority = searchParams.get("priority") || "";
    const assignedTo = searchParams.get("assignedTo") || "";
    const search = searchParams.get("search") || "";
    // Filter to leads *created* on a specific calendar day (YYYY-MM-DD),
    // interpreted in Asia/Kolkata (IST, UTC+05:30) so "that particular date"
    // matches what the user sees locally regardless of how createdAt is stored.
    const createdDate = searchParams.get("createdDate") || "";
    const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
    const limit = Math.max(parseInt(searchParams.get("limit") || "10") || 10, 1);
    // Date sort by creation time: "date_asc" (oldest first) or "date_desc"
    // (newest first, the default).
    const sortParam = searchParams.get("sort") || "date_desc";
    const sortDir = sortParam === "date_asc" ? 1 : -1;
    // "assigned" (default) = leads assigned to me (BD Pipeline view)
    // "created" = leads I personally submitted (Data Entry history view)
    const view = searchParams.get("view") || "assigned";

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    if (payload.role === BD_ROLE) {
      // Business Development: their assigned pipeline by default, or their
      // own submissions when viewing Data Entry history (view=created).
      if (view === "created") {
        filter.createdBy = payload.id;
        if (date) filter.workingDate = date;
      } else {
        filter.assignedTo = payload.id;
      }
    } else if (DATA_ENTRY_ROLES.includes(payload.role)) {
      // Sales / Meeting team: read-only view of their own submissions
      filter.createdBy = payload.id;
      if (date) filter.workingDate = date;
    } else if (payload.role === "admin") {
      // Admin: everything, with optional filters
      if (assignedTo) filter.assignedTo = parseInt(assignedTo);
    } else {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (stage) filter.pipelineStage = stage;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (createdDate) {
      const start = new Date(`${createdDate}T00:00:00.000+05:30`);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        filter.createdAt = { $gte: start, $lt: end };
      }
    }
    if (search) {
      filter.$or = [
        { companyName: { $regex: search, $options: "i" } },
        { decisionMakerName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination is opt-in: the BD Pipeline list explicitly sends page/limit.
    // The Data Entry "Today's Submitted Leads" table doesn't, so it keeps
    // getting the full unpaginated list exactly as before.
    const paginated = searchParams.has("page") || searchParams.has("limit");

    if (!paginated) {
      const leads = await db
        .collection(BD_COLLECTIONS.leads)
        .find(filter)
        .sort({ createdAt: sortDir })
        .toArray();

      return NextResponse.json({ leads });
    }

    const total = await db.collection(BD_COLLECTIONS.leads).countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    const leads = await db
      .collection(BD_COLLECTIONS.leads)
      .find(filter)
      .sort({ createdAt: sortDir })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      leads,
      pagination: { page: safePage, limit, total, totalPages },
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
