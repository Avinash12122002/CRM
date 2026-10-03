import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, DATA_ENTRY_ROLES, BD_ROLE } from "@/lib/bd/constants";

// Distinct list of countries present in the BD leads a caller can see, for
// populating the Country filter dropdown. Scoped the same way as
// /api/bd/leads/list: admins see every country in the pipeline, BD users see
// only the countries among leads assigned to them.
export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    if (payload.role === BD_ROLE) {
      filter.assignedTo = payload.id;
    } else if (DATA_ENTRY_ROLES.includes(payload.role)) {
      filter.createdBy = payload.id;
    } else if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const countries: string[] = await db
      .collection(BD_COLLECTIONS.leads)
      .distinct("country", filter);

    const sorted = countries
      .filter((c) => typeof c === "string" && c.trim())
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ countries: sorted });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
