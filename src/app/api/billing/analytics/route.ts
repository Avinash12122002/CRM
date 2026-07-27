import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthPayload } from "@/lib/bd/helpers";
import { BILLING_COLLECTION } from "@/lib/billing/constants";

// Same optional Date (YYYY-MM-DD) / Month (YYYY-MM) filter model used by
// BD Analytics / Lead Analytics. Neither selected -> lifetime "All Time".

function dayWindow(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function monthWindow(monthStr: string): { start: Date; end: Date } {
  const [y, m] = monthStr.split("-").map((v) => parseInt(v, 10));
  const start = new Date(`${monthStr}-01T00:00:00.000+05:30`);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000+05:30`);
  return { start, end };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bill = any;

export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();
    const collection = db.collection(BILLING_COLLECTION);

    let cohortWindow: { start: Date; end: Date } | null = null;
    if (validDate) cohortWindow = dayWindow(validDate);
    else if (validMonth) cohortWindow = monthWindow(validMonth);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = cohortWindow
      ? { createdAt: { $gte: cohortWindow.start, $lt: cohortWindow.end } }
      : {};

    const [bills, totalInDb] = await Promise.all([
      collection.find(filter).sort({ createdAt: -1 }).toArray(),
      collection.countDocuments({}),
    ]);

    let totalAmount = 0;
    let paidCount = 0;
    let paidAmount = 0;
    let unpaidCount = 0;
    let unpaidAmount = 0;

    const byUserMap = new Map<
      number,
      { userId: number; userName: string; count: number; amount: number; paidCount: number; paidAmount: number }
    >();
    const dailyMap = new Map<string, { date: string; count: number; amount: number }>();

    bills.forEach((bill: Bill) => {
      const amount = Number(bill.amount) || 0;
      totalAmount += amount;

      if (bill.paid) {
        paidCount += 1;
        paidAmount += amount;
      } else {
        unpaidCount += 1;
        unpaidAmount += amount;
      }

      const uid = bill.createdBy?.id ?? 0;
      const uname = bill.createdBy?.name || "Unknown";
      const existingUser = byUserMap.get(uid) || {
        userId: uid,
        userName: uname,
        count: 0,
        amount: 0,
        paidCount: 0,
        paidAmount: 0,
      };
      existingUser.count += 1;
      existingUser.amount += amount;
      if (bill.paid) {
        existingUser.paidCount += 1;
        existingUser.paidAmount += amount;
      }
      byUserMap.set(uid, existingUser);

      const dayKey = new Date(bill.createdAt).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
      const existingDay = dailyMap.get(dayKey) || { date: dayKey, count: 0, amount: 0 };
      existingDay.count += 1;
      existingDay.amount += amount;
      dailyMap.set(dayKey, existingDay);
    });

    const byUser = Array.from(byUserMap.values())
      .map((u) => ({ ...u, amount: round2(u.amount), paidAmount: round2(u.paidAmount) }))
      .sort((a, b) => b.amount - a.amount);

    const dailyBilling = Array.from(dailyMap.values())
      .map((d) => ({ ...d, amount: round2(d.amount) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return NextResponse.json({
      date: validDate || null,
      month: validMonth || null,
      filtered: Boolean(validDate || validMonth),
      totalInDb,
      totalBills: bills.length,
      totalAmount: round2(totalAmount),
      paidCount,
      paidAmount: round2(paidAmount),
      unpaidCount,
      unpaidAmount: round2(unpaidAmount),
      byUser,
      dailyBilling,
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Server error", error: errorMessage }, { status: 500 });
  }
}
