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
  range: string;
  dailySubmission: { _id: number; userName: string; totalCreated: number }[];
  bdPerformance: {
    bdUserId: number;
    bdUserName: string;
    leadsAssigned: number;
    researchStarted: number;
    initialContact: number;
    responseReceived: number;
    meetingsScheduled: number;
    followUps: number;
    dealDone: number;
    leadLost: number;
  }[];
  stageDurationSummary: { stage: string; avgHours: number; sampleSize: number }[];
  metrics: {
    totalLeads: number;
    totalMeetingsScheduled: number;
    totalDealsDone: number;
    efficiency: number;
    successRate: number;
    dropRate: number;
  };
  leaderboard: {
    rank: number;
    bdUserId: number;
    bdUserName: string;
    deals: number;
    meetings: number;
    successPercent: number;
  }[];
};

export default function BDAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("today");
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
    const res = await fetch(`/api/bd/analytics/admin?range=${range}`);
    if (res.ok) setData(await res.json());
  }, [range]);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user, loadAnalytics]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <DashboardNavbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">BD Analytics</h1>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {!data ? (
          <p className="text-zinc-500">Loading analytics...</p>
        ) : (
          <>
            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <MetricCard label="Total Leads" value={data.metrics.totalLeads} />
              <MetricCard label="Meetings Scheduled" value={data.metrics.totalMeetingsScheduled} />
              <MetricCard label="Deals Done" value={data.metrics.totalDealsDone} />
              <MetricCard label="Data Efficiency" value={`${data.metrics.efficiency}%`} />
              <MetricCard label="Deal Success Rate" value={`${data.metrics.successRate}%`} />
              <MetricCard label="Drop Rate" value={`${data.metrics.dropRate}%`} />
            </div>

            {/* Daily Lead Submission */}
            <Section title="Daily Lead Submission">
              <Table
                headers={["Employee", "Leads Created"]}
                rows={data.dailySubmission.map((d) => [d.userName, String(d.totalCreated)])}
                emptyLabel="No submissions in this range"
              />
            </Section>

            {/* BD Performance */}
            <Section title="Business Development Performance">
              <Table
                headers={[
                  "BD User",
                  "Assigned",
                  "Research",
                  "Initial Contact",
                  "Response",
                  "Meetings",
                  "Follow Ups",
                  "Deals",
                  "Lost",
                ]}
                rows={data.bdPerformance.map((bd) => [
                  bd.bdUserName,
                  String(bd.leadsAssigned),
                  String(bd.researchStarted),
                  String(bd.initialContact),
                  String(bd.responseReceived),
                  String(bd.meetingsScheduled),
                  String(bd.followUps),
                  String(bd.dealDone),
                  String(bd.leadLost),
                ])}
                emptyLabel="No Business Development users yet"
              />
            </Section>

            {/* Stage Duration */}
            <Section title="Stage Duration (average time spent, in hours)">
              <Table
                headers={["Stage", "Avg Hours", "Sample Size"]}
                rows={data.stageDurationSummary.map((s) => [
                  s.stage,
                  String(s.avgHours),
                  String(s.sampleSize),
                ])}
                emptyLabel="Not enough data yet"
              />
            </Section>

            {/* Leaderboard */}
            <Section title="Employee Leaderboard">
              <Table
                headers={["Rank", "Employee", "Deals", "Meetings", "Success %"]}
                rows={data.leaderboard.map((l) => [
                  String(l.rank),
                  l.bdUserName,
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
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
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
    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
      <thead className="bg-zinc-50 dark:bg-zinc-800">
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-6 py-3 text-sm text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
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
