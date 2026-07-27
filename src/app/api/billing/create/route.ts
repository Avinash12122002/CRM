import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { getNextId } from "@/lib/auth";
import { BILLING_COLLECTION, BILLING_ROLES, BILLING_TEMPLATE } from "@/lib/billing/constants";

export async function POST(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (!BILLING_ROLES.includes(payload.role)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const clientName = (body.clientName || "").trim();
    const passportNumber = (body.passportNumber || "").trim();
    const address = (body.address || "").trim();
    const description =
      (body.description || "").trim() || BILLING_TEMPLATE.defaultDescription;
    const amount = Number(body.amount);
    const finalAmount =
      Number.isFinite(amount) && amount > 0 ? amount : BILLING_TEMPLATE.defaultAmount;

    if (!clientName || !passportNumber || !address) {
      return NextResponse.json(
        { message: "Client Name, Passport Number and Address are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const id = await getNextId(db, BILLING_COLLECTION);
    const invoiceNumber = `TMS-${String(id).padStart(5, "0")}`;

    const bill = {
      id,
      invoiceNumber,
      clientName,
      passportNumber,
      address,
      description,
      amount: finalAmount,
      // Snapshot of payment details at creation time.
      org: BILLING_TEMPLATE.orgName,
      accountNumber: BILLING_TEMPLATE.accountNumber,
      bank: BILLING_TEMPLATE.bank,
      ifsc: BILLING_TEMPLATE.ifsc,
      upiId: BILLING_TEMPLATE.upiId,
      paid: false,
      paidAt: null as Date | null,
      createdBy: { id: payload.id, name: payload.name },
      createdAt: new Date(),
    };

    await db.collection(BILLING_COLLECTION).insertOne(bill);

    return NextResponse.json({ message: "Bill created successfully", bill }, { status: 201 });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}
