import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BILLING_COLLECTION, BILLING_ROLES, round2 } from "@/lib/billing/constants";

function dayWindow(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (!BILLING_ROLES.includes(payload.role)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (validDate) {
      const { start, end } = dayWindow(validDate);
      filter.createdAt = { $gte: start, $lt: end };
    }
    if (payload.role !== "admin") {
      filter["createdBy.id"] = payload.id;
    }

    const collection = db.collection(BILLING_COLLECTION);
    const bills = await collection
      .find(filter, { projection: { amount: 1, paid: 1, paidAmount: 1, remainingAmount: 1 } })
      .toArray();

    let totalAmount = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let collectedAmount = 0;
    let remainingAmount = 0;

    for (const bill of bills) {
      const amount = Number(bill.amount) || 0;
      const billPaidAmount =
        bill.paidAmount !== undefined ? Number(bill.paidAmount) || 0 : bill.paid ? amount : 0;
      const billRemaining =
        bill.remainingAmount !== undefined
          ? Number(bill.remainingAmount) || 0
          : Math.max(amount - billPaidAmount, 0);

      totalAmount += amount;
      collectedAmount += billPaidAmount;
      remainingAmount += billRemaining;

      if (billRemaining <= 0.01) paidCount += 1;
      else if (billPaidAmount > 0) partialCount += 1;
      else unpaidCount += 1;
    }

    return NextResponse.json({
      date: validDate || null,
      totalBills: bills.length,
      totalAmount: round2(totalAmount),
      paidCount,
      partialCount,
      unpaidCount,
      paidAmount: round2(collectedAmount),
      remainingAmount: round2(remainingAmount),
      unpaidAmount: round2(remainingAmount),
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}