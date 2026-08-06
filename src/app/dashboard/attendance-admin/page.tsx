"use client";

/**
 * /dashboard/attendance-admin
 *
 * Admin-only attendance management page.
 * Layout matches src/app/dashboard/activity/page.tsx exactly.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import AttendanceFilterBar, {
  type AttendanceFilters,
} from "@/components/attendance/AttendanceFilterBar";
import AttendanceHistoryTable from "@/components/attendance/AttendanceHistoryTable";
import AttendanceOverrideModal from "@/components/attendance/AttendanceOverrideModal";
import { STATUS_CONFIG } from "@/lib/attendance/constants";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/attendance/types";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role:
    | "admin"
    | "telecaller"
    | "employee"
    | "meeting"
    | "billing"
    | "business_development"
    | "case_manager";
};

type UserOption = { id: number; name: string; role: string };

type Summary = Record<AttendanceStatus, number>;

function getTodayIST(): string {
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = String(nowIST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AttendanceAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters - default to Today's date
  const todayStr = getTodayIST();
  const [filters, setFilters] = useState<AttendanceFilters>({
    month: "",
    dateFrom: todayStr,
    dateTo: todayStr,
    userId: "",
    status: "",
  });

  // Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [summary, setSummary] = useState<Summary>({
    present: 0, absent: 0, leave: 0, "half-day": 0,
  });
  const [pagination, setPagination] = useState({
    page: 1, totalPages: 1, total: 0,
  });
  const [dataLoading, setDataLoading] = useState(false);

  // Override modal
  const [overrideRecord, setOverrideRecord] = useState<AttendanceRecord | null>(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.role !== "admin") {
          router.push("/dashboard");
          return;
        }
        setUser(data);
      } else {
        toast.error("Please sign in to continue");
        router.push("/");
      }
      setLoading(false);
    })();
  }, [router]);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(
    async (page = 1) => {
      setDataLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.month && !filters.dateFrom && !filters.dateTo) {
          params.set("month", filters.month);
        }
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.userId) params.set("userId", filters.userId);
        if (filters.status) params.set("status", filters.status);
        params.set("page", String(page));
        params.set("limit", "50");

        const res = await fetch(`/api/attendance/all?${params.toString()}`);
        if (!res.ok) {
          toast.error("Failed to load attendance records");
          return;
        }
        const data = await res.json();
        setRecords(data.records || []);
        setUsers(data.users || []);
        setSummary(data.summary || { present: 0, absent: 0, leave: 0, "half-day": 0 });
        setPagination({
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.totalPages || 1,
          total: data.pagination?.total || 0,
        });
      } catch {
        toast.error("Network error");
      } finally {
        setDataLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    if (!loading && user) {
      fetchData(1);
    }
  }, [loading, user, fetchData]);

  function handleFilterChange(f: AttendanceFilters) {
    setFilters(f);
  }

  function handleOverride(record: AttendanceRecord) {
    setOverrideRecord(record);
  }

  function handleOverrideSuccess(updated: AttendanceRecord) {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setOverrideRecord(null);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              All Attendance
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              View and manage attendance records for all employees.
            </p>
          </div>
          <button
            onClick={() => fetchData(pagination.page)}
            disabled={dataLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg
              className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {dataLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-4">
          <AttendanceFilterBar
            users={users}
            filters={filters}
            onFilterChange={handleFilterChange}
            isLoading={dataLoading}
          />
        </div>

        {/* Table */}
        <AttendanceHistoryTable
          isAdmin={true}
          onOverride={handleOverride}
          externalRecords={records}
          externalPagination={pagination}
          externalSummary={summary}
          externalMonth={
            filters.month ||
            filters.dateFrom?.slice(0, 7) ||
            todayStr.slice(0, 7)
          }
          onPageChange={(p) => fetchData(p)}
        />
      </div>

      {/* Override modal */}
      {overrideRecord && (
        <AttendanceOverrideModal
          record={overrideRecord}
          onSuccess={handleOverrideSuccess}
          onClose={() => setOverrideRecord(null)}
        />
      )}
    </div>
  );
}
