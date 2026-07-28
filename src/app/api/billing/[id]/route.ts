import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BILLING_COLLECTION, BILLING_ROLES, AMOUNT_EPSILON, round2 } from "@/lib/billing/constants";

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
    const { db } = await connectToDatabase();
    const collection = db.collection(BILLING_COLLECTION);

    const existing = await collection.findOne({ id: billId });
    if (!existing) {
      return NextResponse.json({ message: "Bill not found" }, { status: 404 });
    }

    if (payload.role !== "admin" && existing.createdBy?.id !== payload.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const totalAmount = round2(Number(existing.amount) || 0);
    // Normalize legacy documents that predate paidAmount/remainingAmount.
    const currentPaid = round2(
      existing.paidAmount !== undefined ? Number(existing.paidAmount) || 0 : existing.paid ? totalAmount : 0
    );

    // --- Operation 1: record a payment (partial, or the payment that settles it) ---
    if (body.addPayment !== undefined) {
      const addPayment = round2(Number(body.addPayment));
      if (!Number.isFinite(addPayment) || addPayment <= 0) {
        return NextResponse.json({ message: "Enter a valid payment amount" }, { status: 400 });
      }

      const currentRemaining = Math.max(round2(totalAmount - currentPaid), 0);
      if (addPayment > currentRemaining + AMOUNT_EPSILON) {
        return NextResponse.json(
          { message: `Amount cannot exceed the remaining balance (Rs.${currentRemaining.toLocaleString("en-IN")})` },
          { status: 400 }
        );
      }

      const newPaidAmount = Math.min(round2(currentPaid + addPayment), totalAmount);
      const newRemainingAmount = Math.max(round2(totalAmount - newPaidAmount), 0);
      const isFullyPaid = newRemainingAmount <= AMOUNT_EPSILON;
      const now = new Date();

      await collection.updateOne(
        { id: billId },
        {
          $set: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            paid: isFullyPaid,
            paidAt: isFullyPaid ? now : existing.paidAt ?? null,
            lastPaymentAmount: addPayment,
            lastPaymentAt: now,
          },
        }
      );

      const updated = await collection.findOne({ id: billId });
      return NextResponse.json({ message: "Payment recorded", bill: updated });
    }

    // --- Operation 2: set the paid amount directly (used by "Mark Partial") ---
    // Unlike addPayment (which only adds on top), this REPLACES paidAmount —
    // so a fully-paid bill can be corrected back down to what was actually received,
    // instead of being reset all the way to 0.
    if (body.setPaidAmount !== undefined) {
      const setAmount = round2(Number(body.setPaidAmount));
      if (!Number.isFinite(setAmount) || setAmount < 0) {
        return NextResponse.json({ message: "Enter a valid amount" }, { status: 400 });
      }
      if (setAmount > totalAmount + AMOUNT_EPSILON) {
        return NextResponse.json(
          { message: `Amount cannot exceed the total bill amount (Rs.${totalAmount.toLocaleString("en-IN")})` },
          { status: 400 }
        );
      }

      const newPaidAmount = Math.min(round2(setAmount), totalAmount);
      const newRemainingAmount = Math.max(round2(totalAmount - newPaidAmount), 0);
      const isFullyPaid = newRemainingAmount <= AMOUNT_EPSILON;
      const now = new Date();

      await collection.updateOne(
        { id: billId },
        {
          $set: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            paid: isFullyPaid,
            paidAt: isFullyPaid ? now : null,
            lastPaymentAmount: newPaidAmount,
            lastPaymentAt: now,
          },
        }
      );

      const updated = await collection.findOne({ id: billId });
      return NextResponse.json({ message: "Bill updated", bill: updated });
    }

    // --- Operation 3: explicit status change — "paid" settles in full, "unpaid" resets to 0 ---
    if (body.status === "paid" || body.status === "unpaid") {
      const now = new Date();
      const markPaid = body.status === "paid";
      const settleAmount = round2(Math.max(totalAmount - currentPaid, 0));

      const paidAmount = markPaid ? totalAmount : 0;
      const remainingAmount = markPaid ? 0 : totalAmount;

      await collection.updateOne(
        { id: billId },
        {
          $set: {
            paid: markPaid,
            paidAmount,
            remainingAmount,
            paidAt: markPaid ? now : null,
            lastPaymentAmount: markPaid ? settleAmount : 0,
            lastPaymentAt: markPaid ? now : null,
          },
        }
      );

      const updated = await collection.findOne({ id: billId });
      return NextResponse.json({ message: "Bill updated", bill: updated });
    }

    return NextResponse.json({ message: "No valid update provided" }, { status: 400 });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}