"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting" | "business_development";
};

type Analytics = {
  date: string | null;
  month: string | null;
  filtered: boolean;
  totalInDb: number;
  statusDistribution: { status: string; label: string; count: number }[];
  employeePerformance: {
    userId: number;
    userName: string;
    newLeads: number;
    callBack: number;
    notAnswering: number;
    documentPending: number;
    paymentPending: number;
    sales: number;
  }[];
  meetingPerformance: {
    userId: number;
    userName: string;
    newLeads: number;
    callBack: number;
    notAnswering: number;
    meetingScheduled: number;
    documentPending: number;
    paymentPending: number;
    sales: number;
  }[];
  metrics: {
    totalLeads: number;
    newLeads: number;
    inProgress: number;
    meetingsScheduled: number;
    sales: number;
    lost: number;
    meetingEfficiency: number;
    conversionRate: number;
    dropRate: number;
  };
  employeeLeaderboard: {
    rank: number;
    userId: number;
    userName: string;
    leads: number;
    sales: number;
    successPercent: number;
  }[];
  meetingLeaderboard: {
    rank: number;
    userId: number;
    userName: string;
    meetings: number;
    sales: number;
    successPercent: number;
  }[];
};

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

export default function LeadAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Both filters start EMPTY — no filter applied means "show everything".
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
    // Neither selected -> no query params -> backend returns all-time data.
    const res = await fetch(`/api/leads/analytics?${qs.toString()}`);
    if (res.ok) setData(await res.json());
  }, [date, month]);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user, loadAnalytics]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    const scope = data.date ? `Date ${data.date}` : data.month ? `Month ${data.month}` : "All Time";
    lines.push(`Lead Analytics,${scope}`);
    lines.push("");
    lines.push("Metric,Value");
    lines.push(`Total Leads,${data.metrics.totalLeads}`);
    lines.push(`New Leads,${data.metrics.newLeads}`);
    lines.push(`In Progress,${data.metrics.inProgress}`);
    lines.push(`Meetings Scheduled,${data.metrics.meetingsScheduled}`);
    lines.push(`Sales (Converted),${data.metrics.sales}`);
    lines.push(`Lost,${data.metrics.lost}`);
    lines.push(`Meeting Efficiency %,${data.metrics.meetingEfficiency}`);
    lines.push(`Conversion Rate %,${data.metrics.conversionRate}`);
    lines.push(`Drop Rate %,${data.metrics.dropRate}`);
    lines.push("");
    lines.push(`Employee Performance (${scope})`);
    lines.push("Employee,New Lead,Call Back,Not Answering,Document Pending,Payment Pending,Sales");
    data.employeePerformance.forEach((a) =>
      lines.push(
        `${csv(a.userName)},${a.newLeads},${a.callBack},${a.notAnswering},${a.documentPending},${a.paymentPending},${a.sales}`
      )
    );
    lines.push("");
    lines.push(`Meeting User Performance (${scope})`);
    lines.push(
      "Meeting User,New Lead,Call Back,Not Answering,Meeting Scheduled,Document Pending,Payment Pending,Sales"
    );
    data.meetingPerformance.forEach((a) =>
      lines.push(
        `${csv(a.userName)},${a.newLeads},${a.callBack},${a.notAnswering},${a.meetingScheduled},${a.documentPending},${a.paymentPending},${a.sales}`
      )
    );
    lines.push("");
    lines.push(`Status Distribution (${scope})`);
    lines.push("Status,Count");
    data.statusDistribution.forEach((s) => lines.push(`${csv(s.label)},${s.count}`));
    lines.push("");
    lines.push(`Employee Leaderboard (${scope})`);
    lines.push("Rank,Employee,Leads,Sales,Success %");
    data.employeeLeaderboard.forEach((l) =>
      lines.push(`${l.rank},${csv(l.userName)},${l.leads},${l.sales},${l.successPercent}`)
    );
    lines.push("");
    lines.push(`Meeting Leaderboard (${scope})`);
    lines.push("Rank,Meeting User,Meetings,Sales,Success %");
    data.meetingLeaderboard.forEach((l) =>
      lines.push(`${l.rank},${csv(l.userName)},${l.meetings},${l.sales},${l.successPercent}`)
    );

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead-analytics-${data.date || data.month || "all-time"}.csv`;
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

  const emptyButHasData = data && data.metrics.totalLeads === 0 && data.totalInDb > 0;
  const scopeLabel = data ? (data.date ? data.date : data.month ? data.month : "All Time") : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Lead Analytics</h1>
          <div className="flex flex-wrap items-center gap-2">
            {(date || month) && (
              <button
                onClick={() => {
                  setDate("");
                  setMonth("");
                }}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-100"
              >
                All Time
              </button>
            )}
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              Date
              <input
                type="date"
                value={date}
                max={todayISO()}
                disabled={!!month}
                onChange={(e) => {
                  setDate(e.target.value);
                  setMonth("");
                }}
                title="Show analytics for leads created on this date"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              Month
              <input
                type="month"
                value={month}
                max={currentMonthISO()}
                disabled={!!date}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setDate("");
                }}
                title="Show analytics for leads created in this month"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 disabled:opacity-50"
              />
            </label>
            <button
              onClick={exportCSV}
              disabled={!data}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        {!data ? (
          <p className="text-gray-500">Loading analytics...</p>
        ) : (
          <>
            {emptyButHasData && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                No leads were created in {data.date ? `on ${data.date}` : data.month}, but{" "}
                {data.totalInDb} lead{data.totalInDb === 1 ? "" : "s"} exist overall. Switch to{" "}
                <button
                  onClick={() => {
                    setDate("");
                    setMonth("");
                  }}
                  className="font-semibold underline"
                >
                  All Time
                </button>{" "}
                or pick another date/month to see them.
              </div>
            )}

            {/* Key metrics (scoped to selected date/month, or all-time) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <MetricCard label="Total Leads" value={data.metrics.totalLeads} />
              <MetricCard label="New Leads" value={data.metrics.newLeads} />
              <MetricCard label="In Progress" value={data.metrics.inProgress} />
              <MetricCard label="Meetings Scheduled" value={data.metrics.meetingsScheduled} />
              <MetricCard label="Sales (Converted)" value={data.metrics.sales} />
              <MetricCard label="Lost" value={data.metrics.lost} />
              <MetricCard label="Meeting Efficiency" value={`${data.metrics.meetingEfficiency}%`} />
              <MetricCard label="Conversion Rate" value={`${data.metrics.conversionRate}%`} />
              <MetricCard label="Drop Rate" value={`${data.metrics.dropRate}%`} />
            </div>

            {/* Employee Performance */}
            <Section title={`Agent Performance — Employees (${scopeLabel})`}>
              <Table
                headers={[
                  "Employee",
                  "New Lead",
                  "Call Back",
                  "Not Answering",
                  "Document Pending",
                  "Payment Pending",
                  "Total Sales",
                ]}
                rows={data.employeePerformance.map((a) => [
                  a.userName,
                  String(a.newLeads),
                  String(a.callBack),
                  String(a.notAnswering),
                  String(a.documentPending),
                  String(a.paymentPending),
                  String(a.sales),
                ])}
                emptyLabel="No employees yet"
              />
            </Section>

            {/* Meeting User Performance */}
            <Section title={`Agent Performance — Meeting Users (${scopeLabel})`}>
              <Table
                headers={[
                  "Meeting User",
                  "New Lead",
                  "Call Back",
                  "Not Answering",
                  "Meeting Scheduled",
                  "Document Pending",
                  "Payment Pending",
                  "Total Sales",
                ]}
                rows={data.meetingPerformance.map((a) => [
                  a.userName,
                  String(a.newLeads),
                  String(a.callBack),
                  String(a.notAnswering),
                  String(a.meetingScheduled),
                  String(a.documentPending),
                  String(a.paymentPending),
                  String(a.sales),
                ])}
                emptyLabel="No meeting users yet"
              />
            </Section>

            {/* Status Distribution (scoped to selected date/month, or all-time) */}
            <Section title={`Lead Status Distribution (${scopeLabel})`}>
              <Table
                headers={["Status", "Count"]}
                rows={data.statusDistribution.map((s) => [s.label, String(s.count)])}
                emptyLabel="No leads in this range"
              />
            </Section>

            {/* Employee Leaderboard */}
            <Section title={`Employee Leaderboard (${scopeLabel})`}>
              <Table
                headers={["Rank", "Employee", "Leads", "Sales", "Success %"]}
                rows={data.employeeLeaderboard.map((l) => [
                  String(l.rank),
                  l.userName,
                  String(l.leads),
                  String(l.sales),
                  `${l.successPercent}%`,
                ])}
                emptyLabel="No leaderboard data yet"
              />
            </Section>

            {/* Meeting Leaderboard */}
            <Section title={`Meeting User Leaderboard (${scopeLabel})`}>
              <Table
                headers={["Rank", "Meeting User", "Meetings", "Sales", "Success %"]}
                rows={data.meetingLeaderboard.map((l) => [
                  String(l.rank),
                  l.userName,
                  String(l.meetings),
                  String(l.sales),
                  `${l.successPercent}%`,
                ])}
                emptyLabel="No leaderboard data yet"
              />
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

// Escape a CSV cell (wrap in quotes if it contains comma/quote/newline).
function csv(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-1">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Table({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: string[][];
  emptyLabel: string;
}) {
  return (
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-700">
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100 break-words">
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}