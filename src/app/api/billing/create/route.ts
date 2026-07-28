import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { getNextId } from "@/lib/auth";
import {
  BILLING_COLLECTION,
  BILLING_ROLES,
  BILLING_TEMPLATE,
  AMOUNT_EPSILON,
  round2,
} from "@/lib/billing/constants";

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
    const description = (body.description || "").trim() || BILLING_TEMPLATE.defaultDescription;
    const amount = Number(body.amount);
    const finalAmount = Number.isFinite(amount) && amount > 0 ? amount : BILLING_TEMPLATE.defaultAmount;

    if (!clientName || !passportNumber || !address) {
      return NextResponse.json(
        { message: "Client Name, Passport Number and Address are required" },
        { status: 400 }
      );
    }

    // Optional up-front payment (e.g. client pays half on the spot).
    // Blank/0/missing => bill stays fully Unpaid, same as before.
    const paidAmountRaw = body.paidAmount;
    let paidAmount =
      paidAmountRaw === undefined || paidAmountRaw === null || paidAmountRaw === ""
        ? 0
        : round2(Number(paidAmountRaw));
    if (!Number.isFinite(paidAmount) || paidAmount < 0) paidAmount = 0;

    if (paidAmount > finalAmount + AMOUNT_EPSILON) {
      return NextResponse.json(
        { message: "Amount Paid cannot be more than the Total Amount" },
        { status: 400 }
      );
    }
    if (paidAmount > finalAmount) paidAmount = finalAmount; // clamp float overshoot

    const remainingAmount = Math.max(round2(finalAmount - paidAmount), 0);
    const isFullyPaid = remainingAmount <= AMOUNT_EPSILON;
    const now = new Date();

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
      org: BILLING_TEMPLATE.orgName,
      accountNumber: BILLING_TEMPLATE.accountNumber,
      bank: BILLING_TEMPLATE.bank,
      ifsc: BILLING_TEMPLATE.ifsc,
      upiId: BILLING_TEMPLATE.upiId,
      paidAmount,
      remainingAmount,
      paid: isFullyPaid,
      paidAt: isFullyPaid ? now : (null as Date | null),
      lastPaymentAmount: paidAmount > 0 ? paidAmount : 0,
      lastPaymentAt: paidAmount > 0 ? now : (null as Date | null),
      createdBy: { id: payload.id, name: payload.name },
      createdAt: now,
    };

    await db.collection(BILLING_COLLECTION).insertOne(bill);

    return NextResponse.json({ message: "Bill created successfully", bill }, { status: 201 });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}