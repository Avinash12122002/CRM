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

    if (user.role === "admin") {
      fetchEmployees();
    }

    fetchActivities(1);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchActivities(1);
  }, [selectedDate, selectedEmployee]);

  // Click outside to close employee dropdown
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

      if (!res.ok) {
        return;
      }

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

      // Date Filter
      if (selectedDate) {
        url += `&date=${selectedDate}`;
      }

      // Employee Filter (Admin Only)
      if (selectedEmployee && user?.role === "admin") {
        url += `&userId=${selectedEmployee}`;
      }

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error("Failed to fetch activities");
      }

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
    setPagination((prev) => ({
      ...prev,
      page: newPage,
    }));

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
  if (loading) return <div className="p-8">Loading...</div>;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {user?.role === "admin" ? "Employee Activity" : "My Activity"}
          </h2>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {user?.role === "admin"
              ? "Track and manage employee and meeting records"
              : "View your activity history"}
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 mb-4">
          <div className="flex flex-wrap gap-4">
            {user.role === "admin" && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Employee
                </label>
                <div className="relative" ref={employeeDropdownRef}>
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={employeeSearchQuery}
                    onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                    onFocus={() => setEmployeeDropdownOpen(true)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400"
                  />
                  {selectedEmployee && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployee("");
                        setEmployeeSearchQuery("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                  {employeeDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployee("");
                          setEmployeeSearchQuery("");
                          setEmployeeDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-700"
                      >
                        All Employees
                      </button>
                      {employees
                        .filter(
                          (emp) =>
                            emp.name
                              .toLowerCase()
                              .startsWith(employeeSearchQuery.toLowerCase()) ||
                            emp.username
                              .toLowerCase()
                              .startsWith(employeeSearchQuery.toLowerCase()),
                        )
                        .map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setSelectedEmployee(emp.id.toString());
                              setEmployeeSearchQuery(emp.name);
                              setEmployeeDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100"
                          >
                            <div>
                              <div>{emp.name}</div>
                              <div className="text-xs text-zinc-500">
                                @{emp.username}
                              </div>
                            </div>
                          </button>
                        ))}
                      {employees.filter(
                        (emp) =>
                          emp.name
                            .toLowerCase()
                            .startsWith(employeeSearchQuery.toLowerCase()) ||
                          emp.username
                            .toLowerCase()
                            .startsWith(employeeSearchQuery.toLowerCase()),
                      ).length === 0 && (
                        <div className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                          No employees found
                        </div>
                      )}
                    </div>
                  )}
                  {selectedEmployee && !employeeDropdownOpen && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 text-sm rounded">
                        {employees.find(
                          (e) => e.id.toString() === selectedEmployee,
                        )?.name || "Unknown"}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmployee("");
                            setEmployeeSearchQuery("");
                          }}
                          className="ml-1 hover:text-blue-600 dark:hover:text-blue-200"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Date
              </label>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedDate("");
                  setSelectedEmployee("");
                  setEmployeeSearchQuery("");
                }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
              >
                Clear Filters
              </button>
            </div>
            {selectedDate && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-sm rounded">
                  {selectedDate}
                  <button type="button" onClick={() => setSelectedDate("")}>
                    ×
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Activity Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {loadingActivities ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-zinc-600 dark:text-zinc-400">
                Loading activities...
              </p>
            </div>
          ) : activities.length === 0 ? (
            <div className="p-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                No activities yet
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                Employee activity records will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                  <thead className="bg-zinc-50 dark:bg-zinc-700">
                    <tr>
                      {user.role === "admin" && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                          Employee
                        </th>
                      )}

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Date
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Check In
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Check Out
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Work Time
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Break Time
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Training Time
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Total Day
                      </th>

                      {user.role === "admin" && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                          Late
                        </th>
                      )}

                      {user.role === "admin" && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                          Sessions
                        </th>
                      )}

                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {activities.map((activity) => {
                      const totalDayHours = activity.totalWorkingDay || 0;

                      return (
                        <tr
                          key={activity.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          {user.role === "admin" && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {activity.userName}
                              </div>

                              <div className="text-sm text-zinc-500">
                                @{activity.userUsername}
                              </div>
                            </td>
                          )}

                          <td className="px-6 py-4 whitespace-nowrap">
                            {formatDate(activity.date)}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            {formatTime(activity.firstCheckIn || activity.checkIn,)}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            {activity.checkOut
                              ? formatTime(activity.lastCheckOut || activity.checkOut)
                              : "-"}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap font-medium text-green-600">
                            {formatHours(activity.workHours)}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap font-medium text-yellow-600">
                            {formatHours(activity.breakHours)}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap font-medium text-purple-600">
                            {formatHours(activity.trainingHours)}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap font-semibold text-blue-600">
                            {formatHours(totalDayHours)}
                          </td>

                          {user.role === "admin" && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {activity.lateMinutes > 0
                                ? `${activity.lateMinutes} min`
                                : "-"}
                            </td>
                          )}

                          {user.role === "admin" && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {activity.sessions}
                            </td>
                          )}

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                activity.status === "working"
                                  ? "bg-green-100 text-green-800"
                                  : activity.status === "break"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : activity.status === "training"
                                      ? "bg-purple-100 text-purple-800"
                                      : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {activity.status === "working" && "Working"}
                              {activity.status === "break" && "On Break"}
                              {activity.status === "training" && "Training"}
                              {activity.status === "completed" && "Completed"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="bg-zinc-50 dark:bg-zinc-800 px-6 py-4 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-sm font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-sm font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      {pagination.total > 0 ? (
                        <>
                          Showing{" "}
                          <span className="font-medium">
                            {(pagination.page - 1) * pagination.limit + 1}
                          </span>{" "}
                          to{" "}
                          <span className="font-medium">
                            {Math.min(
                              pagination.page * pagination.limit,
                              pagination.total,
                            )}
                          </span>{" "}
                          of{" "}
                          <span className="font-medium">
                            {pagination.total}
                          </span>{" "}
                          results
                        </>
                      ) : (
                        "No results found"
                      )}
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Previous</span>
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>

                      {Array.from(
                        { length: pagination.totalPages },
                        (_, i) => i + 1,
                      )
                        .filter((page) => {
                          return (
                            page === 1 ||
                            page === pagination.totalPages ||
                            (page >= pagination.page - 1 &&
                              page <= pagination.page + 1)
                          );
                        })
                        .flatMap((page, idx, arr) => {
                          const elements = [];

                          // Add ellipsis before current page if needed
                          if (idx > 0 && page - arr[idx - 1] > 1) {
                            elements.push(
                              <span
                                key={`ellipsis-before-${page}`}
                                className="relative inline-flex items-center px-4 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300"
                              >
                                ...
                              </span>,
                            );
                          }

                          // Add the page button
                          elements.push(
                            <button
                              key={`page-${page}`}
                              onClick={() => handlePageChange(page)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
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
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Next</span>
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
