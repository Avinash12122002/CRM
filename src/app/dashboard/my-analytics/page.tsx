"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";

// ─── shared types ───────────────────────────────────────────────────────────
type Role =
  | "admin"
  | "telecaller"
  | "employee"
  | "meeting"
  | "business_development"
  | "billing"
  | "case_manager";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

type PaginationInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// ─── per-role analytics shapes ───────────────────────────────────────────────
type TelecallerData = {
  date: string | null; month: string | null; filtered: boolean; totalInDb: number;
  metrics: {
    totalLeads: number; newLeads: number; inProgress: number;
    meetingScheduled: number; lost: number; sales: number;
    conversionRate: number; dropRate: number;
  };
  statusDistribution: { status: string; label: string; count: number }[];
  callbacksDueToday: { id: number; name: string; phone: string; callbackDate: string }[];
  dailyTrend: { date: string; count: number }[];
  history: {
    items: {
      id: number; name: string; phone: string; leadSource: string;
      status: string; createdAt: string; isTriloknath: boolean;
    }[];
    pagination: PaginationInfo;
  };
};

type MeetingData = {
  date: string | null; month: string | null; filtered: boolean; totalInDb: number;
  metrics: {
    totalLeads: number; totalMeetings: number; completed: number; cancelled: number; scheduled: number;
    salesConverted: number; conversionRate: number; meetingEfficiency: number;
  };
  upcomingMeetings: {
    leadId: number; meetingDate: string; startTime: string; endTime: string; bookedByName: string;
  }[];
  dailyTrend: { date: string; count: number }[];
  history: {
    items: {
      id: number; leadId: number; meetingDate: string; startTime: string; endTime: string;
      status: string; bookedByName: string;
    }[];
    pagination: PaginationInfo;
  };
};

type CaseManagerData = {
  date: string | null; month: string | null; filtered: boolean; totalInDb: number;
  metrics: {
    totalCaseLeads: number; totalEmployers: number; totalSources: number;
    emailsSent: number; replies: number; interested: number; interviews: number;
    followupsDueToday: number; avgResponseRate: number; avgCompletionRate: number;
  };
  phaseBreakdown: {
    phase: number; label: string; employers: number; sources: number;
    completedSources: number; emailsSent: number; replies: number; responseRate: number;
  }[];
  statusBreakdown: { status: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  history: {
    items: {
      id: number; name: string; phone: string; assignedAt: string;
      employersCount: number; emailsSent: number; replies: number; isTriloknath: boolean;
    }[];
    pagination: PaginationInfo;
  };
};

type BDEData = {
  date: string | null; month: string | null; filtered: boolean; totalInDb: number;
  metrics: {
    totalLeads: number; dealsDone: number; meetingsScheduled: number; leadLost: number;
    successRate: number; dropRate: number; efficiency: number; highPrioritySet: number;
  };
  stageDistribution: { stage: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  history: {
    items: {
      id: number; companyName: string; contactPerson: string; pipelineStage: string;
      priority?: string; status: string; createdAt: string;
    }[];
    pagination: PaginationInfo;
  };
};

type BillingData = {
  date: string | null; month: string | null; filtered: boolean; totalInDb: number;
  metrics: {
    totalBills: number; totalAmount: number; paidAmount: number; remainingAmount: number;
    paidCount: number; partialCount: number; unpaidCount: number; unpaidAmount: number;
  };
  dailyTrend: { date: string; count: number; amount: number }[];
  outstanding: {
    billId: number; invoiceNumber: string; clientName: string; passportNumber: string;
    amount: number; paidAmount: number; remainingAmount: number; createdAt: string; status: string;
  }[];
  history: {
    items: {
      billId: number; invoiceNumber: string; clientName: string; passportNumber: string;
      amount: number; paidAmount: number; remainingAmount: number; status: string; createdAt: string;
    }[];
    pagination: PaginationInfo;
  };
};

// ─── helpers ─────────────────────────────────────────────────────────────────
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
function fmtCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(dStr?: string | null) {
  if (!dStr) return "—";
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return dStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── UI primitives ────────────────────────────────────────────────────────────
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
  rose: "text-rose-600 dark:text-rose-400",
  orange: "text-orange-600 dark:text-orange-400",
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
  rows: (string | React.ReactNode)[][];
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
            <td colSpan={headers.length} className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
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

function PaginationControls({
  pagination,
  onPageChange,
}: {
  pagination: PaginationInfo;
  onPageChange: (newPage: number) => void;
}) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
      <div className="flex-1 flex justify-between sm:hidden">
        <button
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={pagination.page === 1}
          className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={pagination.page === pagination.totalPages}
          className="ml-3 relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <p className="text-xs text-gray-700 dark:text-gray-300">
          Showing{" "}
          <span className="font-medium">
            {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
          </span>{" "}
          to{" "}
          <span className="font-medium">
            {Math.min(pagination.page * pagination.limit, pagination.total)}
          </span>{" "}
          of <span className="font-medium">{pagination.total}</span> results
        </p>
        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
          <button
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="sr-only">Previous</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
            .filter(
              (page) =>
                page === 1 ||
                page === pagination.totalPages ||
                (page >= pagination.page - 1 && page <= pagination.page + 1)
            )
            .flatMap((page, idx, arr) => {
              const elements: React.ReactNode[] = [];
              if (idx > 0 && page - arr[idx - 1] > 1) {
                elements.push(
                  <span
                    key={`ellipsis-before-${page}`}
                    className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300"
                  >
                    ...
                  </span>
                );
              }
              elements.push(
                <button
                  key={`page-${page}`}
                  onClick={() => onPageChange(page)}
                  className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
                    page === pagination.page
                      ? "z-10 bg-blue-600 border-blue-600 text-white font-semibold"
                      : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {page}
                </button>
              );
              return elements;
            })}

          <button
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages}
            className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="sr-only">Next</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </nav>
      </div>
    </div>
  );
}

