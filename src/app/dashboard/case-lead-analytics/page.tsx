"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "business_development" | "billing" | "case_manager" | "wm" | "wcm" | "wtc" | "supervisor";
};

type PhaseBreakdown = {
  phase: number;
  label: string;
  employers: number;
  sources: number;
  completedSources: number;
  emailsSent: number;
  replies: number;
  responseRate: number;
};

type StatusBreakdown = {
  status: string;
  count: number;
  isTerminal: boolean;
};

type CaseManagerPerf = {
  caseManagerId: number;
  caseManagerName: string;
  leads: number;
  employers: number;
  emailsSent: number;
  replies: number;
  interested: number;
  interviews: number;
  followupsDue: number;
  responseRate: number;
};

type LeaderboardEntry = CaseManagerPerf & { rank: number; score: number };

type Analytics = {
  filtered: boolean;
  date: string | null;
  month: string | null;
  totalLeads: number;
  totalEmployers: number;
  totalSources: number;
  totalEmailsSent: number;
  totalReplies: number;
  totalInterested: number;
  totalInterviews: number;
  followupsDueToday: number;
  avgResponseRate: number;
  avgCompletionRate: number;
  phaseBreakdown: PhaseBreakdown[];
  statusBreakdown: StatusBreakdown[];
  caseManagerPerformance: CaseManagerPerf[];
  leaderboard: LeaderboardEntry[];
  caseManagers: { id: number; name: string }[];
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

export default function CaseLeadAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { router.push("/"); return; }
        const me = await res.json();
        if (me.role !== "admin") { router.push("/dashboard"); return; }
        setUser(me);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const loadAnalytics = useCallback(async () => {
    setDataLoading(true);
    const qs = new URLSearchParams();
    if (date) qs.set("date", date);
    else if (month) qs.set("month", month);
    if (assignedTo) qs.set("assignedTo", assignedTo);
    const res = await fetch(`/api/case-marketing/analytics?${qs.toString()}`);
    if (res.ok) setData(await res.json());
    setDataLoading(false);
  }, [date, month, assignedTo]);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user, loadAnalytics]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    const scope = data.date ? `Date ${data.date}` : data.month ? `Month ${data.month}` : "All Time";
    lines.push(`Case Lead Analytics,${scope}`);
    lines.push("");
    lines.push("Metric,Value");
    lines.push(`Total Case Leads,${data.totalLeads}`);
    lines.push(`Total Employers,${data.totalEmployers}`);
    lines.push(`Total Sources,${data.totalSources}`);
    lines.push(`Emails Sent,${data.totalEmailsSent}`);
    lines.push(`Total Replies,${data.totalReplies}`);
    lines.push(`Interested,${data.totalInterested}`);
    lines.push(`Interviews Scheduled,${data.totalInterviews}`);
    lines.push(`Follow-ups Due Today,${data.followupsDueToday}`);
    lines.push(`Avg Response Rate %,${data.avgResponseRate}`);
    lines.push(`Avg Completion Rate %,${data.avgCompletionRate}`);
    lines.push("");
    lines.push("Phase Breakdown");
    lines.push("Phase,Employers,Sources,Completed Sources,Emails Sent,Replies,Response Rate %");
    data.phaseBreakdown.forEach((p) =>
      lines.push(`${csv(p.label)},${p.employers},${p.sources},${p.completedSources},${p.emailsSent},${p.replies},${p.responseRate}`)
    );
    lines.push("");
    lines.push("Status Breakdown");
    lines.push("Status,Count,Terminal");
    data.statusBreakdown.forEach((s) =>
      lines.push(`${csv(s.status)},${s.count},${s.isTerminal ? "Yes" : "No"}`)
    );
    lines.push("");
    lines.push("Case Manager Performance");
    lines.push("Case Manager,Leads,Employers,Emails Sent,Replies,Interested,Interviews,Response Rate %");
    data.caseManagerPerformance.forEach((cm) =>
      lines.push(`${csv(cm.caseManagerName)},${cm.leads},${cm.employers},${cm.emailsSent},${cm.replies},${cm.interested},${cm.interviews},${cm.responseRate}`)
    );
    lines.push("");
    lines.push("Leaderboard");
    lines.push("Rank,Case Manager,Leads,Emails Sent,Interested,Interviews,Response Rate %");
    data.leaderboard.forEach((l) =>
      lines.push(`${l.rank},${csv(l.caseManagerName)},${l.leads},${l.emailsSent},${l.interested},${l.interviews},${l.responseRate}`)
    );

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `case-lead-analytics-${data.date || data.month || "all-time"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const scopeLabel = data
    ? data.date ? data.date : data.month ? data.month : "All Time"
    : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Case Lead Analytics
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              CV marketing performance across all case leads
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(date || month || assignedTo) && (
              <button
                onClick={() => { setDate(""); setMonth(""); setAssignedTo(""); }}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Clear Filters
              </button>
            )}

            {/* Case Manager Filter */}
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100"
            >
              <option value="">All Case Managers</option>
              {data?.caseManagers.map((cm) => (
                <option key={cm.id} value={cm.id}>{cm.name}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
              Date
              <input
                type="date"
                value={date}
                max={todayISO()}
                disabled={!!month}
                onChange={(e) => { setDate(e.target.value); setMonth(""); }}
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
                onChange={(e) => { setMonth(e.target.value); setDate(""); }}
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

        {(dataLoading || !data) ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Key Metrics ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <MetricCard label="Total Sources" value={data.totalSources} color="sky" />
              <MetricCard label="Total Employers" value={data.totalEmployers} color="indigo" />
              <MetricCard label="Emails Sent" value={data.totalEmailsSent} color="violet" />
              <MetricCard label="Total Replies" value={data.totalReplies} color="purple" />
              <MetricCard label="Interested" value={data.totalInterested} color="emerald" />
              <MetricCard label="Interviews" value={data.totalInterviews} color="green" />
              <MetricCard label="Follow-ups Due" value={data.followupsDueToday} color="red" />
              <MetricCard label="Avg Response Rate" value={`${data.avgResponseRate}%`} color="amber" />
              <MetricCard label="Avg Completion" value={`${data.avgCompletionRate}%`} color="teal" />
              <MetricCard label="Total Case Leads" value={data.totalLeads} color="blue" />
            </div>

            {/* ── Phase Breakdown ── */}
            <Section title={`Phase Breakdown (${scopeLabel})`}>
              <Table
                headers={["Phase", "Employers", "Sources", "Completed Sources", "Emails Sent", "Replies", "Response Rate"]}
                rows={data.phaseBreakdown.map((p) => [
                  p.label,
                  String(p.employers),
                  String(p.sources),
                  String(p.completedSources),
                  String(p.emailsSent),
                  String(p.replies),
                  `${p.responseRate}%`,
                ])}
                emptyLabel="No phase data yet"
                highlightCol={6}
              />
            </Section>

            {/* ── Status Breakdown ── */}
            <Section title={`Employer Status Breakdown (${scopeLabel})`}>
              <div className="p-4 flex flex-wrap gap-2">
                {data.statusBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-400">No status data yet</p>
                ) : (
                  data.statusBreakdown.map((s) => (
                    <span
                      key={s.status}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        s.status === "Interested"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300"
                          : s.status === "Interview Scheduled"
                          ? "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
                          : s.status === "No Response"
                          ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300"
                          : s.status === "Pending"
                          ? "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                          : s.isTerminal
                          ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300"
                          : "bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-300"
                      }`}
                    >
                      {s.status}
                      <span className="bg-white dark:bg-gray-900 rounded-full px-1.5 py-0.5 text-[11px] font-bold">
                        {s.count}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </Section>

            {/* ── Case Manager Performance ── */}
            <Section title={`Case Manager Performance (${scopeLabel})`}>
              <Table
                headers={[
                  "Case Manager",
                  "Leads",
                  "Employers",
                  "Emails Sent",
                  "Replies",
                  "Interested",
                  "Interviews",
                  "Follow-ups Due",
                  "Response Rate",
                ]}
                rows={data.caseManagerPerformance.map((cm) => [
                  cm.caseManagerName,
                  String(cm.leads),
                  String(cm.employers),
                  String(cm.emailsSent),
                  String(cm.replies),
                  String(cm.interested),
                  String(cm.interviews),
                  String(cm.followupsDue),
                  `${cm.responseRate}%`,
                ])}
                emptyLabel="No case managers yet"
                highlightCol={8}
              />
            </Section>

            {/* ── Leaderboard ── */}
            <Section title={`Case Manager Leaderboard (${scopeLabel})`}>
              <Table
                headers={["Rank", "Case Manager", "Leads", "Emails Sent", "Interested", "Interviews", "Follow-ups Due", "Response Rate"]}
                rows={data.leaderboard.map((l) => [
                  l.rank === 1 ? "🥇 1" : l.rank === 2 ? "🥈 2" : l.rank === 3 ? "🥉 3" : String(l.rank),
                  l.caseManagerName,
                  String(l.leads),
                  String(l.emailsSent),
                  String(l.interested),
                  String(l.interviews),
                  String(l.followupsDue),
                  `${l.responseRate}%`,
                ])}
                emptyLabel="No leaderboard data yet"
                highlightCol={7}
              />
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  violet: "text-violet-600 dark:text-violet-400",
  purple: "text-purple-600 dark:text-purple-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  green: "text-green-600 dark:text-green-400",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
  teal: "text-teal-600 dark:text-teal-400",
  sky: "text-sky-600 dark:text-sky-400",
};

function MetricCard({
  label,
  value,
  color = "blue",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${COLOR_MAP[color] ?? "text-gray-800 dark:text-gray-100"}`}>
        {value}
      </p>
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
  highlightCol,
}: {
  headers: string[];
  rows: string[][];
  emptyLabel: string;
  highlightCol?: number;
}) {
  return (
    <table className="w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-700">
        <tr>
          {headers.map((h, i) => (
            <th
              key={h}
              className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide align-bottom ${
                i === highlightCol
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={headers.length}
              className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400"
            >
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 text-xs truncate ${
                    j === highlightCol
                      ? "font-bold text-blue-600 dark:text-blue-400"
                      : "text-gray-800 dark:text-gray-100"
                  }`}
                >
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
