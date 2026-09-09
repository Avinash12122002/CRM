"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import UserTimelineModal from "@/components/wfh/UserTimelineModal";

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
    | "case_manager"
    | "wm"
    | "wcm"
    | "wtc"
    | "supervisor"
    | "follow_up"
    | "trainee";
};

type Activity = {
  id: number;
  userId: number;
  firstCheckIn?: string;
  lastCheckOut?: string;
  userName: string;
  userUsername: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  workHours: number;
  breakHours: number;
  trainingHours: number;
  totalWorkingDay: number;
  sessions: number;
  lateMinutes: number;
  status: "working" | "idle" | "break" | "training" | "completed";
  isGhostAlert?: boolean;
  workVerificationStatus?: string;
  actionsToday?: number;
};

type MonitoredUser = {
  userId: number;
  name: string;
  username: string;
  role: string;
  isCheckedIn: boolean;
  status: "working" | "idle" | "break" | "training" | "completed" | "not_checked_in";
  checkIn: string | null;
  checkOut: string | null;
  elapsedMinutes: number;
  activeMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  actionsToday: number;
  lastActionAt: string | null;
  latestActionSummary: string | null;
  isGhostAlert: boolean;
  workVerificationStatus: string;
};

type WfhSummary = {
  totalWorkforce: number;
  activeNow: number;
  idleNow: number;
  onBreak: number;
  ghostAlerts: number;
  checkedOut: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export default function ActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Tab state (admin gets WFH Live Monitor by default)
  const [activeTab, setActiveTab] = useState<"wfh_monitor" | "records">("wfh_monitor");

  // WFH Monitor State
  const [wfhData, setWfhData] = useState<{ summary: WfhSummary; users: MonitoredUser[]; date: string } | null>(null);
  const [loadingWfh, setLoadingWfh] = useState(false);
  const [wfhRoleFilter, setWfhRoleFilter] = useState("all");
  const [wfhStatusFilter, setWfhStatusFilter] = useState("all");
  const [wfhSearchQuery, setWfhSearchQuery] = useState("");
  const [inspectUser, setInspectUser] = useState<{ userId: number; name: string; date?: string } | null>(null);

  // Historical Records State
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [selectedTelecaller, setSelectedTelecaller] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState("");
  const [telecallers, setTelecallers] = useState<
    { id: number; name: string; username: string }[]
  >([]);
  const [telecallerDropdownOpen, setTelecallerDropdownOpen] = useState(false);
  const [telecallerSearchQuery, setTelecallerSearchQuery] = useState("");
  const telecallerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.role !== "admin") {
          setActiveTab("records");
        }
      } else {
        toast.error("Please sign in to continue");
        router.push("/");
      }
      setLoading(false);
    })();
  }, [router]);

  const fetchWfhMonitor = useCallback(async () => {
    if (!user || user.role !== "admin") return;
    setLoadingWfh(true);
    try {
      let url = "/api/admin/wfh-monitor";
      if (selectedDate) url += `?date=${selectedDate}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWfhData(data);
      }
    } catch (err) {
      console.error("Failed to fetch WFH monitor data:", err);
    } finally {
      setLoadingWfh(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") {
      fetchTelecallers();
      fetchWfhMonitor();
    }
    fetchActivities(1);
  }, [user, fetchWfhMonitor]);

  // Polling for WFH monitor (every 20 seconds when on WFH tab)
  useEffect(() => {
    if (!user || user.role !== "admin" || activeTab !== "wfh_monitor") return;
    const interval = setInterval(fetchWfhMonitor, 20000);
    return () => clearInterval(interval);
  }, [user, activeTab, fetchWfhMonitor]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === "wfh_monitor") {
      fetchWfhMonitor();
    } else {
      fetchActivities(1);
    }
  }, [selectedDate, selectedTelecaller, activeTab, fetchWfhMonitor]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        telecallerDropdownRef.current &&
        !telecallerDropdownRef.current.contains(event.target as Node)
      ) {
        setTelecallerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchTelecallers() {
    try {
      const res = await fetch("/api/auth/users");
      if (!res.ok) return;
      const data = await res.json();
      const nonAdminUsers = (data.users || []).filter(
        (u: { role: string }) => u.role !== "admin",
      );
      setTelecallers(nonAdminUsers);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  }

  async function fetchActivities(page: number, limitOverride?: number) {
    setLoadingActivities(true);
    const currentLimit = limitOverride ?? pagination.limit;
    try {
      let url = `/api/activity/list?page=${page}&limit=${currentLimit}`;
      if (selectedDate) url += `&date=${selectedDate}`;
      if (selectedTelecaller && user?.role === "admin") url += `&userId=${selectedTelecaller}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch activities");
      const data = await res.json();
      setActivities(data.activities || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch activities");
    } finally {
      setLoadingActivities(false);
    }
  }

  function handlePageChange(newPage: number) {
    setPagination((prev) => ({ ...prev, page: newPage }));
    fetchActivities(newPage);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(dateString?: string | null) {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatHours(hours?: number) {
    return `${Number(hours || 0).toFixed(2)}h`;
  }

  function formatMins(mins?: number) {
    const m = mins || 0;
    const hrs = Math.floor(m / 60);
    const rem = m % 60;
    return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
  }

  const statusConfig = {
    working:   { label: "Working",   cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    idle:      { label: "Idle (Paused)", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    break:     { label: "On Break",  cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
    training:  { label: "Training",  cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
    completed: { label: "Completed", cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
  };

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

  // Filtered WFH users
  const filteredWfhUsers = (wfhData?.users || []).filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(wfhSearchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(wfhSearchQuery.toLowerCase());
    const matchesRole = wfhRoleFilter === "all" || u.role === wfhRoleFilter;
    const matchesStatus =
      wfhStatusFilter === "all" ||
      (wfhStatusFilter === "ghost" && u.isGhostAlert) ||
      (wfhStatusFilter === "active" && u.status === "working") ||
      (wfhStatusFilter === "idle" && u.status === "idle") ||
      (wfhStatusFilter === "break" && u.status === "break") ||
      (wfhStatusFilter === "completed" && u.status === "completed") ||
      (wfhStatusFilter === "not_checked_in" && u.status === "not_checked_in");
    return matchesSearch && matchesRole && matchesStatus;
  });

  const filteredTelecallers = telecallers.filter(
    (emp) =>
      emp.name.toLowerCase().includes(telecallerSearchQuery.toLowerCase()) ||
      emp.username.toLowerCase().includes(telecallerSearchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header & Tabs */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <span>{user.role === "admin" ? "WFH Workforce Activity" : "My Activity"}</span>
              {user.role === "admin" && wfhData?.summary.ghostAlerts ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 animate-pulse border border-red-300 dark:border-red-800">
                  ⚠️ {wfhData.summary.ghostAlerts} Ghost Alert{wfhData.summary.ghostAlerts > 1 ? "s" : ""}
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {user.role === "admin"
                ? "Live real-time monitoring of active working time, idle gaps, and tangible CRM actions"
                : "View your personal shift history and recorded hours"}
            </p>
          </div>

          {/* Admin Tab Switcher */}
          {user.role === "admin" && (
            <div className="flex bg-zinc-200 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-300 dark:border-zinc-700">
              <button
                onClick={() => setActiveTab("wfh_monitor")}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "wfh_monitor"
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                🟢 Live WFH Monitor
              </button>
              <button
                onClick={() => setActiveTab("records")}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "records"
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                📋 Historical Logs
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: LIVE WFH MONITOR (ADMIN ONLY)                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {user.role === "admin" && activeTab === "wfh_monitor" && (
          <div className="space-y-5">
            {/* KPI Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Total Workforce</span>
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {wfhData?.summary.totalWorkforce || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">Active Now</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  {wfhData?.summary.activeNow || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium block">Idle / Away</span>
                <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {wfhData?.summary.idleNow || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/50">
                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium block">On Break</span>
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {wfhData?.summary.onBreak || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-red-200 dark:border-red-900/50">
                <span className="text-xs text-red-600 dark:text-red-400 font-medium block">Ghost Alerts</span>
                <span className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                  {wfhData?.summary.ghostAlerts ? "⚠️ " : ""}
                  {wfhData?.summary.ghostAlerts || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Checked Out</span>
                <span className="text-xl font-bold text-zinc-600 dark:text-zinc-300">
                  {wfhData?.summary.checkedOut || 0}
                </span>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="flex-1 min-w-[180px]">
                <input
                  type="text"
                  placeholder="Search by employee name..."
                  value={wfhSearchQuery}
                  onChange={(e) => setWfhSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                />
              </div>

              {/* Role Filter */}
              <div className="min-w-[140px]">
                <select
                  value={wfhRoleFilter}
                  onChange={(e) => setWfhRoleFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Roles</option>
                  <option value="telecaller">Telecaller / Employee</option>
                  <option value="wtc">WTC (WFH Telecaller)</option>
                  <option value="meeting">Meeting</option>
                  <option value="wm">WM (WFH Meeting)</option>
                  <option value="business_development">Business Development</option>
                  <option value="case_manager">Case Manager</option>
                  <option value="wcm">WCM (WFH Case Manager)</option>
                  <option value="billing">Billing</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="trainee">Trainee</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="min-w-[140px]">
                <select
                  value={wfhStatusFilter}
                  onChange={(e) => setWfhStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">🟢 Active Now</option>
                  <option value="idle">🟡 Idle / Inactive</option>
                  <option value="ghost">🔴 Ghost Alerts</option>
                  <option value="break">☕ On Break</option>
                  <option value="completed">⚪ Completed Shift</option>
                  <option value="not_checked_in">⛔ Not Checked In</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                />
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchWfhMonitor}
                disabled={loadingWfh}
                className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg transition font-medium flex items-center gap-1.5"
              >
                🔄 Refresh
              </button>
            </div>

            {/* WFH Monitoring Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-xs">
              {loadingWfh ? (
                <div className="p-16 text-center text-zinc-400 text-sm">
                  <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-blue-500 mb-3" />
                  <p>Syncing live workforce status...</p>
                </div>
              ) : filteredWfhUsers.length === 0 ? (
                <div className="p-16 text-center text-zinc-400 text-sm">
                  No employees match the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-700/60">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Live Status
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Shift Time
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Active vs Idle
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Actions Today
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Latest Activity
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/80">
                      {filteredWfhUsers.map((u) => {
                        return (
                          <tr
                            key={u.userId}
                            className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition ${
                              u.isGhostAlert ? "bg-red-50/40 dark:bg-red-950/20" : ""
                            }`}
                          >
                            {/* Employee */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {u.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-zinc-400">@{u.username}</span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 uppercase font-medium">
                                  {u.role.replace(/_/g, " ")}
                                </span>
                              </div>
                            </td>

                            {/* Live Status Badge */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {u.isGhostAlert ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300 border border-red-300 dark:border-red-700 animate-pulse">
                                  ⚠️ GHOST ALERT
                                </span>
                              ) : u.status === "working" ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  Active Now
                                </span>
                              ) : u.status === "idle" ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                  🟡 Idle / Away
                                </span>
                              ) : u.status === "break" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                                  ☕ Break
                                </span>
                              ) : u.status === "completed" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                                  Shift Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                                  Not Checked In
                                </span>
                              )}
                            </td>

                            {/* Shift Time */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-zinc-700 dark:text-zinc-300">
                                In: <span className="font-medium">{formatTime(u.checkIn)}</span>
                              </div>
                              <div className="text-zinc-400 text-[11px]">
                                Out: {formatTime(u.checkOut)}
                              </div>
                            </td>

                            {/* Active vs Idle */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {u.isCheckedIn || u.status === "completed" ? (
                                <div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                      {formatMins(u.activeMinutes)}
                                    </span>
                                    <span className="text-zinc-300 dark:text-zinc-600">/</span>
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                                      {formatMins(u.idleMinutes)} idle
                                    </span>
                                  </div>
                                  {/* Progress bar */}
                                  <div className="w-28 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-1.5 overflow-hidden flex">
                                    <div
                                      style={{
                                        width: `${
                                          u.activeMinutes + u.idleMinutes > 0
                                            ? Math.round(
                                                (u.activeMinutes / (u.activeMinutes + u.idleMinutes)) * 100
                                              )
                                            : 0
                                        }%`,
                                      }}
                                      className="bg-emerald-500 h-full"
                                    />
                                    <div
                                      style={{
                                        width: `${
                                          u.activeMinutes + u.idleMinutes > 0
                                            ? Math.round(
                                                (u.idleMinutes / (u.activeMinutes + u.idleMinutes)) * 100
                                              )
                                            : 0
                                        }%`,
                                      }}
                                      className="bg-amber-400 h-full"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>

                            {/* Actions Today */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`font-bold text-sm ${
                                  u.isGhostAlert
                                    ? "text-red-600 dark:text-red-400"
                                    : u.actionsToday > 0
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-zinc-400"
                                }`}
                              >
                                {u.actionsToday}
                              </span>
                              <span className="text-[11px] text-zinc-400 ml-1">actions</span>
                            </td>

                            {/* Latest Activity */}
                            <td className="px-4 py-3 max-w-[240px]">
                              {u.latestActionSummary ? (
                                <p className="truncate text-zinc-700 dark:text-zinc-300 text-xs" title={u.latestActionSummary}>
                                  {u.latestActionSummary}
                                </p>
                              ) : (
                                <span className="text-zinc-400 text-xs italic">No actions yet today</span>
                              )}
                            </td>

                            {/* Inspect Action */}
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <button
                                onClick={() => setInspectUser({ userId: u.userId, name: u.name })}
                                className="px-2.5 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 rounded-lg transition font-medium"
                              >
                                Timeline 👁️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: HISTORICAL ACTIVITY RECORDS TABLE                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(user.role !== "admin" || activeTab === "records") && (
          <div>
            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3 mb-4">
              <div className="flex flex-wrap items-end gap-3">
                {/* Telecaller dropdown — admin only */}
                {user.role === "admin" && (
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Employee
                    </label>
                    <div className="relative" ref={telecallerDropdownRef}>
                      <input
                        type="text"
                        placeholder="Search employee..."
                        value={telecallerSearchQuery}
                        onChange={(e) => setTelecallerSearchQuery(e.target.value)}
                        onFocus={() => setTelecallerDropdownOpen(true)}
                        className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400"
                      />
                      {selectedTelecaller && (
                        <button
                          type="button"
                          onClick={() => { setSelectedTelecaller(""); setTelecallerSearchQuery(""); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        >
                          ✕
                        </button>
                      )}
                      {telecallerDropdownOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setSelectedTelecaller(""); setTelecallerSearchQuery(""); setTelecallerDropdownOpen(false); }}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-700"
                          >
                            All Employees
                          </button>
                          {filteredTelecallers.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => { setSelectedTelecaller(emp.id.toString()); setTelecallerSearchQuery(emp.name); setTelecallerDropdownOpen(false); }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100 flex items-center justify-between"
                            >
                              <span className="font-medium">{emp.name}</span>
                              <span className="text-zinc-400 ml-1">@{emp.username}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Date */}
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                  />
                </div>

                {/* Rows per page */}
                <div className="min-w-[110px]">
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Rows per page
                  </label>
                  <select
                    value={pagination.limit}
                    onChange={(e) => {
                      const newLimit = Number(e.target.value);
                      setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
                      fetchActivities(1, newLimit);
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Clear */}
                <button
                  type="button"
                  onClick={() => { setSelectedDate(""); setSelectedTelecaller(""); setTelecallerSearchQuery(""); }}
                  className="px-3 py-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg transition font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              {loadingActivities ? (
                <div className="p-16 text-center">
                  <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-blue-500 mb-3" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading records...</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="p-16 text-center text-zinc-400">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">No records found</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Activity logs will appear here</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-100 dark:divide-zinc-700 text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-700/60">
                        <tr>
                          {user.role === "admin" && (
                            <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                              Employee
                            </th>
                          )}
                          {[
                            "Date", "Check In", "Check Out",
                            "Work", "Break", "Training", "Total",
                            ...(user.role === "admin" ? ["Late", "Sessions", "Actions", "Status", "Audit"] : ["Status"]),
                          ].map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {activities.map((activity) => {
                          const sc = statusConfig[activity.status] ?? statusConfig.completed;
                          return (
                            <tr
                              key={activity.id}
                              className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors ${
                                activity.isGhostAlert ? "bg-red-50/40 dark:bg-red-950/20" : ""
                              }`}
                            >
                              {user.role === "admin" && (
                                <td className="px-3 py-2">
                                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                                    {activity.userName}
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    @{activity.userUsername}
                                  </div>
                                </td>
                              )}
                              <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                                {formatDate(activity.date)}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                                {formatTime(activity.firstCheckIn || activity.checkIn)}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                                {activity.checkOut ? formatTime(activity.lastCheckOut || activity.checkOut) : "—"}
                              </td>
                              <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400">
                                {formatHours(activity.workHours)}
                              </td>
                              <td className="px-3 py-2 font-semibold text-yellow-600 dark:text-yellow-400">
                                {formatHours(activity.breakHours)}
                              </td>
                              <td className="px-3 py-2 font-semibold text-purple-600 dark:text-purple-400">
                                {formatHours(activity.trainingHours)}
                              </td>
                              <td className="px-3 py-2 font-bold text-blue-600 dark:text-blue-400">
                                {formatHours(activity.totalWorkingDay)}
                              </td>
                              {user.role === "admin" && (
                                <td className="px-3 py-2">
                                  {activity.lateMinutes > 0 ? (
                                    <span className="font-medium text-red-600 dark:text-red-400">
                                      {activity.lateMinutes}m
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400">—</span>
                                  )}
                                </td>
                              )}
                              {user.role === "admin" && (
                                <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                                  {activity.sessions}
                                </td>
                              )}
                              {user.role === "admin" && (
                                <td className="px-3 py-2">
                                  <span
                                    className={`font-bold ${
                                      activity.isGhostAlert
                                        ? "text-red-600 dark:text-red-400"
                                        : (activity.actionsToday || 0) > 0
                                        ? "text-blue-600 dark:text-blue-400"
                                        : "text-zinc-400"
                                    }`}
                                  >
                                    {activity.actionsToday || 0}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 ml-1">actions</span>
                                </td>
                              )}
                              <td className="px-3 py-2">
                                {activity.isGhostAlert ? (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
                                    ⚠️ {activity.workVerificationStatus === "low_activity" ? "LOW ACTIVITY" : "GHOST ALERT"}
                                  </span>
                                ) : (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${sc.cls}`}>
                                    {sc.label}
                                  </span>
                                )}
                              </td>
                              {user.role === "admin" && (
                                <td className="px-3 py-2 text-right">
                                  <button
                                    onClick={() =>
                                      setInspectUser({
                                        userId: activity.userId,
                                        name: activity.userName,
                                        date: activity.date,
                                      })
                                    }
                                    className="px-2.5 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 rounded-md transition font-medium"
                                  >
                                    Timeline 👁️
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
                    <p className="text-xs text-zinc-500">
                      Page {pagination.page} of {pagination.totalPages || 1} ({pagination.total} records)
                    </p>
                    <nav className="inline-flex rounded-md shadow-xs -space-x-px">
                      <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded-l-md text-xs disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded-r-md text-xs disabled:opacity-50"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inspect Action Timeline Modal */}
      {inspectUser && (
        <UserTimelineModal
          userId={inspectUser.userId}
          date={inspectUser.date || selectedDate || wfhData?.date || new Date().toISOString().split("T")[0]}
          onClose={() => setInspectUser(null)}
        />
      )}
    </div>
  );
}