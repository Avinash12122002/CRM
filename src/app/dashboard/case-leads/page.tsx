"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import CaseLeadReassignModal from "@/components/CaseLeadReassignModal";
import CaseLeadEditModal from "@/components/CaseLeadEditModal";

interface User {
  id: number;
  name: string;
  email?: string;
  role:
    | "admin"
    | "telecaller"
    | "meeting"
    | "business_development"
    | "billing"
    | "case_manager";
}

interface CaseLead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  jobApplied?: string;
  status: string;
  assignedTo: number | null;
  assignedToName?: string;
  assignedBy?: number | null;
  assignedByName?: string;
  createdAt: string;
  updatedAt: string;
  salesDocument?: {
    fileId: string;
    fileName: string;
    uploadedAt: string;
  };
}

interface FilterOption {
  id: number;
  name: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StoredFilters {
  search: string;
  country: string;
  assignedTo: string;
  assignedBy: string;
  date: string;
  page: number;
  limit: number;
}

const FILTER_STORAGE_KEY = "case_leads_filters";

export default function CaseManagerLeadsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<CaseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [country, setCountry] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [date, setDate] = useState("");
  const [caseManagerOptions, setCaseManagerOptions] = useState<FilterOption[]>([]);
  const [assignerOptions, setAssignerOptions] = useState<FilterOption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const filtersLoadedRef = useRef(false);
  const [reassignLead, setReassignLead] = useState<CaseLead | null>(null);
  const [editLead, setEditLead] = useState<CaseLead | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Restore saved filters/page on mount (same pattern as the Leads list) ──
  useEffect(() => {
    if (typeof window !== "undefined" && !filtersLoadedRef.current) {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        try {
          const filters: StoredFilters = JSON.parse(saved);
          setSearch(filters.search || "");
          setSearchInput(filters.search || "");
          setCountry(filters.country || "");
          setCountryInput(filters.country || "");
          setAssignedTo(filters.assignedTo || "");
          setAssignedBy(filters.assignedBy || "");
          setDate(filters.date || "");
          setPagination((prev) => ({
            ...prev,
            page: filters.page || 1,
            limit: filters.limit || 10,
          }));
        } catch (error) {
          console.error("Error loading filters from localStorage:", error);
        }
      }
      filtersLoadedRef.current = true;
    }
  }, []);

  // ── Live search: debounce the typed name/phone/email box into the actual
  //     filter value — applies as soon as you stop typing, no button needed.
  //     Skips the page-1 reset when the debounced value matches what's
  //     already applied, so restoring a saved filter on mount doesn't wipe
  //     out the saved page number. ──
  useEffect(() => {
    if (!filtersLoadedRef.current) return;
    const trimmed = searchInput.trim();
    if (trimmed === search) return;
    const handle = setTimeout(() => {
      setSearch(trimmed);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput, search]);

  // ── Live country filter — same debounce-as-you-type behavior ──
  useEffect(() => {
    if (!filtersLoadedRef.current) return;
    const trimmed = countryInput.trim();
    if (trimmed === country) return;
    const handle = setTimeout(() => {
      setCountry(trimmed);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(handle);
  }, [countryInput, country]);

  // ── Persist filters/page whenever they change ──
  useEffect(() => {
    if (typeof window !== "undefined" && filtersLoadedRef.current) {
      const filters: StoredFilters = {
        search,
        country,
        assignedTo,
        assignedBy,
        date,
        page: pagination.page,
        limit: pagination.limit,
      };
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    }
  }, [search, country, assignedTo, assignedBy, date, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.role !== "case_manager" && data.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      setUser({ id: data.id, name: data.name, email: data.email, role: data.role });
    } catch (err) {
      console.error(err);
      router.push("/");
    }
  };

  // ── Populate the "Assigned To" (case managers) and "Assigned By"
  //     (whoever converted/handed off the lead) filter dropdowns. ──
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const res = await fetch("/api/case-manager/options");
        const data = await res.json();
        if (res.ok) {
          setCaseManagerOptions((data.caseManagers || []).map((cm: { id: number; name: string }) => ({
            id: cm.id,
            name: cm.name,
          })));
        }
      } catch (err) {
        console.error("Failed to load case manager options:", err);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/api/auth/users?limit=500");
        const data = await res.json();
        if (res.ok) {
          const assigners = (data.users || [])
            .filter((u: { role: string }) =>
              ["admin", "telecaller", "meeting"].includes(u.role),
            )
            .map((u: { id: number; name: string }) => ({ id: u.id, name: u.name }));
          setAssignerOptions(assigners);
        }
      } catch (err) {
        console.error("Failed to load assigner options:", err);
      }
    })();
  }, [user]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (search) params.set("search", search);
      if (country) params.set("country", country);
      if (assignedTo) params.set("assignedTo", assignedTo);
      if (assignedBy) params.set("assignedBy", assignedBy);
      if (date) params.set("date", date);

      const res = await fetch(`/api/case-manager/leads/list?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLeads(data.leads || []);
        setPagination(data.pagination);

        // ── Scroll back to the row the user came from, same as Leads ──
        const selectedCaseLeadId = sessionStorage.getItem("selectedCaseLeadId");
        if (selectedCaseLeadId) {
          setTimeout(() => {
            const row = document.getElementById(`case-lead-${selectedCaseLeadId}`);
            if (row) {
              row.scrollIntoView({ behavior: "smooth", block: "center" });
              row.classList.add(
                "bg-yellow-200",
                "dark:bg-yellow-700",
                "transition-colors",
                "duration-700",
              );
              setTimeout(() => {
                row.classList.remove("bg-yellow-200", "dark:bg-yellow-700");
                sessionStorage.removeItem("selectedCaseLeadId");
              }, 2000);
            }
          }, 100);
        }
      } else {
        toast.error(data.message || "Failed to load leads");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, country, assignedTo, assignedBy, date, pagination.page, pagination.limit]);

  useEffect(() => {
    if (user && filtersLoadedRef.current) fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, country, assignedTo, assignedBy, date, pagination.page, pagination.limit]);

  const goToLead = (lead: CaseLead) => {
    sessionStorage.setItem("selectedCaseLeadId", String(lead.id));
    router.push(`/dashboard/case-leads/${lead.id}`);
  };

  const handleViewPdf = (lead: CaseLead) => {
    if (!lead.salesDocument?.fileId) {
      toast.error("No document has been uploaded for this lead yet");
      return;
    }
    window.open(`/api/leads/${lead.id}/document`, "_blank");
  };

  const handleDelete = async (lead: CaseLead) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${lead.name || "this lead"}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Lead deleted successfully");
        fetchLeads();
      } else {
        toast.error(data.message || "Failed to delete lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Case Leads
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {user.role === "admin"
              ? "All leads handed off for case management, across every case manager. You can view, edit, reassign, or delete any lead here."
              : "Leads handed off to you for recruitment case management. View-only — you cannot edit, reassign, or delete anything here."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Search
            </label>
            <input
              type="text"
              placeholder="Name, phone, or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none w-64"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Country
            </label>
            <input
              type="text"
              placeholder="Country..."
              value={countryInput}
              onChange={(e) => setCountryInput(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none w-40"
            />
          </div>

          {user.role === "admin" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Assigned To
              </label>
              <select
                value={assignedTo}
                onChange={(e) => {
                  setAssignedTo(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">All case managers</option>
                {caseManagerOptions.map((cm) => (
                  <option key={cm.id} value={cm.id}>
                    {cm.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Assigned By
            </label>
            <select
              value={assignedBy}
              onChange={(e) => {
                setAssignedBy(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Anyone</option>
              {assignerOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Assigned On
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {(search || country || assignedTo || assignedBy || date) && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setCountryInput("");
                setCountry("");
                setAssignedTo("");
                setAssignedBy("");
                setDate("");
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                  {user.role === "admin" && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned By</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned On</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={user.role === "admin" ? 8 : 6} className="px-4 py-8 text-center text-sm text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={user.role === "admin" ? 8 : 6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No leads assigned yet.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr
                      id={`case-lead-${lead.id}`}
                      key={lead.id}
                      className="transition-colors duration-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        <button
                          onClick={() => goToLead(lead)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline cursor-pointer text-left"
                        >
                          {lead.name || "-"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => goToLead(lead)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline cursor-pointer"
                        >
                          {lead.phone || "-"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.email || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.country || "-"}
                      </td>
                      {user.role === "admin" && (
                        <>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {lead.assignedToName || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {lead.assignedByName || "-"}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {new Date(lead.updatedAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => goToLead(lead)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleViewPdf(lead)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                          >
                            PDF
                          </button>
                          {user.role === "admin" && (
                            <>
                              <button
                                onClick={() => setEditLead(lead)}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setReassignLead(lead)}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300"
                              >
                                Reassign
                              </button>
                              <button
                                onClick={() => handleDelete(lead)}
                                disabled={deletingId === lead.id}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 disabled:opacity-50"
                              >
                                {deletingId === lead.id ? "Deleting..." : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page === 1}
                  className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page === pagination.totalPages}
                  className="ml-3 relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  Showing{" "}
                  <span className="font-medium">
                    {pagination.total === 0
                      ? 0
                      : (pagination.page - 1) * pagination.limit + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{" "}
                  of <span className="font-medium">{pagination.total}</span> results
                </p>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() =>
                      setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                    }
                    disabled={pagination.page === 1}
                    className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg
                      className="h-4 w-4"
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

                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter(
                      (page) =>
                        page === 1 ||
                        page === pagination.totalPages ||
                        (page >= pagination.page - 1 && page <= pagination.page + 1),
                    )
                    .flatMap((page, idx, arr) => {
                      const elements: React.ReactNode[] = [];
                      if (idx > 0 && page - arr[idx - 1] > 1) {
                        elements.push(
                          <span
                            key={`ellipsis-before-${page}`}
                            className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300"
                          >
                            ...
                          </span>,
                        );
                      }
                      elements.push(
                        <button
                          key={`page-${page}`}
                          onClick={() =>
                            setPagination((prev) => ({ ...prev, page }))
                          }
                          className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
                            page === pagination.page
                              ? "z-10 bg-gray-900 dark:bg-gray-100 border-gray-900 dark:border-gray-100 text-white dark:text-gray-900"
                              : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                        >
                          {page}
                        </button>,
                      );
                      return elements;
                    })}

                  <button
                    onClick={() =>
                      setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                    }
                    disabled={pagination.page === pagination.totalPages}
                    className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg
                      className="h-4 w-4"
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
          )}
        </div>
      </main>

      {reassignLead && (
        <CaseLeadReassignModal
          lead={reassignLead}
          onClose={() => setReassignLead(null)}
          onReassigned={() => {
            setReassignLead(null);
            fetchLeads();
          }}
        />
      )}

      {editLead && (
        <CaseLeadEditModal
          lead={editLead}
          onClose={() => setEditLead(null)}
          onSaved={() => {
            setEditLead(null);
            fetchLeads();
          }}
        />
      )}
    </div>
  );
}