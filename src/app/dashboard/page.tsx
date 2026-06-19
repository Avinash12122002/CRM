"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";
import CheckInOutCard from "@/components/CheckInOutCard";
import AnnouncementBanner from "@/components/chat/AnnouncementBanner";
import BroadcastPanel from "@/components/chat/BroadcastPanel";
import OnlineUsers from "@/components/chat/OnlineUsers";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting";
};

type LeadStats = {
  dueToday: number;
  newAssigned: number;
};

type MeetingStats = {
  todayMeetingSlots: number;
  completedMeetings: number;
  cancelledMeetings: number;
};

type EmployeePerformance = {
  employeeId: number;
  employeeName: string;
  employeeUsername: string;
  userRole: string;
  // Active (non-sales) leads currently assigned to this user
  totalLeads: number;
  // Status breakdown of active leads
  newLeads: number;
  callBack: number;
  notAnswering: number;
  meetingScheduled: number;
  scheduledMeetings: number; // FIX: was missing from type
  notInterested: number;
  wrongNumber: number;
  documentPending: number;
  paymentPending: number;
  // Sales credited via meetingDetails or history — never includes totalLeads
  sales: number;
};

type AdminStats = {
  employeesOnline: number;
  leadsCreatedToday: number;
  leadsWorkedToday: number;
  assignedLeads: number;
  unassignedLeads: number;
  totalMeetings: number;   // FIX: was missing from type
  todayMeetings: number;   // FIX: was missing from type
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
  });
  const [meetingStats, setMeetingStats] = useState<MeetingStats>({
    todayMeetingSlots: 0,
    completedMeetings: 0,
    cancelledMeetings: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingMeetingStats, setLoadingMeetingStats] = useState(false);
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
    totalMeetings: 0,
    todayMeetings: 0,
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

  const fetchMeetingStats = async () => {
    setLoadingMeetingStats(true);
    try {
      const res = await fetch("/api/dashboard/meeting-stats");
      if (res.ok) {
        const data = await res.json();
        setMeetingStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch meeting stats:", err);
    } finally {
      setLoadingMeetingStats(false);
    }
  };

  type ActivityHours = {
    date: string;
    workHours: number;
    trainingHours: number;
  };

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
        .filter((a) => a.date === todayString)
        .reduce((sum, a) => sum + ((a.workHours || 0) + (a.trainingHours || 0)), 0);

      const weekHours = activities
        .filter((a) => {
          const date = new Date(a.date);
          return date >= startOfWeek && date <= now;
        })
        .reduce((sum, a) => sum + ((a.workHours || 0) + (a.trainingHours || 0)), 0);

      const monthActivities = activities.filter((a) => {
        const d = new Date(a.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const monthHours = monthActivities.reduce(
        (sum, a) => sum + ((a.workHours || 0) + (a.trainingHours || 0)),
        0,
      );

      const workingDays = new Set(
        monthActivities
          .filter((a) => (a.workHours || 0) + (a.trainingHours || 0) > 0)
          .map((a) => a.date),
      ).size;

      setWorkHours({
        today:       Number(todayHours.toFixed(2)),
        thisWeek:    Number(weekHours.toFixed(2)),
        thisMonth:   Number(monthHours.toFixed(2)),
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
        if (!res.ok) { router.push("/"); return; }
        const data: MeResponse = await res.json();
        setUser(data);
        if (data.role === "employee") {
          fetchUserStats();
          fetchWorkHours();
        }
        if (data.role === "meeting") {
          fetchUserStats();
          fetchMeetingStats();
          fetchWorkHours();
        }
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
      <AnnouncementBanner />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
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
                  className={`w-5 h-5 ${loadingAdminStats ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{loadingAdminStats ? "Refreshing..." : "Refresh"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            ADMIN DASHBOARD
        ══════════════════════════════════════════════════ */}
        {user.role === "admin" ? (
          <div className="space-y-6">
            {loadingAdminStats ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
              </div>
            ) : (
              <>
                {/* ── Quick Stats Grid ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                  {/* Employees Online */}
                  {/* FIX: bg-linear-to-br → bg-gradient-to-br (was invalid Tailwind class) */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-green-100 dark:bg-green-900/40 rounded-full p-3">
                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {adminStats.employeesOnline}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-green-900 dark:text-green-200">Employees/Meeting Online</h4>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">Currently checked in</p>
                  </div>

                  {/* Leads Created Today */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-blue-100 dark:bg-blue-900/40 rounded-full p-3">
                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {adminStats.leadsCreatedToday}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">Leads Created Today</h4>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">New opportunities</p>
                  </div>

                  {/* Leads Worked Today */}
                  <div className="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-cyan-100 dark:bg-cyan-900/40 rounded-full p-3">
                        <svg className="w-6 h-6 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                        {adminStats.leadsWorkedToday}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-cyan-900 dark:text-cyan-200">Leads Worked Today</h4>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">With notes added</p>
                  </div>

                  {/* Assigned Leads */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-purple-100 dark:bg-purple-900/40 rounded-full p-3">
                        <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                        {adminStats.assignedLeads}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">Assigned Leads</h4>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Being handled</p>
                  </div>

                  {/* Unassigned Leads */}
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-orange-100 dark:bg-orange-900/40 rounded-full p-3">
                        <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                        {adminStats.unassignedLeads}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-200">Unassigned Leads</h4>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Needs assignment</p>
                  </div>

                  {/* Today's Meetings — FIX: was fetched but never displayed */}
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="bg-violet-100 dark:bg-violet-900/40 rounded-full p-3">
                        <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-3xl font-bold text-violet-600 dark:text-violet-400">
                        {adminStats.todayMeetings}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Today&apos;s Meetings</h4>
                    <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                      {adminStats.totalMeetings} total scheduled
                    </p>
                  </div>
                </div>

                {/* ── Status Breakdown + Employee Performance ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Lead Status Breakdown */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                    <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                      Lead Status Breakdown
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: "new-lead",          label: "New Lead",          color: "bg-blue-500"   },
                        { key: "call-back",          label: "Call Back",         color: "bg-yellow-500" },
                        { key: "not-answering",      label: "Not Answering",     color: "bg-purple-500" },
                        { key: "meeting-scheduled",  label: "Meeting Scheduled", color: "bg-green-500"  },
                        { key: "not-interested",     label: "Not Interested",    color: "bg-red-500"    },
                        { key: "wrong-number",       label: "Wrong Number",      color: "bg-orange-500" },
                        { key: "document-pending",   label: "Document Pending",  color: "bg-indigo-500" },
                        { key: "payment-pending",    label: "Payment Pending",   color: "bg-pink-500"   },
                        { key: "sales",              label: "Sales",             color: "bg-emerald-500"},
                      ].map(({ key, label, color }) => (
                        <div key={key} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${color}`} />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
                          </div>
                          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            {adminStats.statusBreakdown[key as keyof typeof adminStats.statusBreakdown]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Employee & Meeting Performance */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                    <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                      Employee & Meeting Performance
                    </h3>
                    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                      {adminStats.employeePerformance.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center py-4">
                          No performance data available
                        </p>
                      ) : (
                        adminStats.employeePerformance.map((emp) => {
                          // FIX: totalLeads from API = active non-sales leads only.
                          // Show active + sales as the combined "Total" so the number
                          // reflects their full contribution, not just current pipeline.
                          const combinedTotal = emp.totalLeads + emp.sales;

                          return (
                            <div
                              key={emp.employeeId}
                              className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                            >
                              {/* Name + role badge + combined total */}
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <div className="min-w-0">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {emp.employeeName}
                                  </h4>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    @{emp.employeeUsername}
                                  </p>
                                  <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded font-medium ${
                                    emp.userRole === "meeting"
                                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                  }`}>
                                    {emp.userRole === "meeting" ? "Meeting" : "Employee"}
                                  </span>
                                </div>
                                {/* FIX: show active leads + sales combined, labelled clearly */}
                                <div className="text-right shrink-0">
                                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                                    {combinedTotal}
                                  </span>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">total</p>
                                </div>
                              </div>

                              {/* Active leads count */}
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                                Active leads: <span className="font-semibold text-gray-700 dark:text-gray-300">{emp.totalLeads}</span>
                              </p>

                              {/* Status badges — FIX: added newLeads, notInterested, wrongNumber (were missing) */}
                              <div className="flex items-center flex-wrap gap-1 text-xs">
                                {emp.sales > 0 && (
                                  <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded font-medium">
                                    💰 {emp.sales} sales
                                  </span>
                                )}
                                {emp.newLeads > 0 && (
                                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                    🆕 {emp.newLeads}
                                  </span>
                                )}
                                {emp.callBack > 0 && (
                                  <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                                    📞 {emp.callBack}
                                  </span>
                                )}
                                {emp.notAnswering > 0 && (
                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                    🔄 {emp.notAnswering}
                                  </span>
                                )}
                                {emp.meetingScheduled > 0 && (
                                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                    📅 {emp.meetingScheduled}
                                  </span>
                                )}
                                {emp.documentPending > 0 && (
                                  <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                                    📄 {emp.documentPending}
                                  </span>
                                )}
                                {emp.paymentPending > 0 && (
                                  <span className="px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 rounded">
                                    💳 {emp.paymentPending}
                                  </span>
                                )}
                                {emp.notInterested > 0 && (
                                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                                    ❌ {emp.notInterested}
                                  </span>
                                )}
                                {emp.wrongNumber > 0 && (
                                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                                    📵 {emp.wrongNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Broadcasts + Online Users ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <BroadcastPanel userRole={user.role} />
                  <OnlineUsers />
                </div>
              </>
            )}
          </div>
        ) : (
          /* ══════════════════════════════════════════════════
              EMPLOYEE / MEETING DASHBOARD
          ══════════════════════════════════════════════════ */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

              {/* Lead / Meeting Overview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                  {user.role === "meeting" ? "Meeting Overview" : "Lead Overview"}
                </h3>

                {loadingStats || loadingMeetingStats ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  </div>
                ) : (
                  <>
                    {/* Employee cards */}
                    {user.role === "employee" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          onClick={() => router.push("/dashboard/leads")}
                          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="bg-red-100 dark:bg-red-900/40 rounded-full p-2">
                              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <span className="text-2xl font-bold text-red-600 dark:text-red-400">{leadStats.dueToday}</span>
                          </div>
                          <p className="text-sm font-medium text-red-900 dark:text-red-200">Leads Due Today</p>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Requires immediate attention</p>
                        </button>

                        <button
                          onClick={() => router.push("/dashboard/leads")}
                          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="bg-blue-100 dark:bg-blue-900/40 rounded-full p-2">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
                            </div>
                            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{leadStats.newAssigned}</span>
                          </div>
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">New Leads Assigned</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Last 7 days</p>
                        </button>
                      </div>
                    )}

                    {/* Meeting user cards */}
                    {user.role === "meeting" && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button onClick={() => router.push("/dashboard/meetings")} className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">📅</span>
                            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{meetingStats.todayMeetingSlots}</span>
                          </div>
                          <p className="text-sm font-medium text-purple-900 dark:text-purple-200">Today&apos;s Meetings</p>
                          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Scheduled for today</p>
                        </button>

                        <button onClick={() => router.push("/dashboard/meetings")} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">✅</span>
                            <span className="text-2xl font-bold text-green-600 dark:text-green-400">{meetingStats.completedMeetings}</span>
                          </div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-200">Completed Meetings</p>
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">Successfully completed</p>
                        </button>

                        <button onClick={() => router.push("/dashboard/meetings")} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 hover:shadow-md transition-shadow text-left">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">❌</span>
                            <span className="text-2xl font-bold text-red-600 dark:text-red-400">{meetingStats.cancelledMeetings}</span>
                          </div>
                          <p className="text-sm font-medium text-red-900 dark:text-red-200">Cancelled Meetings</p>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Cancelled or rejected</p>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Work Hours */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">Work Hours</h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                  Track your work hours and manage your daily activities.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Today's Hours",  value: `${workHours.today}h`       },
                    { label: "This Week",      value: `${workHours.thisWeek}h`    },
                    { label: "This Month",     value: `${workHours.thisMonth}h`   },
                    { label: "Working Days",   value: String(workHours.workingDays) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-zinc-50 dark:bg-zinc-700 rounded-lg p-4">
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">{label}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Broadcasts (read-only for employee/meeting) */}
              <BroadcastPanel userRole={user.role} />
            </div>

            {/* Check-in/Check-out */}
            <div>
              <CheckInOutCard />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}