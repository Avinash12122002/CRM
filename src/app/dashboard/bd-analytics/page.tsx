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
  dailySubmission: { _id: number; userName: string; totalCreated: number }[];
  bdPerformance: {
    bdUserId: number;
    bdUserName: string;
    totalLeads: number;
    newLead: number;
    researchStarted: number;
    prioritySet: number;
    initialContact: number;
    responseReceived: number;
    meetingScheduled: number;
    followUp: number;
    dealDone: number;
    leadLost: number;
  }[];
  stageDurationSummary: {
    stage: string;
    total: number;
    completed: number;
    ongoing: number;
  }[];
  metrics: {
    totalLeads: number;
    totalMeetingsScheduled: number;
    totalDealsDone: number;
    totalLeadLost: number;
    efficiency: number;
    successRate: number;
    dropRate: number;
  };
  leaderboard: {
    rank: number;
    bdUserId: number;
    bdUserName: string;
    totalLeads: number;
    deals: number;
    meetings: number;
    successPercent: number;
  }[];
};

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

// Escape a CSV cell (wrap in quotes if it contains comma/quote/newline).
function csv(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default function BDAnalyticsPage() {
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
    const res = await fetch(`/api/bd/analytics/admin?${qs.toString()}`);
    if (res.ok) setData(await res.json());
  }, [date, month]);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user, loadAnalytics]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    const scope = data.date ? `Date ${data.date}` : data.month ? `Month ${data.month}` : "All Time";
    lines.push(`BD Analytics,${scope}`);
    lines.push("");
    lines.push("Metric,Value");
    lines.push(`Total Leads,${data.metrics.totalLeads}`);
    lines.push(`Meetings Scheduled,${data.metrics.totalMeetingsScheduled}`);
    lines.push(`Deals Done,${data.metrics.totalDealsDone}`);
    lines.push(`Lead Lost,${data.metrics.totalLeadLost}`);
    lines.push(`Data Efficiency %,${data.metrics.efficiency}`);
    lines.push(`Deal Success Rate %,${data.metrics.successRate}`);
    lines.push(`Drop Rate %,${data.metrics.dropRate}`);
    lines.push("");
    lines.push(`Daily Lead Submission (${scope})`);
    lines.push("Employee,Leads Created");
    data.dailySubmission.forEach((d) => lines.push(`${csv(d.userName)},${d.totalCreated}`));
    lines.push("");
    lines.push(`Business Development Performance (${scope})`);
    lines.push(
      "BD User,Total Lead,New Lead,Research Started,Priority Set,Initial Contact,Response Received,Meeting Scheduled,Follow Up,Deal Done,Lead Lost"
    );
    data.bdPerformance.forEach((bd) =>
      lines.push(
        `${csv(bd.bdUserName)},${bd.totalLeads},${bd.newLead},${bd.researchStarted},${bd.prioritySet},${bd.initialContact},${bd.responseReceived},${bd.meetingScheduled},${bd.followUp},${bd.dealDone},${bd.leadLost}`
      )
    );
    lines.push("");
    lines.push(`Stage Duration (${scope})`);
    lines.push("Stage,Total,Completed,Still In Stage");
    data.stageDurationSummary.forEach((s) =>
      lines.push(`${csv(s.stage)},${s.total},${s.completed},${s.ongoing}`)
    );
    lines.push("");
    lines.push(`Employee Leaderboard (${scope})`);
    lines.push("Rank,Employee,Total Lead,Deals,Meetings,Success %");
    data.leaderboard.forEach((l) =>
      lines.push(`${l.rank},${csv(l.bdUserName)},${l.totalLeads},${l.deals},${l.meetings},${l.successPercent}`)
    );

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bd-analytics-${data.date || data.month || "all-time"}.csv`;
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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">BD Analytics</h1>
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
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
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
                className="px-3 py-2 min-w-38 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
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
                className="px-3 py-2 min-w-32 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 disabled:opacity-50"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
              <MetricCard label="Total Leads" value={data.metrics.totalLeads} />
              <MetricCard label="Meetings Scheduled" value={data.metrics.totalMeetingsScheduled} />
              <MetricCard label="Deals Done" value={data.metrics.totalDealsDone} />
              <MetricCard label="Lead Lost" value={data.metrics.totalLeadLost} />
              <MetricCard label="Data Efficiency" value={`${data.metrics.efficiency}%`} />
              <MetricCard label="Deal Success Rate" value={`${data.metrics.successRate}%`} />
              <MetricCard label="Drop Rate" value={`${data.metrics.dropRate}%`} />
            </div>

            {/* Daily Lead Submission */}
            <Section title={`Daily Lead Submission (${scopeLabel})`}>
              <Table
                headers={["Employee", "Leads Created"]}
                rows={data.dailySubmission.map((d) => [d.userName, String(d.totalCreated)])}
                emptyLabel="No submissions in this range"
              />
            </Section>

            {/* BD Performance — mutually-exclusive current-state breakdown;
               each row's columns (excluding Total Lead) sum to Total Lead. */}
            <Section title={`Business Development Performance (${scopeLabel})`}>
              <Table
                headers={[
                  "BD User",
                  "Total Lead",
                  "🆕 New Lead",
                  "🔎 Research Started",
                  "🎯 Priority Set",
                  "📞 Initial Contact",
                  "💬 Response Received",
                  "📅 Meeting Scheduled",
                  "🔁 Follow Up",
                  "✅ Deal Done",
                  "❌ Lead Lost",
                ]}
                rows={data.bdPerformance.map((bd) => [
                  bd.bdUserName,
                  String(bd.totalLeads),
                  String(bd.newLead),
                  String(bd.researchStarted),
                  String(bd.prioritySet),
                  String(bd.initialContact),
                  String(bd.responseReceived),
                  String(bd.meetingScheduled),
                  String(bd.followUp),
                  String(bd.dealDone),
                  String(bd.leadLost),
                ])}
                emptyLabel="No Business Development users yet"
              />
            </Section>

            {/* Stage Duration — Deal Done is included; Completed/Still In
               Stage are always 0 for it since it's terminal (nothing ever
               follows it), Total still shows how many leads reached it. */}
            <Section title={`Stage Duration (${scopeLabel})`}>
              <Table
                headers={["Stage", "Total", "Completed", "Still In Stage"]}
                rows={data.stageDurationSummary.map((s) => [
                  s.stage,
                  String(s.total),
                  String(s.completed),
                  String(s.ongoing),
                ])}
                emptyLabel="Not enough data yet"
              />
            </Section>

            {/* Leaderboard */}
            <Section title={`Employee Leaderboard (${scopeLabel})`}>
              <Table
                headers={["Rank", "Employee", "Total Lead", "Deals", "Meetings", "Success %"]}
                rows={data.leaderboard.map((l) => [
                  String(l.rank),
                  l.bdUserName,
                  String(l.totalLeads),
                  String(l.deals),
                  String(l.meetings),
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
    <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-700">
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              className="px-2 py-2 text-left text-[10px] leading-tight font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide align-bottom"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-xs text-gray-800 dark:text-gray-100 truncate">
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