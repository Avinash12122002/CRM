"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "business_development" | "billing";
};

type ByUser = {
  userId: number;
  userName: string;
  count: number;
  amount: number;
  paidCount: number;
  paidAmount: number;
  remainingAmount: number;
};

type OutstandingBill = {
  billId: number;
  invoiceNumber: string;
  clientName: string;
  passportNumber: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  createdByName: string;
  createdAt: string;
};

type Analytics = {
  date: string | null;
  month: string | null;
  filtered: boolean;
  totalInDb: number;
  totalBills: number;
  totalAmount: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  paidAmount: number;
  remainingAmount: number;
  unpaidAmount: number;
  byUser: ByUser[];
  dailyBilling: { date: string; count: number; amount: number }[];
  outstanding: OutstandingBill[];
};

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

function csv(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default function BillingAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const me = await res.json();
        if (me.role !== "admin") {
          router.push("/dashboard");
          return;
        }
        setUser(me);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const loadAnalytics = useCallback(async () => {
    const qs = new URLSearchParams();
    if (date) qs.set("date", date);
    else if (month) qs.set("month", month);
    const res = await fetch(`/api/billing/analytics?${qs.toString()}`);
    if (res.ok) setData(await res.json());
  }, [date, month]);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user, loadAnalytics]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    const scope = data.date ? `Date ${data.date}` : data.month ? `Month ${data.month}` : "All Time";
    lines.push(`Billing Analytics,${scope}`);
    lines.push("");
    lines.push("Metric,Value");
    lines.push(`Total Bills,${data.totalBills}`);
    lines.push(`Total Amount,${data.totalAmount}`);
    lines.push(`Paid Bills,${data.paidCount}`);
    lines.push(`Paid Amount,${data.paidAmount}`);
    lines.push(`Partial Bills,${data.partialCount}`);
    lines.push(`Unpaid Bills,${data.unpaidCount}`);
    lines.push(`Remaining Amount,${data.remainingAmount}`);
    lines.push("");
    lines.push(`Bills Generated Per Person (${scope})`);
    lines.push("Person,Bills Created,Total Amount,Paid Bills,Paid Amount,Remaining Amount");
    data.byUser.forEach((u) =>
      lines.push(`${csv(u.userName)},${u.count},${u.amount},${u.paidCount},${u.paidAmount},${u.remainingAmount}`)
    );
    lines.push("");
    lines.push(`Daily Billing (${scope})`);
    lines.push("Date,Bills Created,Total Amount");
    data.dailyBilling.forEach((d) => lines.push(`${d.date},${d.count},${d.amount}`));
    lines.push("");
    lines.push(`Clients With Pending Balance (${scope})`);
    lines.push("Invoice #,Client,Passport,Total,Paid,Remaining,Created By,Date");
    data.outstanding.forEach((o) =>
      lines.push(
        `${o.invoiceNumber},${csv(o.clientName)},${o.passportNumber},${o.amount},${o.paidAmount},${o.remainingAmount},${csv(o.createdByName)},${new Date(o.createdAt).toLocaleDateString("en-IN")}`
      )
    );

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-analytics-${data.date || data.month || "all-time"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const scopeLabel = data ? (data.date ? data.date : data.month ? data.month : "All Time") : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Billing Analysis</h1>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => {
                setDate(e.target.value);
                if (e.target.value) setMonth("");
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100"
            />
            <input
              type="month"
              value={month}
              max={currentMonthISO()}
              onChange={(e) => {
                setMonth(e.target.value);
                if (e.target.value) setDate("");
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100"
            />
            {(date || month) && (
              <button
                type="button"
                onClick={() => {
                  setDate("");
                  setMonth("");
                }}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                All Time
              </button>
            )}
            <button
              type="button"
              onClick={exportCSV}
              disabled={!data}
              className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        {!data ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">Showing: {scopeLabel}</p>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard label="Total Bills" value={data.totalBills} />
              <StatCard label="Total Amount" value={`Rs.${data.totalAmount.toLocaleString("en-IN")}`} />
              <StatCard label="Paid" value={`${data.paidCount} (Rs.${data.paidAmount.toLocaleString("en-IN")})`} accent="green" />
              <StatCard label="Partial" value={data.partialCount} accent="amber" />
              <StatCard
                label="Unpaid / Remaining"
                value={`${data.unpaidCount} (Rs.${data.remainingAmount.toLocaleString("en-IN")})`}
                accent="red"
              />
              <StatCard label="Total In DB" value={data.totalInDb} />
            </div>

            {/* Per-person breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Bills Generated Per Person
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Person</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bills Created</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Amount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Paid</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Paid Amount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Remaining Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.byUser.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No bills for this period
                        </td>
                      </tr>
                    ) : (
                      data.byUser.map((u) => (
                        <tr key={u.userId}>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">{u.userName}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">{u.count}</td>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">Rs.{u.amount.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">{u.paidCount}</td>
                          <td className="px-4 py-2 text-xs text-green-700 dark:text-green-400">Rs.{u.paidAmount.toLocaleString("en-IN")}</td>
                          <td className={`px-4 py-2 text-xs ${u.remainingAmount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                            Rs.{u.remainingAmount.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Clients with pending balance */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Clients With Pending Balance</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sorted by remaining amount, highest first</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invoice #</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Client</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Passport</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Paid</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Remaining</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created By</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.outstanding.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No pending balances — everyone's paid up 🎉
                        </td>
                      </tr>
                    ) : (
                      data.outstanding.map((o) => (
                        <tr key={o.billId}>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">{o.invoiceNumber}</td>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100 wrap-break-word">{o.clientName}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">{o.passportNumber}</td>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">Rs.{o.amount.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-xs text-green-700 dark:text-green-400">Rs.{o.paidAmount.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-xs text-red-600 dark:text-red-400 font-medium">Rs.{o.remainingAmount.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">{o.createdByName}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                            {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Daily Billing</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bills Created</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.dailyBilling.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No bills for this period
                        </td>
                      </tr>
                    ) : (
                      data.dailyBilling.map((d) => (
                        <tr key={d.date}>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">{d.date}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">{d.count}</td>
                          <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">Rs.{d.amount.toLocaleString("en-IN")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "green" | "red" | "amber";
}) {
  const accentClass =
    accent === "green"
      ? "text-green-600 dark:text-green-400"
      : accent === "red"
        ? "text-red-600 dark:text-red-400"
        : accent === "amber"
          ? "text-amber-600 dark:text-amber-400"
          : "text-gray-800 dark:text-gray-100";
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${accentClass}`}>{value}</p>
    </div>
  );
}