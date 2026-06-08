"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";
import CreateVacancyModal from "@/components/CreateVacancyModal";
import toast from "react-hot-toast";

type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting";
};

type Vacancy = {
  vacancyId: number;
  jobTitle: string;
  description: string;
  status: "active" | "inactive";
  createdBy: number;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
};

type Pagination = {
  page: number;
  limit: number;
  totalVacancies: number;
  totalPages: number;
};

export default function VacanciesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVacancies, setLoadingVacancies] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    totalVacancies: 0,
    totalPages: 0,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.id,
          name: data.name,
          email: data.email || "",
          role: data.role,
        });
      } else {
        toast.error("Please sign in to continue");
        router.push("/");
      }
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchVacancies(pagination.page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch vacancies when filters change
  useEffect(() => {
    if (user) {
      fetchVacancies(1); // Reset to page 1 when filters change
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  async function fetchVacancies(page: number) {
    setLoadingVacancies(true);
    try {
      let url = `/api/vacancies/list?page=${page}&limit=${pagination.limit}`;

      // Add filters
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      // For employees, always filter to show only active vacancies
      if (user?.role === "employee" || user?.role === "meeting") {
        url += `&status=active`;
      } else if (statusFilter) {
        // For admins, apply the selected status filter
        url += `&status=${statusFilter}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVacancies(data.vacancies);
        setPagination(data.pagination);
      } else {
        toast.error("Failed to fetch vacancies");
      }
    } catch {
      toast.error("Failed to fetch vacancies");
    } finally {
      setLoadingVacancies(false);
    }
  }

  const handleDelete = async (vacancyId: number) => {
    if (!confirm("Are you sure you want to delete this vacancy?")) return;

    const loadingToast = toast.loading("Deleting vacancy...");
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}`, {
        method: "DELETE",
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        toast.success("Vacancy deleted successfully");
        fetchVacancies(pagination.page);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete vacancy");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Error deleting vacancy:", error);
      toast.error("Failed to delete vacancy");
    }
  };

  const handleStatusToggle = async (
    vacancyId: number,
    currentStatus: string,
  ) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const loadingToast = toast.loading("Updating status...");

    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        toast.success("Status updated successfully");
        fetchVacancies(pagination.page);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update status");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  function handlePageChange(newPage: number) {
    fetchVacancies(newPage);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (loading) return <div className="p-8">Loading...</div>;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Vacancies
              </h2>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {user.role === "admin"
                  ? "Manage and track job vacancies"
                  : "View available job vacancies"}
              </p>
            </div>
            {user.role === "admin" && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Vacancy
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 mb-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Search
              </label>
              <input
                type="text"
                placeholder="Search vacancies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400"
              />
            </div>
            {user.role === "admin" && (
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Vacancies Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {loadingVacancies ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-zinc-600 dark:text-zinc-400">
                Loading vacancies...
              </p>
            </div>
          ) : vacancies.length === 0 ? (
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
                No vacancies yet
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                Job vacancies will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                  <thead className="bg-zinc-50 dark:bg-zinc-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Job Title
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Posted By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Updated
                      </th>
                      {user.role === "admin" && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Status
                        </th>
                      )}
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {vacancies.map((vacancy) => (
                      <tr
                        key={vacancy.vacancyId}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {vacancy.jobTitle || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {vacancy.creatorName}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {formatDate(vacancy.createdAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {vacancy.updatedAt !== vacancy.createdAt
                              ? formatDate(vacancy.updatedAt)
                              : "—"}
                          </div>
                        </td>
                        {user.role === "admin" && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                vacancy.status === "active"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                              }`}
                            >
                              {vacancy.status === "active"
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                router.push(
                                  `/dashboard/vacancies/${vacancy.vacancyId}`,
                                )
                              }
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              View
                            </button>
                            {user.role === "admin" && (
                              <>
                                <button
                                  onClick={() =>
                                    handleStatusToggle(
                                      vacancy.vacancyId,
                                      vacancy.status,
                                    )
                                  }
                                  className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                >
                                  {vacancy.status === "active"
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>
                                <button
                                  onClick={() =>
                                    handleDelete(vacancy.vacancyId)
                                  }
                                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
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
                      Showing{" "}
                      <span className="font-medium">
                        {pagination.totalVacancies > 0 &&
                        pagination.page > 0 &&
                        pagination.limit > 0
                          ? (pagination.page - 1) * pagination.limit + 1
                          : 0}
                      </span>{" "}
                      to{" "}
                      <span className="font-medium">
                        {pagination.totalVacancies > 0 &&
                        pagination.page > 0 &&
                        pagination.limit > 0
                          ? Math.min(
                              pagination.page * pagination.limit,
                              pagination.totalVacancies,
                            )
                          : 0}
                      </span>{" "}
                      of{" "}
                      <span className="font-medium">
                        {pagination.totalVacancies || 0}
                      </span>{" "}
                      results
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

                      {pagination.totalPages > 0 &&
                        Array.from(
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
                            const elements: React.ReactNode[] = [];

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

      {/* Create Vacancy Modal */}
      {isModalOpen && (
        <CreateVacancyModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchVacancies(1);
          }}
        />
      )}
    </div>
  );
}
