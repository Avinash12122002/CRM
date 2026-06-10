"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting";
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
  status: "working" | "break" | "training" | "completed";
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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState("");
  const [employees, setEmployees] = useState<
    { id: number; name: string; username: string }[]
  >([]);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") fetchEmployees();
    fetchActivities(1);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchActivities(1);
  }, [selectedDate, selectedEmployee]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        employeeDropdownRef.current &&
        !employeeDropdownRef.current.contains(event.target as Node)
      ) {
        setEmployeeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchEmployees() {
    try {
      const res = await fetch("/api/auth/users");
      if (!res.ok) return;
      const data = await res.json();
      const employeeUsers = (data.users || []).filter(
        (u: { role: string }) => u.role === "employee" || u.role === "meeting",
      );
      setEmployees(employeeUsers);
    } catch (error) {
      console.error("Failed to fetch employees:", error);
    }
  }

  async function fetchActivities(page: number) {
    setLoadingActivities(true);
    try {
      let url = `/api/activity/list?page=${page}&limit=${pagination.limit}`;
      if (selectedDate) url += `&date=${selectedDate}`;
      if (selectedEmployee && user?.role === "admin") url += `&userId=${selectedEmployee}`;
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

  function formatTime(dateString: string) {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatHours(hours?: number) {
    return `${Number(hours || 0).toFixed(2)}h`;
  }

  const statusConfig = {
    working:   { label: "Working",   cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
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

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(employeeSearchQuery.toLowerCase()) ||
      emp.username.toLowerCase().includes(employeeSearchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {user.role === "admin" ? "Employee Activity" : "My Activity"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {user.role === "admin"
              ? "Track and manage employee and meeting records"
              : "View your activity history"}
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3 mb-4">
          <div className="flex flex-wrap items-end gap-3">

            {/* Employee dropdown — admin only */}
            {user.role === "admin" && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Employee
                </label>
                <div className="relative" ref={employeeDropdownRef}>
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={employeeSearchQuery}
                    onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                    onFocus={() => setEmployeeDropdownOpen(true)}
                    className="w-full px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400"
                  />
                  {selectedEmployee && (
                    <button
                      type="button"
                      onClick={() => { setSelectedEmployee(""); setEmployeeSearchQuery(""); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {employeeDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setSelectedEmployee(""); setEmployeeSearchQuery(""); setEmployeeDropdownOpen(false); }}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-700"
                      >
                        All Employees
                      </button>
                      {filteredEmployees.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => { setSelectedEmployee(emp.id.toString()); setEmployeeSearchQuery(emp.name); setEmployeeDropdownOpen(false); }}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100"
                        >
                          <span className="font-medium">{emp.name}</span>
                          <span className="text-zinc-400 ml-1">@{emp.username}</span>
                        </button>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                          No employees found
                        </div>
                      )}
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
                  setPagination((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }));
                  fetchActivities(1);
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
              onClick={() => { setSelectedDate(""); setSelectedEmployee(""); setEmployeeSearchQuery(""); }}
              className="px-3 py-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg transition font-medium"
            >
              Clear
            </button>

          </div>

          {/* Active filter chips */}
          {(selectedEmployee || selectedDate) && (
            <div className="flex flex-wrap gap-2 mt-2.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-700">
              {selectedEmployee && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs rounded-full">
                  {employees.find((e) => e.id.toString() === selectedEmployee)?.name || "Employee"}
                  <button type="button" onClick={() => { setSelectedEmployee(""); setEmployeeSearchQuery(""); }} className="hover:text-blue-600">×</button>
                </span>
              )}
              {selectedDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs rounded-full">
                  {selectedDate}
                  <button type="button" onClick={() => setSelectedDate("")} className="hover:text-green-600">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {loadingActivities ? (
            <div className="p-16 text-center">
              <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-blue-500 mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading activities...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="p-16 text-center">
              <svg className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">No activities yet</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Employee activity records will appear here</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-100 dark:divide-zinc-700">
                  <thead className="bg-zinc-50 dark:bg-zinc-700">
                    <tr>
                      {user.role === "admin" && (
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                          Employee
                        </th>
                      )}
                      {[
                        "Date", "Check In", "Check Out",
                        "Work", "Break", "Training", "Total",
                        ...(user.role === "admin" ? ["Late", "Sessions"] : []),
                        "Status",
                      ].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
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
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                        >
                          {/* Employee (admin only) */}
                          {user.role === "admin" && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                                {activity.userName}
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                @{activity.userUsername}
                              </div>
                            </td>
                          )}

                          {/* Date */}
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-zinc-300">
                            {formatDate(activity.date)}
                          </td>

                          {/* Check In */}
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-zinc-300">
                            {formatTime(activity.firstCheckIn || activity.checkIn)}
                          </td>

                          {/* Check Out */}
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-zinc-300">
                            {activity.checkOut
                              ? formatTime(activity.lastCheckOut || activity.checkOut)
                              : <span className="text-zinc-400">—</span>}
                          </td>

                          {/* Work */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                              {formatHours(activity.workHours)}
                            </span>
                          </td>

                          {/* Break */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                              {formatHours(activity.breakHours)}
                            </span>
                          </td>

                          {/* Training */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                              {formatHours(activity.trainingHours)}
                            </span>
                          </td>

                          {/* Total */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                              {formatHours(activity.totalWorkingDay)}
                            </span>
                          </td>

                          {/* Late (admin only) */}
                          {user.role === "admin" && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              {activity.lateMinutes > 0 ? (
                                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                                  {activity.lateMinutes}m
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </td>
                          )}

                          {/* Sessions (admin only) */}
                          {user.role === "admin" && (
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-zinc-300">
                              {activity.sessions}
                            </td>
                          )}

                          {/* Status */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${sc.cls}`}>
                              {sc.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {pagination.total > 0 ? (
                      <>
                        Showing{" "}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {(pagination.page - 1) * pagination.limit + 1}
                        </span>{" "}
                        –{" "}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {Math.min(pagination.page * pagination.limit, pagination.total)}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {pagination.total}
                        </span>{" "}
                        results
                      </>
                    ) : (
                      "No results"
                    )}
                  </p>
                  <nav className="inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-2 py-1.5 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                      .filter((page) =>
                        page === 1 ||
                        page === pagination.totalPages ||
                        (page >= pagination.page - 1 && page <= pagination.page + 1)
                      )
                      .flatMap((page, idx, arr) => {
                        const elements = [];
                        if (idx > 0 && page - arr[idx - 1] > 1) {
                          elements.push(
                            <span
                              key={`ellipsis-${page}`}
                              className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-500"
                            >
                              ...
                            </span>,
                          );
                        }
                        elements.push(
                          <button
                            key={`page-${page}`}
                            onClick={() => handlePageChange(page)}
                            className={`px-3 py-1.5 border text-xs font-medium ${
                              page === pagination.page
                                ? "z-10 bg-foreground border-foreground text-background"
                                : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {page}
                          </button>,
                        );
                        return elements;
                      })}

                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
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
    </div>
  );
}