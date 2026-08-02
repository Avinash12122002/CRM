"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import { generateInvoicePdf } from "@/lib/billing/generateInvoicePdf";
import { generateReceiptPdf } from "@/lib/billing/generateReceiptPdf";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "business_development" | "billing";
};

type Bill = {
  id: number;
  invoiceNumber: string;
  clientName: string;
  passportNumber: string;
  address: string;
  description: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  org: string;
  accountNumber: string;
  bank: string;
  ifsc: string;
  upiId: string;
  paid: boolean;
  paidAt: string | null;
  lastPaymentAmount?: number;
  lastPaymentAt?: string | null;
  createdBy: { id: number; name: string };
  createdAt: string;
};

type Summary = {
  totalBills: number;
  totalAmount: number;
  paidCount: number;
  partialCount: number;
  paidAmount: number;
  unpaidCount: number;
  remainingAmount: number;
};

const DEFAULT_DESCRIPTION = "Australia Embassy Fees Charge";
const DEFAULT_AMOUNT = "17000";
const AMOUNT_EPSILON = 0.01;

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function billRemaining(bill: Bill) {
  return bill.remainingAmount ?? Math.max(bill.amount - (bill.paidAmount ?? 0), 0);
}
function billPaidAmount(bill: Bill) {
  return bill.paidAmount ?? (bill.paid ? bill.amount : 0);
}
function billStatus(bill: Bill): "paid" | "partial" | "unpaid" {
  const remaining = billRemaining(bill);
  if (remaining <= AMOUNT_EPSILON) return "paid";
  return billPaidAmount(bill) > 0 ? "partial" : "unpaid";
}

