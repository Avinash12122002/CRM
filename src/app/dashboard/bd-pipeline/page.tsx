"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNavbar from "@/components/DashboardNavbar";
import BDCreateLeadModal from "@/components/BDCreateLeadModal";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting" | "business_development";
};

type BDLead = {
  id: number;
  companyName: string;
  industry: string;
  phoneNumber: string;
  priority: "High" | "Medium" | "Low" | null;
  pipelineStage: string;
  status: "active" | "deal_done" | "lost";
  assignedToName: string;
  createdAt: string;
};

type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const STAGE_COLORS: Record<string, string> = {
  "New Lead": "bg-zinc-100 text-zinc-800",
  "Research Started": "bg-blue-100 text-blue-800",
  "Priority Set": "bg-indigo-100 text-indigo-800",
  "Initial Contact": "bg-yellow-100 text-yellow-800",
  "Response Received": "bg-orange-100 text-orange-800",
  "Meeting Scheduled": "bg-purple-100 text-purple-800",
  "Follow Up": "bg-pink-100 text-pink-800",
  "Deal Done": "bg-green-100 text-green-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  High: "bg-red-100 text-red-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-zinc-100 text-zinc-700",
};

const FILTER_STORAGE_KEY = "bd_pipeline_filters";
const SELECTED_LEAD_KEY = "selectedBDLeadId";

type StoredFilters = {
  search: string;
  stageFilter: string;
  statusFilter: string;
  page: number;
  limit: number;
};

export default function BDPipelinePage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<BDLead[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const filtersLoadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const me = await res.json();
        if (!["business_development", "admin"].includes(me.role)) {
          router.push("/dashboard");
          return;
        }
        setUser(me);
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Restore filters + pagination position from the last time this page was viewed
  useEffect(() => {
    if (typeof window === "undefined" || filtersLoadedRef.current) return;
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters: StoredFilters = JSON.parse(saved);
        setSearch(filters.search || "");
        setStageFilter(filters.stageFilter || "");
        setStatusFilter(filters.statusFilter || "");
        setPagination((prev) => ({
          ...prev,
          page: filters.page || 1,
          limit: filters.limit || 10,
        }));
      }
    } catch (err) {
      console.error(err);
    }
    filtersLoadedRef.current = true;
  }, []);

  // Persist filters + pagination position whenever they change
  useEffect(() => {
    if (typeof window === "undefined" || !filtersLoadedRef.current) return;
    const filters: StoredFilters = {
      search,
      stageFilter,
      statusFilter,
      page: pagination.page,
      limit: pagination.limit,
    };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [search, stageFilter, statusFilter, pagination.page, pagination.limit]);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (stageFilter) params.set("stage", stageFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(pagination.page));
    params.set("limit", String(pagination.limit));

    const res = await fetch(`/api/bd/leads/list?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads || []);
      if (data.pagination) {
        setPagination((prev) => ({ ...prev, ...data.pagination }));
      }

      // Highlight + scroll to whichever lead the user just came back from
      const selectedId =
        typeof window !== "undefined" ? sessionStorage.getItem(SELECTED_LEAD_KEY) : null;
      if (selectedId) {
        setTimeout(() => {
          const row = document.getElementById(`bdlead-${selectedId}`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.add("bg-yellow-100", "dark:bg-yellow-900/40", "transition-colors", "duration-700");
            setTimeout(() => {
              row.classList.remove("bg-yellow-100", "dark:bg-yellow-900/40");
              sessionStorage.removeItem(SELECTED_LEAD_KEY);
            }, 2200);
          } else {
            sessionStorage.removeItem(SELECTED_LEAD_KEY);
          }
        }, 100);
      }
    }
  }, [stageFilter, statusFilter, search, pagination.page, pagination.limit]);

  useEffect(() => {
    if (user && filtersLoadedRef.current) loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, stageFilter, statusFilter, search, pagination.page, pagination.limit]);

  const goToLead = (leadId: number) => {
    sessionStorage.setItem(SELECTED_LEAD_KEY, String(leadId));
    router.push(`/dashboard/bd-pipeline/${leadId}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <DashboardNavbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">BD Pipeline</h1>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
              Rows per page
            </label>
            <select
              value={pagination.limit}
              onChange={(e) =>
                setPagination((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }))
              }
              className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            {user.role === "business_development" && (
              <button
                onClick={() => setCreateOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                + Create Lead
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            placeholder="Search company, decision maker, phone..."
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
          >
            <option value="">All Stages</option>
            {Object.keys(STAGE_COLORS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="deal_done">Deal Done</option>
            <option value="lost">Lost</option>
          </select>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Industry</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Stage</th>
                  {user.role === "admin" && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Assigned To</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr
                      key={lead.id}
                      id={`bdlead-${lead.id}`}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                      onClick={() => goToLead(lead.id)}
                    >
                      <td className="px-6 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`/dashboard/bd-pipeline/${lead.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            sessionStorage.setItem(SELECTED_LEAD_KEY, String(lead.id));
                          }}
                          className="hover:underline"
                        >
                          {lead.companyName || "Unnamed Lead"}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">{lead.industry}</td>
                      <td className="px-6 py-3 text-sm">
                        {lead.priority ? (
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${PRIORITY_COLORS[lead.priority]}`}>
                            {lead.priority}
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            lead.status === "lost"
                              ? "bg-red-100 text-red-800"
                              : STAGE_COLORS[lead.pipelineStage] || "bg-zinc-100 text-zinc-800"
                          }`}
                        >
                          {lead.status === "lost" ? "Lead Lost" : lead.pipelineStage}
                        </span>
                      </td>
                      {user.role === "admin" && (
                        <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">{lead.assignedToName}</td>
                      )}
                      <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.total > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-3 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                Showing{" "}
                <span className="font-medium">
                  {(pagination.page - 1) * pagination.limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{" "}
                of <span className="font-medium">{pagination.total}</span> results
              </p>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === pagination.totalPages ||
                      (p >= pagination.page - 1 && p <= pagination.page + 1)
                  )
                  .flatMap((p, idx, arr) => {
                    const elements: React.ReactNode[] = [];
                    if (idx > 0 && p - arr[idx - 1] > 1) {
                      elements.push(
                        <span
                          key={`ellipsis-${p}`}
                          className="relative inline-flex items-center px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300"
                        >
                          ...
                        </span>
                      );
                    }
                    elements.push(
                      <button
                        key={`page-${p}`}
                        onClick={() => handlePageChange(p)}
                        className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
                          p === pagination.page
                            ? "z-10 bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {p}
                      </button>
                    );
                    return elements;
                  })}

                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </nav>
            </div>
          )}
        </div>
      </main>

      {createOpen && (
        <BDCreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreated={(leadId) => {
            setCreateOpen(false);
            sessionStorage.setItem(SELECTED_LEAD_KEY, String(leadId));
            // New lead sorts to the top — jump back to page 1 so it's visible
            setPagination((prev) => ({ ...prev, page: 1 }));
            loadLeads();
          }}
        />
      )}
    </div>
  );
}