function PaginatedTable({
  headers,
  rows,
  emptyLabel,
  pageSize = 10,
  highlightCol,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  emptyLabel: string;
  pageSize?: number;
  highlightCol?: number;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const currentRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div>
      <Table headers={headers} rows={currentRows} emptyLabel={emptyLabel} highlightCol={highlightCol} />
      {rows.length > pageSize && (
        <PaginationControls
          pagination={{ page: safePage, limit: pageSize, total: rows.length, totalPages }}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

// Filter bar that allows Date or Month filtering seamlessly
function FilterBar({
  date, month,
  onDateChange,
  onMonthChange,
  onClearFilters,
  onExport,
  hasData,
}: {
  date: string; month: string;
  onDateChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onClearFilters: () => void;
  onExport: () => void;
  hasData: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(date || month) && (
        <button
          onClick={onClearFilters}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 font-medium"
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
          onChange={(e) => onDateChange(e.target.value)}
          className="px-3 py-2 min-w-38 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
        Month
        <input
          type="month"
          value={month}
          max={currentMonthISO()}
          onChange={(e) => onMonthChange(e.target.value)}
          className="px-3 py-2 min-w-32 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100"
        />
      </label>
      <button
        onClick={onExport}
        disabled={!hasData}
        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        Export CSV
      </button>
    </div>
  );
}

// ─── Role-specific views ──────────────────────────────────────────────────────

function TelecallerView({
  data,
  scopeLabel,
  onPageChange,
}: {
  data: TelecallerData;
  scopeLabel: string;
  onPageChange: (p: number) => void;
}) {
  const m = data.metrics;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Leads Assigned" value={m.totalLeads} color="blue" />
        <MetricCard label="New Leads" value={m.newLeads} color="sky" />
        <MetricCard label="In Progress" value={m.inProgress} color="amber" />
        <MetricCard label="Meeting Scheduled" value={m.meetingScheduled} color="violet" />
        <MetricCard label="Sales (Converted)" value={m.sales} color="emerald" />
        <MetricCard label="Lost" value={m.lost} color="red" />
        <MetricCard label="Conversion Rate" value={`${m.conversionRate}%`} color="green" />
        <MetricCard label="Drop Rate" value={`${m.dropRate}%`} color="rose" />
      </div>

      <Section title={`Lead Status Distribution (${scopeLabel})`}>
        <Table
          headers={["Status", "Count"]}
          rows={data.statusDistribution.map((s) => [s.label, String(s.count)])}
          emptyLabel="No leads in this range"
        />
      </Section>

      <Section title="Callbacks Due Today">
        <PaginatedTable
          headers={["Lead ID", "Name", "Phone", "Callback Date"]}
          rows={data.callbacksDueToday.map((c) => [
            String(c.id),
            c.name || "—",
            c.phone || "—",
            c.callbackDate ? new Date(c.callbackDate).toLocaleDateString("en-IN") : "—",
          ])}
          emptyLabel="No callbacks due today 🎉"
        />
      </Section>

      <Section title={`All Assigned Leads History (${scopeLabel})`}>
        <Table
          headers={["Lead ID", "Name", "Phone", "Lead Source", "Status", "Assigned Date", "Type"]}
          rows={(data.history?.items || []).map((l) => [
            String(l.id),
            l.name,
            l.phone,
            l.leadSource,
            <span
              key={l.id}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                l.status === "sales"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : l.status === "new-lead"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {l.status}
            </span>,
            fmtDate(l.createdAt),
            l.isTriloknath ? (
              <span key="t" className="text-amber-600 font-semibold">Triloknath</span>
            ) : (
              <span key="m">Main CRM</span>
            ),
          ])}
          emptyLabel="No leads history found"
        />
        {data.history?.pagination && (
          <PaginationControls pagination={data.history.pagination} onPageChange={onPageChange} />
        )}
      </Section>

      <Section title={`Daily Activity Trend (${scopeLabel})`}>
        <PaginatedTable
          headers={["Date", "Leads Count"]}
          rows={data.dailyTrend.map((t) => [t.date, String(t.count)])}
          emptyLabel="No activity trend data"
        />
      </Section>
    </>
  );
}

function MeetingView({
  data,
  scopeLabel,
  onPageChange,
}: {
  data: MeetingData;
  scopeLabel: string;
  onPageChange: (p: number) => void;
}) {
  const m = data.metrics;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Leads" value={m.totalLeads} color="blue" />
        <MetricCard label="Total Meetings" value={m.totalMeetings} color="sky" />
        <MetricCard label="Completed" value={m.completed} color="emerald" />
        <MetricCard label="Cancelled" value={m.cancelled} color="red" />
        <MetricCard label="Scheduled (Pending)" value={m.scheduled} color="amber" />
        <MetricCard label="Sales Converted" value={m.salesConverted} color="green" />
        <MetricCard label="Conversion Rate" value={`${m.conversionRate}%`} color="violet" />
        <MetricCard label="Meeting Efficiency" value={`${m.meetingEfficiency}%`} color="teal" />
      </div>

      <Section title="Upcoming Scheduled Meetings">
        <PaginatedTable
          headers={["Lead ID", "Date", "Start Time", "End Time", "Booked By"]}
          rows={data.upcomingMeetings.map((u) => [
            String(u.leadId),
            u.meetingDate,
            u.startTime,
            u.endTime,
            u.bookedByName || "—",
          ])}
          emptyLabel="No upcoming meetings"
        />
      </Section>

      <Section title={`All Meetings History (${scopeLabel})`}>
        <Table
          headers={["Meeting ID", "Lead ID", "Meeting Date", "Time", "Booked By", "Status"]}
          rows={(data.history?.items || []).map((s) => [
            String(s.id),
            String(s.leadId),
            s.meetingDate,
            `${s.startTime} - ${s.endTime}`,
            s.bookedByName,
            <span
              key={String(s.id)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                s.status === "completed"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : s.status === "cancelled"
                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              }`}
            >
              {s.status}
            </span>,
          ])}
          emptyLabel="No meeting history found"
        />
        {data.history?.pagination && (
          <PaginationControls pagination={data.history.pagination} onPageChange={onPageChange} />
        )}
      </Section>

      <Section title={`Daily Meeting Activity (${scopeLabel})`}>
        <PaginatedTable
          headers={["Date", "Meetings Count"]}
          rows={data.dailyTrend.map((t) => [t.date, String(t.count)])}
          emptyLabel="No activity trend data"
        />
      </Section>
    </>
  );
}

function CaseManagerView({
  data,
  scopeLabel,
  onPageChange,
}: {
  data: CaseManagerData;
  scopeLabel: string;
  onPageChange: (p: number) => void;
}) {
  const m = data.metrics;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Case Leads Assigned" value={m.totalCaseLeads} color="blue" />
        <MetricCard label="Employers" value={m.totalEmployers} color="indigo" />
        <MetricCard label="Total Sources" value={m.totalSources} color="violet" />
        <MetricCard label="Emails Sent" value={m.emailsSent} color="purple" />
        <MetricCard label="Replies" value={m.replies} color="sky" />
        <MetricCard label="Interested" value={m.interested} color="emerald" />
        <MetricCard label="Interviews" value={m.interviews} color="green" />
        <MetricCard label="Follow-ups Due Today" value={m.followupsDueToday} color="red" />
        <MetricCard label="Avg Response Rate" value={`${m.avgResponseRate}%`} color="amber" />
        <MetricCard label="Avg Completion" value={`${m.avgCompletionRate}%`} color="teal" />
      </div>

      <Section title={`Phase Breakdown (${scopeLabel})`}>
        <PaginatedTable
          headers={["Phase", "Employers", "Sources", "Completed Sources", "Emails Sent", "Replies", "Response Rate"]}
          rows={(data.phaseBreakdown || []).map((p) => [
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
                    : "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
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

      <Section title={`All Case Leads History (${scopeLabel})`}>
        <Table
          headers={["Lead ID", "Name", "Phone", "Employers", "Emails Sent", "Replies", "Assigned Date", "Type"]}
          rows={(data.history?.items || []).map((l) => [
            String(l.id),
            l.name,
            l.phone,
            String(l.employersCount),
            String(l.emailsSent),
            String(l.replies),
            fmtDate(l.assignedAt),
            l.isTriloknath ? (
              <span key="t" className="text-amber-600 font-semibold">Triloknath</span>
            ) : (
              <span key="m">Main CRM</span>
            ),
          ])}
          emptyLabel="No case leads history found"
        />
        {data.history?.pagination && (
          <PaginationControls pagination={data.history.pagination} onPageChange={onPageChange} />
        )}
      </Section>

      <Section title={`Daily Case Activity Trend (${scopeLabel})`}>
        <PaginatedTable
          headers={["Date", "Leads Assigned"]}
          rows={data.dailyTrend.map((t) => [t.date, String(t.count)])}
          emptyLabel="No activity trend data"
        />
      </Section>
    </>
  );
}

function BDEView({
  data,
  scopeLabel,
  onPageChange,
}: {
  data: BDEData;
  scopeLabel: string;
  onPageChange: (p: number) => void;
}) {
  const m = data.metrics;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard label="Total BD Leads" value={m.totalLeads} color="blue" />
        <MetricCard label="Deals Done" value={m.dealsDone} color="emerald" />
        <MetricCard label="Meetings Scheduled" value={m.meetingsScheduled} color="violet" />
        <MetricCard label="Leads Lost" value={m.leadLost} color="red" />
        <MetricCard label="Success Rate" value={`${m.successRate}%`} color="green" />
        <MetricCard label="Drop Rate" value={`${m.dropRate}%`} color="rose" />
        <MetricCard label="Meeting Efficiency" value={`${m.efficiency}%`} color="amber" />
        <MetricCard label="High Priority Set" value={m.highPrioritySet} color="sky" />
      </div>

      <Section title={`Pipeline Stage Distribution (${scopeLabel})`}>
        <PaginatedTable
          headers={["Stage", "Count"]}
          rows={data.stageDistribution.map((s) => [s.stage, String(s.count)])}
          emptyLabel="No BD leads in this range"
        />
      </Section>

      <Section title={`All BD Leads History (${scopeLabel})`}>
        <Table
          headers={["Lead ID", "Company / Contact", "Pipeline Stage", "Priority", "Status", "Created Date"]}
          rows={(data.history?.items || []).map((l) => [
            String(l.id),
            l.companyName,
            <span key={l.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded font-medium text-[11px]">
              {l.pipelineStage}
            </span>,
            l.priority ? (
              <span
                key={`p-${l.id}`}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  String(l.priority).toLowerCase() === "high"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {l.priority}
              </span>
            ) : (
              "—"
            ),
            l.status,
            fmtDate(l.createdAt),
          ])}
          emptyLabel="No BD leads history found"
        />
        {data.history?.pagination && (
          <PaginationControls pagination={data.history.pagination} onPageChange={onPageChange} />
        )}
      </Section>

      <Section title={`Daily BD Activity Trend (${scopeLabel})`}>
        <PaginatedTable
          headers={["Date", "Leads Created"]}
          rows={data.dailyTrend.map((t) => [t.date, String(t.count)])}
          emptyLabel="No activity trend data"
        />
      </Section>
    </>
  );
}

function BillingView({
  data,
  scopeLabel,
  onPageChange,
}: {
  data: BillingData;
  scopeLabel: string;
  onPageChange: (p: number) => void;
}) {
  const m = data.metrics;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Bills" value={m.totalBills} color="blue" />
        <MetricCard label="Total Amount Billed" value={fmtCurrency(m.totalAmount)} color="indigo" />
        <MetricCard label="Amount Collected" value={fmtCurrency(m.paidAmount)} color="emerald" />
        <MetricCard label="Outstanding" value={fmtCurrency(m.remainingAmount)} color="red" />
        <MetricCard label="Paid Bills" value={m.paidCount} color="green" />
        <MetricCard label="Partial Bills" value={m.partialCount} color="amber" />
        <MetricCard label="Unpaid Bills" value={m.unpaidCount} color="rose" />
        <MetricCard label="Unpaid Amount" value={fmtCurrency(m.unpaidAmount)} color="orange" />
      </div>

      <Section title={`Outstanding Bills (${scopeLabel})`}>
        <PaginatedTable
          headers={["Invoice #", "Client", "Passport", "Amount", "Paid", "Remaining", "Status"]}
          rows={data.outstanding.map((b) => [
            b.invoiceNumber || String(b.billId),
            b.clientName || "—",
            b.passportNumber || "—",
            fmtCurrency(b.amount),
            fmtCurrency(b.paidAmount),
            fmtCurrency(b.remainingAmount),
            b.status.charAt(0).toUpperCase() + b.status.slice(1),
          ])}
          emptyLabel="No outstanding bills 🎉"
          highlightCol={6}
        />
      </Section>

      <Section title={`All Bills History (${scopeLabel})`}>
        <Table
          headers={["Invoice #", "Client Name", "Passport", "Total Amount", "Paid Amount", "Status", "Date"]}
          rows={(data.history?.items || []).map((b) => [
            b.invoiceNumber,
            b.clientName,
            b.passportNumber,
            fmtCurrency(b.amount),
            fmtCurrency(b.paidAmount),
            <span
              key={String(b.billId)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                b.status === "paid"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : b.status === "partial"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
              }`}
            >
              {b.status}
            </span>,
            fmtDate(b.createdAt),
          ])}
          emptyLabel="No bills history found"
        />
        {data.history?.pagination && (
          <PaginationControls pagination={data.history.pagination} onPageChange={onPageChange} />
        )}
      </Section>

      <Section title={`Daily Billing Activity (${scopeLabel})`}>
        <PaginatedTable
          headers={["Date", "Bills Count", "Total Amount"]}
          rows={data.dailyTrend.map((t) => [t.date, String(t.count), fmtCurrency(t.amount)])}
          emptyLabel="No activity trend data"
        />
      </Section>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MyAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Check auth
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { router.push("/"); return; }
        const me: MeResponse = await res.json();
        if (me.role === "admin") { router.push("/dashboard/lead-analytics"); return; }
        setUser(me);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function getEndpoint(role: Role) {
    switch (role) {
      case "telecaller":
      case "employee":
        return "/api/my-analytics/telecaller";
      case "meeting":
        return "/api/my-analytics/meeting";
      case "case_manager":
        return "/api/my-analytics/case-manager";
      case "business_development":
        return "/api/my-analytics/bde";
      case "billing":
        return "/api/my-analytics/billing";
      default:
        return null;
    }
  }

  const loadAnalytics = useCallback(async () => {
    if (!user) return;
    const endpoint = getEndpoint(user.role);
    if (!endpoint) return;
    setDataLoading(true);
    const qs = new URLSearchParams();
    if (date) qs.set("date", date);
    else if (month) qs.set("month", month);
    qs.set("page", String(page));
    qs.set("limit", "10");
    const res = await fetch(`${endpoint}?${qs.toString()}`);
    if (res.ok) setData(await res.json());
    setDataLoading(false);
  }, [user, date, month, page]);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user, loadAnalytics]);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setMonth("");
    setPage(1);
  };

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    setDate("");
    setPage(1);
  };

  const handleClearFilters = () => {
    setDate("");
    setMonth("");
    setPage(1);
  };

  const handleExport = () => {
    if (!data || !user) return;
    const lines: string[] = [];
    const scope = data.date ? `Date ${data.date}` : data.month ? `Month ${data.month}` : "All Time";

    if (user.role === "telecaller" || user.role === "employee") {
      const d = data as TelecallerData;
      lines.push(`My Lead Analytics (${user.name}),${scope}`);
      lines.push("");
      lines.push("Metric,Value");
      lines.push(`Total Leads,${d.metrics.totalLeads}`);
      lines.push(`New Leads,${d.metrics.newLeads}`);
      lines.push(`In Progress,${d.metrics.inProgress}`);
      lines.push(`Meeting Scheduled,${d.metrics.meetingScheduled}`);
      lines.push(`Sales Converted,${d.metrics.sales}`);
      lines.push(`Lost,${d.metrics.lost}`);
      lines.push(`Conversion Rate %,${d.metrics.conversionRate}`);
      lines.push(`Drop Rate %,${d.metrics.dropRate}`);
      lines.push("");
      lines.push("Status Distribution");
      lines.push("Status,Count");
      d.statusDistribution.forEach((s) => lines.push(`${csv(s.label)},${s.count}`));
      lines.push("");
      lines.push("Callbacks Due Today");
      lines.push("Lead ID,Name,Phone,Callback Date");
      d.callbacksDueToday.forEach((c) =>
        lines.push(`${c.id},${csv(c.name || "")},${csv(c.phone || "")},${c.callbackDate}`)
      );
    } else if (user.role === "meeting") {
      const d = data as MeetingData;
      lines.push(`My Meeting Analytics (${user.name}),${scope}`);
      lines.push("");
      lines.push("Metric,Value");
      lines.push(`Total Meetings,${d.metrics.totalMeetings}`);
      lines.push(`Completed,${d.metrics.completed}`);
      lines.push(`Cancelled,${d.metrics.cancelled}`);
      lines.push(`Scheduled,${d.metrics.scheduled}`);
      lines.push(`Sales Converted,${d.metrics.salesConverted}`);
      lines.push(`Conversion Rate %,${d.metrics.conversionRate}`);
      lines.push(`Meeting Efficiency %,${d.metrics.meetingEfficiency}`);
      lines.push("");
      lines.push("Upcoming Meetings");
      lines.push("Lead ID,Date,Start,End,Booked By");
      d.upcomingMeetings.forEach((u) =>
        lines.push(`${u.leadId},${u.meetingDate},${u.startTime},${u.endTime},${csv(u.bookedByName || "")}`)
      );
    } else if (user.role === "case_manager") {
      const d = data as CaseManagerData;
      lines.push(`My Case Manager Analytics (${user.name}),${scope}`);
      lines.push("");
      lines.push("Metric,Value");
      lines.push(`Case Leads,${d.metrics.totalCaseLeads}`);
      lines.push(`Employers,${d.metrics.totalEmployers}`);
      lines.push(`Sources,${d.metrics.totalSources}`);
      lines.push(`Emails Sent,${d.metrics.emailsSent}`);
      lines.push(`Replies,${d.metrics.replies}`);
      lines.push(`Interested,${d.metrics.interested}`);
      lines.push(`Interviews,${d.metrics.interviews}`);
      lines.push(`Follow-ups Due Today,${d.metrics.followupsDueToday}`);
      lines.push(`Avg Response Rate %,${d.metrics.avgResponseRate}`);
      lines.push("");
      lines.push("Phase Breakdown");
      lines.push("Phase,Employers,Sources,Completed Sources,Emails Sent,Replies,Response Rate %");
      (d.phaseBreakdown || []).forEach((p) =>
        lines.push(`${csv(p.label)},${p.employers},${p.sources},${p.completedSources},${p.emailsSent},${p.replies},${p.responseRate}`)
      );
    } else if (user.role === "business_development") {
      const d = data as BDEData;
      lines.push(`My BD Analytics (${user.name}),${scope}`);
      lines.push("");
      lines.push("Metric,Value");
      lines.push(`Total BD Leads,${d.metrics.totalLeads}`);
      lines.push(`Deals Done,${d.metrics.dealsDone}`);
      lines.push(`Meetings Scheduled,${d.metrics.meetingsScheduled}`);
      lines.push(`Leads Lost,${d.metrics.leadLost}`);
      lines.push(`Success Rate %,${d.metrics.successRate}`);
      lines.push(`Drop Rate %,${d.metrics.dropRate}`);
      lines.push(`High Priority Set,${d.metrics.highPrioritySet}`);
      lines.push("");
      lines.push("Stage Distribution");
      lines.push("Stage,Count");
      d.stageDistribution.forEach((s) => lines.push(`${csv(s.stage)},${s.count}`));
    } else if (user.role === "billing") {
      const d = data as BillingData;
      lines.push(`My Billing Analytics (${user.name}),${scope}`);
      lines.push("");
      lines.push("Metric,Value");
      lines.push(`Total Bills,${d.metrics.totalBills}`);
      lines.push(`Total Amount,${d.metrics.totalAmount}`);
      lines.push(`Amount Collected,${d.metrics.paidAmount}`);
      lines.push(`Outstanding,${d.metrics.remainingAmount}`);
      lines.push(`Paid Bills,${d.metrics.paidCount}`);
      lines.push(`Partial Bills,${d.metrics.partialCount}`);
      lines.push(`Unpaid Bills,${d.metrics.unpaidCount}`);
      lines.push("");
      lines.push("Outstanding Bills");
      lines.push("Invoice #,Client,Passport,Amount,Paid,Remaining,Status");
      d.outstanding.forEach((b) =>
        lines.push(
          `${csv(b.invoiceNumber || String(b.billId))},${csv(b.clientName || "")},${csv(b.passportNumber || "")},${b.amount},${b.paidAmount},${b.remainingAmount},${b.status}`
        )
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-analytics-${user?.role}-${data.date || data.month || "all-time"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function roleTitle(role: Role) {
    switch (role) {
      case "telecaller":
      case "employee":
        return "My Lead Analytics";
      case "meeting":
        return "My Meeting Analytics";
      case "case_manager":
        return "My Case Analytics";
      case "business_development":
        return "My BD Analytics";
      case "billing":
        return "My Billing Analytics";
      default:
        return "My Analytics";
    }
  }

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

  const emptyButHasData = data && data.totalInDb > 0 && (() => {
    switch (user.role) {
      case "telecaller":
      case "employee":
        return (data as TelecallerData).metrics.totalLeads === 0;
      case "meeting":
        return (data as MeetingData).metrics.totalMeetings === 0;
      case "case_manager":
        return (data as CaseManagerData).metrics.totalCaseLeads === 0;
      case "business_development":
        return (data as BDEData).metrics.totalLeads === 0;
      case "billing":
        return (data as BillingData).metrics.totalBills === 0;
      default: return false;
    }
  })();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {roleTitle(user.role)}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Showing your personal performance data
            </p>
          </div>
          <FilterBar
            date={date}
            month={month}
            onDateChange={handleDateChange}
            onMonthChange={handleMonthChange}
            onClearFilters={handleClearFilters}
            onExport={handleExport}
            hasData={!!data}
          />
        </div>

        {dataLoading || !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : (
          <>
            {emptyButHasData && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                No data in {data.date ? `on ${data.date}` : data.month}, but {data.totalInDb} records exist overall.{" "}
                <button
                  onClick={handleClearFilters}
                  className="font-semibold underline"
                >
                  Switch to All Time
                </button>
              </div>
            )}

            {/* Role-specific content */}
            {(user.role === "telecaller" || user.role === "employee") && (
              <TelecallerView
                data={data as TelecallerData}
                scopeLabel={scopeLabel}
                onPageChange={(p) => setPage(p)}
              />
            )}
            {user.role === "meeting" && (
              <MeetingView
                data={data as MeetingData}
                scopeLabel={scopeLabel}
                onPageChange={(p) => setPage(p)}
              />
            )}
            {user.role === "case_manager" && (
              <CaseManagerView
                data={data as CaseManagerData}
                scopeLabel={scopeLabel}
                onPageChange={(p) => setPage(p)}
              />
            )}
            {user.role === "business_development" && (
              <BDEView
                data={data as BDEData}
                scopeLabel={scopeLabel}
                onPageChange={(p) => setPage(p)}
              />
            )}
            {user.role === "billing" && (
              <BillingView
                data={data as BillingData}
                scopeLabel={scopeLabel}
                onPageChange={(p) => setPage(p)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