// NOTE: there is intentionally no "paidAmount" field in the create form.
// Every bill is created Unpaid — whether/how much the client has paid is
// decided afterwards from Billing History (Mark Paid / Mark Partial /
// + Payment), never at invoice-creation time.
const emptyForm = {
  clientName: "",
  passportNumber: "",
  address: "",
  description: DEFAULT_DESCRIPTION,
  amount: DEFAULT_AMOUNT,
};

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState<Bill[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDate, setHistoryDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const me = await res.json();
        if (!["admin", "billing"].includes(me.role)) {
          router.push("/dashboard");
          return;
        }
        setUser(me);
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const loadHistory = useCallback(async (targetPage: number, date: string) => {
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(targetPage));
      qs.set("limit", String(limit));
      if (date) qs.set("date", date);
      const res = await fetch(`/api/billing/list?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.bills || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadHistory(page, historyDate);
  }, [user, page, historyDate, loadHistory]);

  useEffect(() => {
    setPage(1);
  }, [historyDate]);

  const loadSummary = useCallback(async (date: string) => {
    try {
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      const res = await fetch(`/api/billing/summary?${qs.toString()}`);
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSummary(historyDate);
  }, [user, historyDate, loadSummary]);

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.clientName.trim() || !form.passportNumber.trim() || !form.address.trim()) {
      toast.error("Client Name, Passport Number and Address are required");
      return;
    }

    setSubmitting(true);
    try {
      // paidAmount is always sent as 0 — every bill starts Unpaid. Whether
      // the client has paid is decided later from Billing History.
      const res = await fetch("/api/billing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, paidAmount: "0" }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create bill");
        return;
      }

      toast.success(`Bill ${data.bill.invoiceNumber} created — status Unpaid`);

      try {
        await generateInvoicePdf(data.bill);
      } catch (err) {
        console.error(err);
        toast.error("Bill saved, but the PDF download failed");
      }

      setForm({ ...emptyForm });
      if (page === 1 && !historyDate) {
        loadHistory(1, historyDate);
      } else {
        setPage(1);
        setHistoryDate("");
      }
      loadSummary(historyDate);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create bill");
    } finally {
      setSubmitting(false);
    }
  };

  // Fully settle a bill (Unpaid or Partial -> Paid).
  const markPaid = async (bill: Bill) => {
    if (!window.confirm(`Mark invoice ${bill.invoiceNumber} as fully Paid?\nA receipt will be downloaded.`)) {
      return;
    }
    const prevSnapshot = { paid: bill.paid, paidAmount: bill.paidAmount, remainingAmount: bill.remainingAmount };
    setHistory((prev) =>
      prev.map((b) => (b.id === bill.id ? { ...b, paid: true, paidAmount: b.amount, remainingAmount: 0 } : b))
    );
    try {
      const res = await fetch(`/api/billing/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || "Failed to update status");
        setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, ...prevSnapshot } : b)));
        return;
      }

      const updated: Bill | undefined = data.bill;
      if (updated) {
        setHistory((prev) =>
          prev.map((b) =>
            b.id === bill.id
              ? { ...b, paid: updated.paid, paidAt: updated.paidAt, paidAmount: updated.paidAmount, remainingAmount: updated.remainingAmount }
              : b
          )
        );
      }

      loadSummary(historyDate);

      try {
        await generateReceiptPdf({
          id: bill.id,
          invoiceNumber: bill.invoiceNumber,
          clientName: bill.clientName,
          passportNumber: bill.passportNumber,
          description: bill.description,
          amount: bill.amount,
          paidAmount: updated?.paidAmount ?? bill.amount,
          org: bill.org,
          paidAt: updated?.paidAt ?? new Date().toISOString(),
          createdAt: bill.createdAt,
        });
        toast.success("Marked as Paid — receipt downloaded");
      } catch (err) {
        console.error(err);
        toast.error("Marked as Paid, but the receipt download failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
      setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, ...prevSnapshot } : b)));
    }
  };

  // Reset a bill fully back to Unpaid (discards any recorded payments — use with care).
  const markUnpaid = async (bill: Bill) => {
    if (
      !window.confirm(
        `Reset invoice ${bill.invoiceNumber} to Unpaid?\nThis clears the recorded payment amount back to Rs.0.\n\nIf you just want to correct the paid amount, use "Mark Partial" instead.`
      )
    ) {
      return;
    }
    const prevSnapshot = { paid: bill.paid, paidAmount: bill.paidAmount, remainingAmount: bill.remainingAmount };
    setHistory((prev) =>
      prev.map((b) => (b.id === bill.id ? { ...b, paid: false, paidAmount: 0, remainingAmount: b.amount } : b))
    );
    try {
      const res = await fetch(`/api/billing/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "unpaid" }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || "Failed to update status");
        setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, ...prevSnapshot } : b)));
        return;
      }

      const updated: Bill | undefined = data.bill;
      if (updated) {
        setHistory((prev) =>
          prev.map((b) =>
            b.id === bill.id
              ? { ...b, paid: updated.paid, paidAt: updated.paidAt, paidAmount: updated.paidAmount, remainingAmount: updated.remainingAmount }
              : b
          )
        );
      }
      loadSummary(historyDate);
      toast.success("Marked as Unpaid");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
      setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, ...prevSnapshot } : b)));
    }
  };

  // Move a fully Paid bill back down to the amount that was actually received
  // (e.g. correcting a mistaken "Mark Paid") — without wiping it to 0.
  // Also used to directly set/correct a partial amount. Now generates a
  // receipt for the resulting paid amount, same as recordPayment/markPaid —
  // this was the bug: the first partial payment via this button used to
  // silently skip the receipt.
  const markPartial = async (bill: Bill) => {
    const input = window.prompt(
      `Total Amount: Rs.${bill.amount.toLocaleString("en-IN")}\nEnter the amount that was actually paid:`,
      ""
    );
    if (input === null) return;

    const amount = Number(input);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amount > bill.amount + AMOUNT_EPSILON) {
      toast.error(`Amount cannot exceed the total amount (Rs.${bill.amount.toLocaleString("en-IN")})`);
      return;
    }
    if (
      !window.confirm(
        `Set amount paid to Rs.${amount.toLocaleString("en-IN")} for invoice ${bill.invoiceNumber}?\nRemaining balance will be Rs.${Math.max(bill.amount - amount, 0).toLocaleString("en-IN")}.`
      )
    ) {
      return;
    }

    const prevSnapshot = { paid: bill.paid, paidAmount: bill.paidAmount, remainingAmount: bill.remainingAmount };
    const newRemaining = Math.max(round2(bill.amount - amount), 0);
    setHistory((prev) =>
      prev.map((b) =>
        b.id === bill.id ? { ...b, paid: newRemaining <= AMOUNT_EPSILON, paidAmount: amount, remainingAmount: newRemaining } : b
      )
    );

    try {
      const res = await fetch(`/api/billing/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setPaidAmount: amount }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || "Failed to update amount");
        setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, ...prevSnapshot } : b)));
        return;
      }

      const updated: Bill | undefined = data.bill;
      if (updated) {
        setHistory((prev) =>
          prev.map((b) =>
            b.id === bill.id
              ? { ...b, paid: updated.paid, paidAt: updated.paidAt, paidAmount: updated.paidAmount, remainingAmount: updated.remainingAmount }
              : b
          )
        );
      }
      loadSummary(historyDate);

      try {
        await generateReceiptPdf({
          id: bill.id,
          invoiceNumber: bill.invoiceNumber,
          clientName: bill.clientName,
          passportNumber: bill.passportNumber,
          description: bill.description,
          amount: bill.amount,
          paidAmount: updated?.paidAmount ?? amount,
          org: bill.org,
          paidAt: updated?.lastPaymentAt ?? new Date().toISOString(),
          createdAt: bill.createdAt,
        });
        toast.success("Bill updated — receipt downloaded");
      } catch (err) {
        console.error(err);
        toast.error("Bill updated, but the receipt download failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update amount");
      setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, ...prevSnapshot } : b)));
    }
  };

  // "+ Payment" — record a partial (or final) payment on top of what's already
  // been paid. Generates a receipt every single time it's used, so a client
  // paying 10000 then 2000 later gets two receipts, each showing the
  // cumulative amount paid and remaining balance at that point.
  const recordPayment = async (bill: Bill) => {
    const remaining = billRemaining(bill);
    const input = window.prompt(
      `Remaining balance: Rs.${remaining.toLocaleString("en-IN")}\nEnter amount received now:`,
      String(remaining)
    );
    if (input === null) return;

    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (amount > remaining + AMOUNT_EPSILON) {
      toast.error(`Amount cannot exceed the remaining balance (Rs.${remaining.toLocaleString("en-IN")})`);
      return;
    }
    if (!window.confirm(`Record a payment of Rs.${amount.toLocaleString("en-IN")} for invoice ${bill.invoiceNumber}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/billing/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addPayment: amount }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || "Failed to record payment");
        return;
      }

      const updated: Bill | undefined = data.bill;
      if (updated) {
        setHistory((prev) =>
          prev.map((b) =>
            b.id === bill.id
              ? { ...b, paid: updated.paid, paidAt: updated.paidAt, paidAmount: updated.paidAmount, remainingAmount: updated.remainingAmount }
              : b
          )
        );
      }

      loadSummary(historyDate);

      try {
        await generateReceiptPdf({
          id: bill.id,
          invoiceNumber: bill.invoiceNumber,
          clientName: bill.clientName,
          passportNumber: bill.passportNumber,
          description: bill.description,
          amount: bill.amount,
          paidAmount: updated?.paidAmount ?? billPaidAmount(bill) + amount,
          org: bill.org,
          paidAt: updated?.lastPaymentAt ?? new Date().toISOString(),
          createdAt: bill.createdAt,
        });
        toast.success("Payment recorded — receipt downloaded");
      } catch (err) {
        console.error(err);
        toast.error("Payment recorded, but the receipt download failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to record payment");
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const actionColSpan = user.role === "admin" ? 10 : 9;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Billing</h1>
          {summary && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {historyDate
                ? new Date(historyDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                : "All time"}
            </p>
          )}
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
            <StatCard label="Total Invoices" value={summary.totalBills} />
            <StatCard label="Total Amount" value={`Rs.${summary.totalAmount.toLocaleString("en-IN")}`} />
            <StatCard label="Collected" value={`Rs.${summary.paidAmount.toLocaleString("en-IN")}`} accent="green" />
            <StatCard
              label="Remaining"
              value={`Rs.${summary.remainingAmount.toLocaleString("en-IN")}`}
              accent={summary.remainingAmount > 0 ? "red" : undefined}
            />
            <StatCard
              label="Paid / Partial / Unpaid"
              value={`${summary.paidCount} / ${summary.partialCount} / ${summary.unpaidCount}`}
            />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Create Bill</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Every bill is created as <strong>Unpaid</strong>. Once the client actually pays, update the
            status from Billing History below (Mark Paid, Mark Partial, or + Payment).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client Name" value={form.clientName} onChange={(v) => handleChange("clientName", v)} />
            <Field
              label="Passport Number"
              value={form.passportNumber}
              onChange={(v) => handleChange("passportNumber", v)}
            />
            <div className="sm:col-span-2">
              <Field label="Address" value={form.address} onChange={(v) => handleChange("address", v)} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Date</label>
              <input
                type="text"
                value={new Date(todayISO()).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                disabled
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              />
            </div>
            <Field label="Description" value={form.description} onChange={(v) => handleChange("description", v)} />
            <Field label="Total Amount (INR)" value={form.amount} onChange={(v) => handleChange("amount", v)} type="number" />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-foreground text-background font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Bill & Download Invoice"}
          </button>
        </form>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Billing History</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {total} bill{total === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={historyDate}
                max={todayISO()}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {historyDate && (
                <button
                  type="button"
                  onClick={() => setHistoryDate("")}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invoice #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Client</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Passport</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Paid</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Remaining</th>
                  {user.role === "admin" && (
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created By</th>
                  )}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {historyLoading ? (
                  <tr>
                    <td colSpan={actionColSpan} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={actionColSpan} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No bills found
                    </td>
                  </tr>
                ) : (
                  history.map((bill) => {
                    const status = billStatus(bill);
                    const remaining = billRemaining(bill);
                    return (
                      <tr key={bill.id}>
                        <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">{bill.invoiceNumber}</td>
                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                          {new Date(bill.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100 wrap-break-word">{bill.clientName}</td>
                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">{bill.passportNumber}</td>
                        <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">
                          Rs.{bill.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2 text-xs text-green-700 dark:text-green-400">
                          Rs.{billPaidAmount(bill).toLocaleString("en-IN")}
                        </td>
                        <td className={`px-4 py-2 text-xs ${remaining > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                          Rs.{remaining.toLocaleString("en-IN")}
                        </td>
                        {user.role === "admin" && (
                          <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                            {bill.createdBy?.name || "—"}
                          </td>
                        )}
                        <td className="px-4 py-2 text-xs">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              status === "paid"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : status === "partial"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }`}
                          >
                            {status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <div className="flex flex-nowrap items-center gap-1.5">
                            {status === "paid" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => markUnpaid(bill)}
                                  title="Reset fully to Unpaid"
                                  className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 whitespace-nowrap"
                                >
                                  Mark Unpaid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => markPartial(bill)}
                                  title="Correct the amount actually paid"
                                  className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-900/60 whitespace-nowrap"
                                >
                                  Mark Partial
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => markPaid(bill)}
                                  title="Mark fully Paid & download receipt"
                                  className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60 whitespace-nowrap"
                                >
                                  Mark Paid
                                </button>
                                {status !== "unpaid" && (
                                  <button
                                    type="button"
                                    onClick={() => markUnpaid(bill)}
                                    title="Reset to Unpaid"
                                    className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 whitespace-nowrap"
                                  >
                                    Mark Unpaid
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => recordPayment(bill)}
                                  title="Record a partial payment"
                                  className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60 whitespace-nowrap"
                                >
                                  + Payment
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "green" | "red" }) {
  const accentClass =
    accent === "green"
      ? "text-green-600 dark:text-green-400"
      : accent === "red"
        ? "text-red-600 dark:text-red-400"
        : "text-gray-800 dark:text-gray-100";
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${accentClass}`}>{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 border-gray-300 dark:border-gray-700 focus:ring-blue-500"
      />
    </div>
  );
}