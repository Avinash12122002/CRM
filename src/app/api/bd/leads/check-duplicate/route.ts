import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  getAuthPayload,
  companyNameMatchRegex,
  websiteMatchRegex,
} from "@/lib/bd/helpers";
import { BD_COLLECTIONS } from "@/lib/bd/constants";

// Live "does this already exist" check used while the user is typing in the
// Company Name / Website fields on the BD Create Lead and BD Edit Lead
// forms — NOT a submit-time validation. Called on every debounced keystroke.
//
// GET /api/bd/leads/check-duplicate?field=companyName&value=Acme+Inc
// GET /api/bd/leads/check-duplicate?field=website&value=acme.com&excludeId=42
export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const field = searchParams.get("field");
    const value = (searchParams.get("value") || "").trim();
    const excludeIdRaw = searchParams.get("excludeId");
    const excludeId = excludeIdRaw ? parseInt(excludeIdRaw) : null;

    if (field !== "companyName" && field !== "website") {
      return NextResponse.json(
        { message: "field must be 'companyName' or 'website'" },
        { status: 400 }
      );
    }

    // Nothing to check on an empty field.
    if (value.length < 1) {
      return NextResponse.json({ exists: false });
    }

    const { db } = await connectToDatabase();

    const query: Record<string, unknown> = {
      [field]: field === "companyName" ? companyNameMatchRegex(value) : websiteMatchRegex(value),
    };
    if (excludeId !== null && !Number.isNaN(excludeId)) {
      query.id = { $ne: excludeId };
    }

    const match = await db
      .collection(BD_COLLECTIONS.leads)
      .findOne(query, { projection: { id: 1, companyName: 1, website: 1, assignedToName: 1 } });

    return NextResponse.json({
      exists: !!match,
      lead: match
        ? { id: match.id, companyName: match.companyName, website: match.website, assignedToName: match.assignedToName }
        : null,
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
