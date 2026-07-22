"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNavbar from "@/components/DashboardNavbar";
import BDReassignModal from "@/components/BDReassignModal";
import BDCreateLeadModal from "@/components/BDCreateLeadModal";
import { PIPELINE_STAGES, PRIORITIES } from "@/lib/bd/constants";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting" | "business_development";
};

type BDLead = {
  id: number;
  companyName?: string;
  industry?: string;
  pipelineStage: string;
  status: "active" | "deal_done" | "lost";
  priority?: string | null;
  assignedTo?: number;
  assignedToName?: string;
  createdByName?: string;
  createdAt: string;
};

type BDUser = { id: number; name: string; role: string };

type Pagination = { page: number; limit: number; total: number; totalPages: number };

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  deal_done: "Deal Done",
  lost: "Lost",
};

function statusClass(status: string) {
  if (status === "deal_done")
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (status === "lost")
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
}

// Persist filters + pagination so returning from a lead lands the admin back on
// the same page. SELECTED_LEAD_KEY is shared with the BD Pipeline + lead detail
// pages so the "Back to BD Leads" button's stored row id is picked up here for
// the scroll-to + blink-highlight behaviour.
const FILTER_STORAGE_KEY = "bd_leads_filters";
const SELECTED_LEAD_KEY = "selectedBDLeadId";

type StoredFilters = {
  search: string;
  stage: string;
  status: string;
  priority: string;
  assignedTo: string;
  sortOrder: string;
  dateFilter: string;
  limit: number;
  page: number;
};

export default function BDLeadsAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [leads, setLeads] = useState<BDLead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [bdUsers, setBdUsers] = useState<BDUser[]>([]);

  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [sortOrder, setSortOrder] = useState("date_desc");
  const [dateFilter, setDateFilter] = useState("");
  const [limit, setLimit] = useState(15);
  const [page, setPage] = useState(1);

  const [reassignLead, setReassignLead] = useState<BDLead | null>(null);
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
        if (me.role !== "admin") {
          router.push("/dashboard");
          return;
        }
        setUser(me);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/by-role?role=business_development");
        const data = await res.json();
        setBdUsers(data.users || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const loadLeads = useCallback(async () => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (stage) qs.set("stage", stage);
    if (status) qs.set("status", status);
    if (priority) qs.set("priority", priority);
    if (assignedTo) qs.set("assignedTo", assignedTo);
    if (dateFilter) qs.set("createdDate", dateFilter);
    qs.set("sort", sortOrder);
    qs.set("page", String(page));
    qs.set("limit", String(limit));

    const res = await fetch(`/api/bd/leads/list?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads || []);
      setPagination(data.pagination || null);

      // Scroll to + blink-highlight whichever lead the admin just came back
      // from (row id set on View/Edit click and by the detail page's Back
      // button), so they return to the same row instead of the top of page 1.
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
  }, [search, stage, status, priority, assignedTo, sortOrder, dateFilter, limit, page]);

  // Restore saved filters + page position on first mount.
  useEffect(() => {
    if (typeof window === "undefined" || filtersLoadedRef.current) return;
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const f: StoredFilters = JSON.parse(saved);
        setSearch(f.search || "");
        setStage(f.stage || "");
        setStatus(f.status || "");
        setPriority(f.priority || "");
        setAssignedTo(f.assignedTo || "");
        setSortOrder(f.sortOrder || "date_desc");
        setDateFilter(f.dateFilter || "");
        setLimit(f.limit || 15);
        setPage(f.page || 1);
      }
    } catch (err) {
      console.error(err);
    }
    filtersLoadedRef.current = true;
  }, []);

  // Persist filters + page position whenever they change.
  useEffect(() => {
    if (typeof window === "undefined" || !filtersLoadedRef.current) return;
    const f: StoredFilters = {
      search,
      stage,
      status,
      priority,
      assignedTo,
      sortOrder,
      dateFilter,
      limit,
      page,
    };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f));
  }, [search, stage, status, priority, assignedTo, sortOrder, dateFilter, limit, page]);

  useEffect(() => {
    if (user && filtersLoadedRef.current) loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, stage, status, priority, assignedTo, sortOrder, dateFilter, limit, page]);

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              BD Leads
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Every Business Development lead — full admin access to view, open and reassign.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
              Rows per page
            </label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button
              onClick={() => setCreateOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + Create Lead
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Search company, contact, email, phone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 lg:col-span-2"
            />
            <select
              value={assignedTo}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            >
              <option value="">All owners</option>
              {bdUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              value={stage}
              onChange={(e) => {
                setStage(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            >
              <option value="">All stages</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="deal_done">Deal Done</option>
              <option value="lost">Lost</option>
            </select>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFilter}
                max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                title="Show leads created on this date"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
              />
              {dateFilter && (
                <button
                  onClick={() => {
                    setDateFilter("");
                    setPage(1);
                  }}
                  title="Clear date filter"
                  className="px-2 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  {[
                    "Company",
                    "Industry",
                    "Stage",
                    "Status",
                    "Priority",
                    "Owner",
                    "Created By",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      No leads match these filters
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} id={`bdlead-${lead.id}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {lead.companyName || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {lead.industry || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {lead.pipelineStage}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(
                            lead.status
                          )}`}
                        >
                          {STATUS_LABELS[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {lead.priority || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {lead.assignedToName || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {lead.createdByName || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/dashboard/bd-pipeline/${lead.id}`}
                            onClick={() =>
                              sessionStorage.setItem(SELECTED_LEAD_KEY, String(lead.id))
                            }
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => setReassignLead(lead)}
                            disabled={lead.status !== "active" || (lead as { locked?: boolean }).locked}
                            className="text-zinc-700 dark:text-zinc-300 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            title={
                              lead.status !== "active"
                                ? "Closed leads can't be reassigned"
                                : "Reassign this lead"
                            }
                          >
                            Reassign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} leads
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {reassignLead && (
        <BDReassignModal
          lead={reassignLead}
          onClose={() => setReassignLead(null)}
          onReassigned={() => {
            setReassignLead(null);
            loadLeads();
          }}
        />
      )}

      {createOpen && (
        <BDCreateLeadModal
          selfAssign={false}
          onClose={() => setCreateOpen(false)}
          onCreated={(leadId) => {
            setCreateOpen(false);
            setSortOrder("date_desc");
            setPage(1);
            sessionStorage.setItem(SELECTED_LEAD_KEY, String(leadId));
            loadLeads();
          }}
        />
      )}
    </div>
  );
}
