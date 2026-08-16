"use client";

/**
 * AttendanceFilterBar
 *
 * Admin-only filter bar for /dashboard/attendance-admin.
 * Provides: month picker, date-from / date-to, employee dropdown, status dropdown.
 * Calls onFilterChange whenever any filter value changes.
 */

import { useEffect, useState } from "react";
import { ATTENDANCE_STATUSES, STATUS_CONFIG } from "@/lib/attendance/constants";
import type { AttendanceStatus } from "@/lib/attendance/types";

export interface AttendanceFilters {
  month: string;
  dateFrom: string;
  dateTo: string;
  userId: string;
  status: string;
}

interface UserOption {
  id: number;
  name: string;
  role: string;
}

interface Props {
  users: UserOption[];
  filters: AttendanceFilters;
  onFilterChange: (filters: AttendanceFilters) => void;
  isLoading?: boolean;
}

// Generates last 12 months as "YYYY-MM" starting from current IST month
function getPastMonths(count = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  let year = nowIST.getUTCFullYear();
  let month = nowIST.getUTCMonth(); // 0 - 11

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

// Returns today's YYYY-MM-DD string in Asia/Kolkata timezone
function getTodayIST(): string {
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = String(nowIST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AttendanceFilterBar({
  users,
  filters,
  onFilterChange,
  isLoading = false,
}: Props) {
  const months = getPastMonths(12);
  const [localFilters, setLocalFilters] = useState<AttendanceFilters>(filters);

  // Sync parent filters if they change externally
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  function update(key: keyof AttendanceFilters, value: string) {
    const updated = { ...localFilters, [key]: value };
    // When month is changed, clear custom date range
    if (key === "month") {
      updated.dateFrom = "";
      updated.dateTo = "";
    }
    // When custom dates set, clear month & auto-adjust range
    if (key === "dateFrom") {
      updated.month = "";
      if (updated.dateTo && value && value > updated.dateTo) {
        updated.dateTo = value;
      }
    }
    if (key === "dateTo") {
      updated.month = "";
      if (updated.dateFrom && value && value < updated.dateFrom) {
        updated.dateFrom = value;
      }
    }
    setLocalFilters(updated);
    onFilterChange(updated);
  }

  function handleClearAll() {
    const today = getTodayIST();
    const reset: AttendanceFilters = {
      month: "",
      dateFrom: today,
      dateTo: today,
      userId: "",
      status: "",
    };
    setLocalFilters(reset);
    onFilterChange(reset);
  }

  const todayStr = getTodayIST();
  const hasActiveFilters =
    localFilters.dateFrom !== todayStr ||
    localFilters.dateTo !== todayStr ||
    !!localFilters.month ||
    !!localFilters.userId ||
    !!localFilters.status;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          🔍 Filter Attendance
        </h3>
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Month picker */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Month
          </label>
          <select
            value={localFilters.month}
            onChange={(e) => update("month", e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
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

        {/* Date From */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            From Date
          </label>
          <input
            type="date"
            max={localFilters.dateTo || todayStr}
            value={localFilters.dateFrom}
            onChange={(e) => update("dateFrom", e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            To Date
          </label>
          <input
            type="date"
            min={localFilters.dateFrom || undefined}
            max={todayStr}
            value={localFilters.dateTo}
            onChange={(e) => update("dateTo", e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>

        {/* Employee dropdown */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Employee
          </label>
          <select
            value={localFilters.userId}
            onChange={(e) => update("userId", e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          >
            <option value="">— All employees —</option>
            {users
              .filter((u) => u.role !== "admin")
              .map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} (
                  {u.role === "wm"
                    ? "WM"
                    : u.role === "wcm"
                    ? "WCM"
                    : u.role === "wtc"
                    ? "WTC"
                    : u.role === "supervisor"
                    ? "Supervisor"
                    : u.role.replace(/_/g, " ")}
                  )
                </option>
              ))}
          </select>
        </div>

        {/* Status dropdown */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Status
          </label>
          <select
            value={localFilters.status}
            onChange={(e) => update("status", e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
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
  );
}
