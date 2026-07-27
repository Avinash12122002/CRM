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
  role: "admin" | "employee" | "meeting" | "business_development" | "billing";
};

type Bill = {
  id: number;
  invoiceNumber: string;
  clientName: string;
  passportNumber: string;
  address: string;
  description: string;
  amount: number;
  org: string;
  accountNumber: string;
  bank: string;
  ifsc: string;
  upiId: string;
  paid: boolean;
  paidAt: string | null;
  createdBy: { id: number; name: string };
  createdAt: string;
};

type Summary = {
  totalBills: number;
  totalAmount: number;
  paidCount: number;
  paidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
};

const DEFAULT_DESCRIPTION = "Australia Embassy Fees Charge";
const DEFAULT_AMOUNT = "17000";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

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

  // Reset to page 1 whenever the date filter changes.
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
      const res = await fetch("/api/billing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create bill");
        return;
      }

      toast.success(`Bill ${data.bill.invoiceNumber} created`);

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

  const togglePaid = async (bill: Bill) => {
    const nextPaid = !bill.paid;
    // optimistic update
    setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, paid: nextPaid } : b)));
    try {
      const res = await fetch(`/api/billing/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: nextPaid }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || "Failed to update status");
        setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, paid: bill.paid } : b)));
        return;
      }

      // Keep the row's paidAt in sync with what the server actually stored.
      const updated: Bill | undefined = data.bill;
      if (updated) {
        setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, paidAt: updated.paidAt } : b)));
      }

      loadSummary(historyDate);

      // Marking a bill Paid confirms payment was received — download the
      // signed payment receipt automatically, filled with this bill's values.
      if (nextPaid) {
        try {
          await generateReceiptPdf({
            id: bill.id,
            invoiceNumber: bill.invoiceNumber,
            clientName: bill.clientName,
            passportNumber: bill.passportNumber,
            description: bill.description,
            amount: bill.amount,
            org: bill.org,
            paidAt: updated?.paidAt ?? new Date().toISOString(),
            createdAt: bill.createdAt,
          });
          toast.success("Marked as Paid — receipt downloaded");
        } catch (err) {
          console.error(err);
          toast.error("Marked as Paid, but the receipt download failed");
        }
      } else {
        toast.success("Marked as Unpaid");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
      setHistory((prev) => prev.map((b) => (b.id === bill.id ? { ...b, paid: bill.paid } : b)));
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Create Bill
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Client Name"
              value={form.clientName}
              onChange={(v) => handleChange("clientName", v)}
            />
            <Field
              label="Passport Number"
              value={form.passportNumber}
              onChange={(v) => handleChange("passportNumber", v)}
            />
            <div className="sm:col-span-2">
              <Field
                label="Address"
                value={form.address}
                onChange={(v) => handleChange("address", v)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Date
              </label>
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
            <Field
              label="Description"
              value={form.description}
              onChange={(v) => handleChange("description", v)}
            />
            <Field
              label="Amount (INR)"
              value={form.amount}
              onChange={(v) => handleChange("amount", v)}
              type="number"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-foreground text-background font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Bill & Download Receipt"}
          </button>
        </form>

        {/* History — date filterable, paginated */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Billing History
              </h2>
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                  {user.role === "admin" && (
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created By</th>
                  )}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {historyLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No bills found
                    </td>
                  </tr>
                ) : (
                  history.map((bill) => (
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
                      {user.role === "admin" && (
                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                          {bill.createdBy?.name || "—"}
                        </td>
                      )}
                      <td className="px-4 py-2 text-xs">
                        <button
                          type="button"
                          onClick={() => togglePaid(bill)}
                          title={bill.paid ? "Click to mark Unpaid" : "Click to mark Paid & download receipt"}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            bill.paid
                              ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60"
                              : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60"
                          }`}
                        >
                          {bill.paid ? "Paid" : "Unpaid"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 border-gray-300 dark:border-gray-700 focus:ring-blue-500"
      />
    </div>
  );
}