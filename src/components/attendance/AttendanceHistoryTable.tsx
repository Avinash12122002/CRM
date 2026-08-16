"use client";

/**
 * AttendanceHistoryTable
 *
 * Reusable paginated attendance table.
 * Used by /dashboard/attendance (employee) and /dashboard/attendance-admin (admin).
 *
 * - In employee mode: fetches /api/attendance/my with month filter.
 * - In admin mode: accepts externally-fetched records from the parent page
 *   (parent handles /api/attendance/all with all filters).
 *
 * Table style matches src/app/dashboard/activity/page.tsx exactly:
 *   - bg-white dark:bg-gray-800, rounded-xl border border-zinc-200 dark:border-zinc-700
 *   - thead: bg-zinc-50 dark:bg-zinc-700
 *   - thead th: text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase
 *   - tbody tr hover:bg-zinc-50 dark:hover:bg-zinc-800/60
 *   - pagination: bg-zinc-50 dark:bg-zinc-800
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { STATUS_CONFIG, ATTENDANCE_STATUSES } from "@/lib/attendance/constants";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/attendance/types";

// Months list for the employee filter dropdown starting from current IST month
function getPastMonths(count = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  let year = nowIST.getUTCFullYear();
  let month = nowIST.getUTCMonth();

  for (let i = 0; i < count; i++) {
    months.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month--;
    if (month < 0) {
      month = 11;
      year--;
    }
  }
  return months;
}

interface Props {
  isAdmin: boolean;
  onOverride?: (record: AttendanceRecord) => void;
  // Admin mode — parent passes data in
  externalRecords?: AttendanceRecord[];
  externalPagination?: { page: number; totalPages: number; total: number };
  externalSummary?: Record<AttendanceStatus, number>;
  externalMonth?: string;
  onPageChange?: (page: number) => void;
}

export default function AttendanceHistoryTable({
  isAdmin,
  onOverride,
  externalRecords,
  externalPagination,
  externalSummary,
  externalMonth,
  onPageChange,
}: Props) {
  const months = useMemo(() => getPastMonths(12), []);
  const defaultMonth = months[0];

function getTodayIST(): string {
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = String(nowIST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

  // Employee-mode state
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [summary, setSummary] = useState<Record<AttendanceStatus, number>>({
    present: 0, absent: 0, leave: 0, "half-day": 0,
  });
  const [month, setMonth] = useState(defaultMonth);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Employee mode: fetch own records ──────────────────────────────────────
  const fetchMyRecords = useCallback(
    async (
      page: number,
      override?: { month?: string; dateFrom?: string; dateTo?: string; status?: string }
    ) => {
      if (isAdmin) return;
      setLoading(true);

      const m = override?.month !== undefined ? override.month : month;
      const dFrom = override?.dateFrom !== undefined ? override.dateFrom : dateFrom;
      const dTo = override?.dateTo !== undefined ? override.dateTo : dateTo;
      const st = override?.status !== undefined ? override.status : statusFilter;

      try {
        const params = new URLSearchParams();
        if (m && !dFrom && !dTo) params.set("month", m);
        if (dFrom) params.set("dateFrom", dFrom);
        if (dTo) params.set("dateTo", dTo);
        if (st) params.set("status", st);
        params.set("page", String(page));
        params.set("limit", "31");

        const res = await fetch(`/api/attendance/my?${params.toString()}`);
        if (!res.ok) {
          toast.error("Failed to load attendance history");
          return;
        }
        const data = await res.json();
        setRecords(data.records || []);
        setPagination({
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.totalPages || 1,
          total: data.pagination?.total || 0,
        });
        setSummary(
          data.summary || { present: 0, absent: 0, leave: 0, "half-day": 0 }
        );
      } catch {
        toast.error("Network error");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, month, dateFrom, dateTo, statusFilter]
  );

  useEffect(() => {
    if (!isAdmin) {
      fetchMyRecords(1, { month: defaultMonth });
    }
  }, [isAdmin, defaultMonth]);

  // Resolved values (admin = external, employee = local)
  const resolvedRecords = isAdmin ? (externalRecords ?? []) : records;
  const resolvedPagination = isAdmin
    ? (externalPagination ?? { page: 1, totalPages: 1, total: 0 })
    : pagination;
  const resolvedSummary = isAdmin
    ? (externalSummary ?? { present: 0, absent: 0, leave: 0, "half-day": 0 })
    : summary;

  function handlePageChange(p: number) {
    if (isAdmin) {
      onPageChange?.(p);
    } else {
      fetchMyRecords(p);
    }
  }

  function handleEmployeeClearAll() {
    setMonth(defaultMonth);
    setDateFrom("");
    setDateTo("");
    setStatusFilter("");
    fetchMyRecords(1, { month: defaultMonth, dateFrom: "", dateTo: "", status: "" });
  }

  const todayStr = getTodayIST();
  const hasEmployeeActiveFilters =
    month !== defaultMonth || !!dateFrom || !!dateTo || !!statusFilter;

  const currentMonth = isAdmin ? (externalMonth || defaultMonth) : (month || defaultMonth);

  const { page, totalPages, total } = resolvedPagination;
  const limit = isAdmin
    ? (externalPagination
        ? Math.ceil((externalPagination.total || 1) / (externalPagination.totalPages || 1)) || 50
        : 50)
    : 31;

  return (
    <div className="space-y-4">
      {/* Employee filter bar */}
      {!isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              🔍 Filter My Attendance
            </h3>
            {hasEmployeeActiveFilters && (
              <button
                onClick={handleEmployeeClearAll}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Month */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => {
                  const val = e.target.value;
                  setMonth(val);
                  setDateFrom("");
                  setDateTo("");
                  fetchMyRecords(1, { month: val, dateFrom: "", dateTo: "" });
                }}
                disabled={loading}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <option value="">— Any month —</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {new Date(m + "-01").toLocaleDateString("en-IN", {
                      month: "long",
                      year: "numeric",
                    })}
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                From Date
              </label>
              <input
                type="date"
                max={dateTo || todayStr}
                value={dateFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  let newTo = dateTo;
                  if (newTo && val && val > newTo) {
                    newTo = val;
                    setDateTo(val);
                  }
                  setDateFrom(val);
                  setMonth("");
                  fetchMyRecords(1, { dateFrom: val, dateTo: newTo, month: "" });
                }}
                disabled={loading}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                To Date
              </label>
              <input
                type="date"
                min={dateFrom || undefined}
                max={todayStr}
                value={dateTo}
                onChange={(e) => {
                  const val = e.target.value;
                  let newFrom = dateFrom;
                  if (newFrom && val && val < newFrom) {
                    newFrom = val;
                    setDateFrom(val);
                  }
                  setDateTo(val);
                  setMonth("");
                  fetchMyRecords(1, { dateTo: val, dateFrom: newFrom, month: "" });
                }}
                disabled={loading}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setStatusFilter(val);
                  fetchMyRecords(1, { status: val });
                }}
                disabled={loading}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <option value="">— All statuses —</option>
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONFIG[s].emoji} {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ATTENDANCE_STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <div
              key={s}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cfg.bgColor} border-transparent`}
            >
              <span className="text-base">{cfg.emoji}</span>
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.color}`}>
                  {cfg.label}
                </p>
                <p className={`text-lg font-bold ${cfg.color}`}>
                  {resolvedSummary[s]}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-blue-500 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading attendance…</p>
          </div>
        ) : resolvedRecords.length === 0 ? (
          <div className="p-16 text-center">
            <svg
              className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              No records for{" "}
              {new Date(currentMonth + "-01").toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Attendance records will appear here once marked.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 dark:divide-zinc-700">
                <thead className="bg-zinc-50 dark:bg-zinc-700">
                  <tr>
                    {isAdmin && (
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Employee
                      </th>
                    )}
                    {["Date", "Status", "Marked By", "Check-in Time", "Note"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                    {isAdmin && (
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {resolvedRecords.map((rec) => {
                    const cfg = STATUS_CONFIG[rec.status];
                    return (
                      <tr
                        key={rec.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                      >
                        {isAdmin && (
                          <td className="px-3 py-2">
                            <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                              {rec.userName}
                            </div>
                            <div className="text-[10px] text-zinc-400 capitalize">
                              {rec.role === "wm"
                                ? "WM"
                                : rec.role === "wcm"
                                ? "WCM"
                                : rec.role === "wtc"
                                ? "WTC"
                                : rec.role.replace(/_/g, " ")}
                            </div>
                          </td>
                        )}
                        {/* Date */}
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-zinc-300">
                          {new Date(rec.date + "T00:00:00").toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        {/* Status badge */}
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${cfg.bgColor} ${cfg.color}`}
                          >
                            {cfg.emoji} {cfg.label}
                          </span>
                        </td>
                        {/* Marked by */}
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-zinc-300 capitalize">
                          {rec.markedBy === "system" ? (
                            <span className="text-zinc-400">System</span>
                          ) : rec.markedBy === "admin" ? (
                            <span className="text-purple-600 dark:text-purple-400 font-medium">Admin</span>
                          ) : (
                            "Self"
                          )}
                        </td>
                        {/* Check-in time */}
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-zinc-300">
                          {rec.checkInTime ? (
                            new Date(rec.checkInTime).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        {/* Note */}
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate">
                          {rec.note || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                        {/* Override button — admin only */}
                        {isAdmin && (
                          <td className="px-3 py-2">
                            <button
                              onClick={() => onOverride?.(rec)}
                              className="px-2 py-1 text-[11px] font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors"
                            >
                              Override
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — matches activity/page.tsx exactly */}
            <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {total > 0 ? (
                    <>
                      Showing{" "}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {(page - 1) * limit + 1}
                      </span>{" "}
                      –{" "}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {Math.min(page * limit, total)}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {total}
                      </span>{" "}
                      results
                    </>
                  ) : (
                    "No results"
                  )}
                </p>
                <nav className="inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="px-2 py-1.5 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === totalPages ||
                        (p >= page - 1 && p <= page + 1)
                    )
                    .flatMap((p, idx, arr) => {
                      const elements = [];
                      if (idx > 0 && p - arr[idx - 1] > 1) {
                        elements.push(
                          <span
                            key={`ellipsis-${p}`}
                            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-500"
                          >
                            ...
                          </span>
                        );
                      }
                      elements.push(
                        <button
                          key={`page-${p}`}
                          onClick={() => handlePageChange(p)}
                          className={`px-3 py-1.5 border text-xs font-medium ${
                            p === page
                              ? "z-10 bg-foreground border-foreground text-background"
                              : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {p}
                        </button>
                      );
                      return elements;
                    })}

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className="px-2 py-1.5 rounded-r-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
