import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BILLING_COLLECTION, BILLING_ROLES } from "@/lib/billing/constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (!BILLING_ROLES.includes(payload.role)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const billId = parseInt(id, 10);
    if (!Number.isFinite(billId)) {
      return NextResponse.json({ message: "Invalid bill id" }, { status: 400 });
    }

    const body = await req.json();
    const paid = Boolean(body.paid);

    const { db } = await connectToDatabase();
    const collection = db.collection(BILLING_COLLECTION);

    const existing = await collection.findOne({ id: billId });
    if (!existing) {
      return NextResponse.json({ message: "Bill not found" }, { status: 404 });
    }

    // Billing users may only update their own bills; Admin can update any.
    if (payload.role !== "admin" && existing.createdBy?.id !== payload.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    await collection.updateOne(
      { id: billId },
      { $set: { paid, paidAt: paid ? new Date() : null } }
    );

    const updated = await collection.findOne({ id: billId });

    return NextResponse.json({ message: "Bill updated", bill: updated });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}
