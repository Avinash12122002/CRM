"use client";

/**
 * /dashboard/attendance
 *
 * Employee personal attendance page — accessible to all roles.
 * Layout matches src/app/dashboard/activity/page.tsx exactly.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import AttendanceStatusCard from "@/components/attendance/AttendanceStatusCard";
import AttendanceHistoryTable from "@/components/attendance/AttendanceHistoryTable";

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

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        toast.error("Please sign in to continue");
        router.push("/");
      }
      setLoading(false);
    })();
  }, [router]);

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
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            My Attendance
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Mark your daily attendance and view your complete history below.
          </p>
        </div>

        {/* Today's attendance card */}
        <div className="max-w-xs mb-6">
          <AttendanceStatusCard />
        </div>

        {/* History */}
        <AttendanceHistoryTable isAdmin={false} />
      </div>
    </div>
  );
}
