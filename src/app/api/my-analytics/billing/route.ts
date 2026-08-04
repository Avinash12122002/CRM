import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { BILLING_COLLECTION, round2, getBillStatus } from "@/lib/billing/constants";

function getISTDateStr(raw: any): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getISTMonthStr(raw: any): string | null {
  const istDate = getISTDateStr(raw);
  return istDate ? istDate.slice(0, 7) : null;
}

function isDateInCohort(rawDate: any, validDate: string, validMonth: string): boolean {
  if (validDate) {
    return getISTDateStr(rawDate) === validDate;
  }
  if (validMonth) {
    return getISTMonthStr(rawDate) === validMonth;
  }
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (payload.role !== "billing") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";
    const monthParam = searchParams.get("month") || "";
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    const validMonth = !validDate && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";

    const { db } = await connectToDatabase();

    // All bills created by this user (createdBy is an object { id, name })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allBills: any[] = await db
      .collection(BILLING_COLLECTION)
      .find({ "createdBy.id": payload.id })
      .sort({ createdAt: -1 })
      .toArray();
    const totalInDb = allBills.length;
    const isFiltered = !!(validDate || validMonth);

    const cohort = isFiltered
      ? allBills.filter((b) => isDateInCohort(b.createdAt || b.updatedAt, validDate, validMonth))
      : allBills;

    // Compute metrics on cohort
    let totalAmount = 0, paidAmount = 0;
    let paidCount = 0, partialCount = 0, unpaidCount = 0;

    for (const b of cohort) {
      const amt = b.amount || 0;
      const paid = b.paidAmount || 0;
      totalAmount = round2(totalAmount + amt);
      paidAmount = round2(paidAmount + paid);
      const st = getBillStatus(amt, paid);
      if (st === "paid") paidCount++;
      else if (st === "partial") partialCount++;
      else unpaidCount++;
    }
    const remainingAmount = round2(totalAmount - paidAmount);
    const unpaidAmount = round2(
      cohort
        .filter((b) => getBillStatus(b.amount || 0, b.paidAmount || 0) === "unpaid")
        .reduce((s, b) => s + (b.amount || 0), 0)
    );

    // Full daily history trend (ALL dates in cohort)
    const trendMap = new Map<string, { count: number; amount: number }>();
    for (const b of cohort) {
      const day = getISTDateStr(b.createdAt || b.updatedAt);
      if (!day) continue;
      const prev = trendMap.get(day) || { count: 0, amount: 0 };
      trendMap.set(day, { count: prev.count + 1, amount: round2(prev.amount + (b.amount || 0)) });
    }
    const dailyTrend = Array.from(trendMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Outstanding bills (partial or unpaid) in cohort
    const outstanding = cohort
      .filter((b) => {
        const st = getBillStatus(b.amount || 0, b.paidAmount || 0);
        return st === "partial" || st === "unpaid";
      })
      .slice(0, 15)
      .map((b) => ({
        billId: b.id,
        invoiceNumber: b.invoiceNumber,
        clientName: b.clientName,
        passportNumber: b.passportNumber,
        amount: b.amount,
        paidAmount: b.paidAmount || 0,
        remainingAmount: round2((b.amount || 0) - (b.paidAmount || 0)),
        createdAt: b.createdAt,
        status: getBillStatus(b.amount || 0, b.paidAmount || 0),
      }));

    // Paginated history of all bills in cohort
    const page = Math.max(1, pageParam);
    const limit = Math.max(1, limitParam);
    const total = cohort.length;
    const totalPages = Math.ceil(total / limit) || 0;
    const startIndex = (page - 1) * limit;
    const paginatedBills = cohort.slice(startIndex, startIndex + limit).map((b) => ({
      billId: b.id,
      invoiceNumber: b.invoiceNumber || String(b.id),
      clientName: b.clientName || "—",
      passportNumber: b.passportNumber || "—",
      amount: b.amount || 0,
      paidAmount: b.paidAmount || 0,
      remainingAmount: round2((b.amount || 0) - (b.paidAmount || 0)),
      status: getBillStatus(b.amount || 0, b.paidAmount || 0),
      createdAt: b.createdAt || null,
    }));

    return NextResponse.json({
      date: validDate || null, month: validMonth || null, filtered: isFiltered, totalInDb,
      metrics: {
        totalBills: cohort.length, totalAmount, paidAmount, remainingAmount,
        paidCount, partialCount, unpaidCount, unpaidAmount,
      },
      dailyTrend, outstanding,
      history: {
        items: paginatedBills,
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
