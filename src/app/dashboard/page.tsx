"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";
import CheckInOutCard from "@/components/CheckInOutCard";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting";
};

type LeadStats = {
  dueToday: number;
  newAssigned: number;
  pendingFollowUps: number;
};

type EmployeePerformance = {
  employeeId: number;
  employeeName: string;
  employeeUsername: string;
  userRole: string;

  totalLeads: number;

  newLeads: number;
  callBack: number;
  notAnswering: number;
  meetingScheduled: number;
  notInterested: number;
  wrongNumber: number;
  documentPending: number;
  paymentPending: number;
  sales: number;
};

type AdminStats = {
  employeesOnline: number;
  leadsCreatedToday: number;
  leadsWorkedToday: number;
  assignedLeads: number;
  unassignedLeads: number;
  employeePerformance: EmployeePerformance[];
  statusBreakdown: {
    "new-lead": number;
    "call-back": number;
    "not-answering": number;
    "meeting-scheduled": number;
    "not-interested": number;
    "wrong-number": number;
    "document-pending": number;
    "payment-pending": number;
    sales: number;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [leadStats, setLeadStats] = useState<LeadStats>({
    dueToday: 0,
    newAssigned: 0,
    pendingFollowUps: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [workHours, setWorkHours] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    workingDays: 0,
  });
  const [adminStats, setAdminStats] = useState<AdminStats>({
    employeesOnline: 0,
    leadsCreatedToday: 0,
    leadsWorkedToday: 0,
    assignedLeads: 0,
    unassignedLeads: 0,
    employeePerformance: [],
    statusBreakdown: {
      "new-lead": 0,
      "call-back": 0,
      "not-answering": 0,
      "meeting-scheduled": 0,
      "not-interested": 0,
      "wrong-number": 0,
      "document-pending": 0,
      "payment-pending": 0,
      sales: 0,
    },
  });
  const [loadingAdminStats, setLoadingAdminStats] = useState(false);

  // Function to fetch admin stats
  const fetchAdminStats = async () => {
    setLoadingAdminStats(true);
    try {
      const statsRes = await fetch("/api/dashboard/admin-stats");
      if (statsRes.ok) {
        const statsData: AdminStats = await statsRes.json();
        setAdminStats(statsData);
      }
    } catch (err) {
      console.error("Failed to fetch admin stats:", err);
    } finally {
      setLoadingAdminStats(false);
    }
  };

  // Function to fetch employee stats
  const fetchUserStats = async () => {
    setLoadingStats(true);
    try {
      const statsRes = await fetch("/api/dashboard/employee-stats");
      if (statsRes.ok) {
        const statsData: LeadStats = await statsRes.json();
        setLeadStats(statsData);
      }
    } catch (err) {
      console.error("Failed to fetch user stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  type ActivityHours = {
    date: string;
    workHours: number;
    trainingHours: number;
  };

  // Function to fetch work hours from activities
  const fetchWorkHours = async () => {
    try {
      const res = await fetch("/api/activity/list?limit=1000");

      if (!res.ok) return;

      const data = await res.json();

      const activities: ActivityHours[] = data.activities || [];

      const now = new Date();

      const todayString = now.toISOString().split("T")[0];

      const startOfWeek = new Date(now);

      startOfWeek.setDate(
        now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1),
      );

      startOfWeek.setHours(0, 0, 0, 0);

      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const todayHours = activities
        .filter((activity: { date: string }) => activity.date === todayString)
        .reduce(
          (
            sum: number,
            activity: {
              workHours?: number;
              trainingHours?: number;
            },
          ) =>
            sum + ((activity.workHours || 0) + (activity.trainingHours || 0)),
          0,
        );

      const weekHours = activities
        .filter((activity) => {
          const date = new Date(activity.date);

          return date >= startOfWeek && date <= now;
        })
        .reduce(
          (
            sum: number,
            activity: {
              workHours?: number;
              trainingHours?: number;
            },
          ) =>
            sum + ((activity.workHours || 0) + (activity.trainingHours || 0)),
          0,
        );

      const monthActivities = activities.filter(
        (activity: { date: string }) => {
          const d = new Date(activity.date);

          return (
            d.getMonth() === currentMonth && d.getFullYear() === currentYear
          );
        },
      );

      const monthHours = monthActivities.reduce(
        (
          sum: number,
          activity: {
            workHours?: number;
            trainingHours?: number;
          },
        ) => sum + ((activity.workHours || 0) + (activity.trainingHours || 0)),
        0,
      );

      const workingDays = new Set(
        monthActivities
          .filter(
            (activity: {
              workHours?: number;
              trainingHours?: number;
              date: string;
            }) => (activity.workHours || 0) + (activity.trainingHours || 0) > 0,
          )
          .map((activity) => activity.date),
      ).size;

      setWorkHours({
        today: Number(todayHours.toFixed(2)),
        thisWeek: Number(weekHours.toFixed(2)),
        thisMonth: Number(monthHours.toFixed(2)),
        workingDays,
      });
    } catch (err) {
      console.error("Failed to fetch work hours:", err);
    }
  };

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const data: MeResponse = await res.json();
        setUser(data);

        // Fetch lead stats for employees
        if (data.role === "employee" || data.role === "meeting") {
          fetchUserStats();
          fetchWorkHours();
        }

        // Fetch admin stats for admins
        if (data.role === "admin") {
          fetchAdminStats();
        }
      } catch (err) {
        console.error(err);
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [router]);

  if (loading) return <div className="p-8">Loading...</div>;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Welcome back, {user.name}!
              </h2>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                Here&apos;s what&apos;s happening with your account today.
              </p>
            </div>
            {user.role === "admin" && (
              <button
                onClick={fetchAdminStats}
                disabled={loadingAdminStats}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors shadow-sm"
              >
                <svg
                  className={`w-5 h-5 ${
                    loadingAdminStats ? "animate-spin" : ""
                  }`}
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
                <span>{loadingAdminStats ? "Refreshing..." : "Refresh"}</span>
              </button>
            )}
          </div>
        </div>

        {user.role === "admin" ? (
          <div className="space-y-6">
            {loadingAdminStats ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <>
                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Employees Online */}
                  <div className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-green-100 dark:bg-green-900/40 rounded-full p-3">
                        <svg
                          className="w-6 h-6 text-green-600 dark:text-green-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {adminStats.employeesOnline}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-green-900 dark:text-green-200">
                      Employees/Meeting Online
                    </h4>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Currently checked in
                    </p>
                  </div>

                  {/* Leads Created Today */}
                  <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-blue-100 dark:bg-blue-900/40 rounded-full p-3">
                        <svg
                          className="w-6 h-6 text-blue-600 dark:text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {adminStats.leadsCreatedToday}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Leads Created Today
                    </h4>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      New opportunities
                    </p>
                  </div>

                  {/* Leads Worked Today */}
                  <div className="bg-linear-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-cyan-100 dark:bg-cyan-900/40 rounded-full p-3">
                        <svg
                          className="w-6 h-6 text-cyan-600 dark:text-cyan-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                          />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                        {adminStats.leadsWorkedToday}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-cyan-900 dark:text-cyan-200">
                      Leads Worked Today
                    </h4>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
                      With notes added
                    </p>
                  </div>

                  {/* Assigned Leads */}
                  <div className="bg-linear-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-purple-100 dark:bg-purple-900/40 rounded-full p-3">
                        <svg
                          className="w-6 h-6 text-purple-600 dark:text-purple-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                        {adminStats.assignedLeads}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                      Assigned Leads
                    </h4>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      Being handled
                    </p>
                  </div>

                  {/* Unassigned Leads */}
                  <div className="bg-linear-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-orange-100 dark:bg-orange-900/40 rounded-full p-3">
                        <svg
                          className="w-6 h-6 text-orange-600 dark:text-orange-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                        {adminStats.unassignedLeads}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                      Unassigned Leads
                    </h4>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      Needs assignment
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Lead Status Breakdown */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                    <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                      Lead Status Breakdown
                    </h3>
                    <div className="space-y-4">
                      {/* New Lead */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            New Lead
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["new-lead"]}
                        </span>
                      </div>

                      {/* Call Back */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Call Back
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["call-back"]}
                        </span>
                      </div>

                      {/* Not Answering */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Not Answering
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["not-answering"]}
                        </span>
                      </div>

                      {/* Meeting Scheduled */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Meeting Scheduled
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["meeting-scheduled"]}
                        </span>
                      </div>

                      {/* Not Interested */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Not Interested
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["not-interested"]}
                        </span>
                      </div>

                      {/* Wrong Number */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Wrong Number
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["wrong-number"]}
                        </span>
                      </div>

                      {/* Document Pending */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Document Pending
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["document-pending"]}
                        </span>
                      </div>

                      {/* Payment Pending */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Payment Pending
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown["payment-pending"]}
                        </span>
                      </div>

                      {/* Sales */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Sales
                          </span>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {adminStats.statusBreakdown.sales}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Employee & Meeting Performance Metrics */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                    <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                      Employee & Meeting Performance
                    </h3>

                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {adminStats.employeePerformance.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center py-4">
                          No performance data available
                        </p>
                      ) : (
                        adminStats.employeePerformance.map((employee) => (
                          <div
                            key={employee.employeeId}
                            className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {employee.employeeName}
                                </h4>

                                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                  @{employee.employeeUsername}
                                </p>

                                <span
                                  className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
                                    employee.userRole === "meeting"
                                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                  }`}
                                >
                                  {employee.userRole === "meeting"
                                    ? "Meeting"
                                    : "Employee"}
                                </span>
                              </div>

                              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                                {employee.totalLeads}
                              </span>
                            </div>

                            <div className="flex items-center flex-wrap gap-1 text-xs">
                              <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded">
                                💰 {employee.sales}
                              </span>

                              <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                                📄 {employee.documentPending}
                              </span>

                              <span className="px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 rounded">
                                💳 {employee.paymentPending}
                              </span>

                              <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                📅 {employee.meetingScheduled}
                              </span>

                              <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                                📞 {employee.callBack}
                              </span>

                              <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                🔄 {employee.notAnswering}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Lead Statistics */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                  Lead Overview
                </h3>

                {loadingStats ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Leads Due Today */}
                    <button
                      onClick={() => router.push("/dashboard/leads")}
                      className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="bg-red-100 dark:bg-red-900/40 rounded-full p-2">
                          <svg
                            className="w-5 h-5 text-red-600 dark:text-red-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {leadStats.dueToday}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">
                        Leads Due Today
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Requires immediate attention
                      </p>
                    </button>

                    {/* New Leads Assigned */}
                    <button
                      onClick={() => router.push("/dashboard/leads")}
                      className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="bg-blue-100 dark:bg-blue-900/40 rounded-full p-2">
                          <svg
                            className="w-5 h-5 text-blue-600 dark:text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                            />
                          </svg>
                        </div>
                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {leadStats.newAssigned}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                        New Leads Assigned
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Last 7 days
                      </p>
                    </button>

                    {/* Pending Follow-ups */}
                    <button
                      onClick={() => router.push("/dashboard/leads")}
                      className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="bg-yellow-100 dark:bg-yellow-900/40 rounded-full p-2">
                          <svg
                            className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            />
                          </svg>
                        </div>
                        <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                          {leadStats.pendingFollowUps}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                        Pending Follow-ups
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        Action required
                      </p>
                    </button>
                  </div>
                )}
              </div>

              {/* Work Hours Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">
                  Work Hours
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                  Track your work hours and manage your daily activities.
                </p>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-50 dark:bg-zinc-700 rounded-lg p-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Today&apos;s Hours
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {workHours.today}h
                    </p>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-700 rounded-lg p-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      This Week
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {workHours.thisWeek}h
                    </p>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-700 rounded-lg p-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      This Month
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {workHours.thisMonth}h
                    </p>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-700 rounded-lg p-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Working Days
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {workHours.workingDays}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Check-in/Check-out Card */}
            <div>
              <CheckInOutCard />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
