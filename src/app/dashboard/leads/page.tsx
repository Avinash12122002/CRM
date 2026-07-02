"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import CreateLeadModal from "@/components/CreateLeadModal";
import AssignLeadModal from "@/components/AssignLeadModal";

interface User {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "employee" | "meeting";
}

interface Lead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  status: string;
  dueDate?: string;
  assignedTo: number | null;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToRole?: "admin" | "employee" | "meeting";
  assignedBy?: number;
  assignedByName?: string;
  assignedByRole?: "admin" | "employee" | "meeting";
  participants?: number[];
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  lastNoteAddedByAdmin?: boolean;
  isOwner: boolean;
  lastNote?: {
    note: string;
    timestamp: string;
    performedByName: string;
  };
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const FILTER_STORAGE_KEY = "leads_filters";

interface StoredFilters {
  searchQuery: string;
  selectedStatus: string;
  statusSearchQuery: string;
  selectedAssigned: string;
  assignedSearchQuery: string;
  selectedMonth: string;
  selectedYear: string;
  page: number;
  limit: number;
}

export default function LeadsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusSearchQuery, setStatusSearchQuery] = useState("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [selectedAssigned, setSelectedAssigned] = useState("");
  const [assignedSearchQuery, setAssignedSearchQuery] = useState("");
  const [assignedDropdownOpen, setAssignedDropdownOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString(),
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedLeadAssignee, setSelectedLeadAssignee] = useState<number | null>(null);
  const router = useRouter();
  const toastShownRef = useRef(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const assignedDropdownRef = useRef<HTMLDivElement>(null);
  const filtersLoadedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !filtersLoadedRef.current) {
      const savedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
      if (savedFilters) {
        try {
          const filters: StoredFilters = JSON.parse(savedFilters);
          setSearchQuery(filters.searchQuery || "");
          setSelectedStatus(filters.selectedStatus || "");
          setStatusSearchQuery(filters.statusSearchQuery || "");
          setSelectedAssigned(filters.selectedAssigned || "");
          setAssignedSearchQuery(filters.assignedSearchQuery || "");
          setSelectedMonth(filters.selectedMonth || "");
          setSelectedYear(filters.selectedYear || new Date().getFullYear().toString());
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

  useEffect(() => {
    if (typeof window !== "undefined" && filtersLoadedRef.current) {
      const filters: StoredFilters = {
        searchQuery,
        selectedStatus,
        statusSearchQuery,
        selectedAssigned,
        assignedSearchQuery,
        selectedMonth,
        selectedYear,
        page: pagination.page,
        limit: pagination.limit,
      };
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    }
  }, [
    searchQuery, selectedStatus, statusSearchQuery, selectedAssigned,
    assignedSearchQuery, selectedMonth, selectedYear,
    pagination.page, pagination.limit,
  ]);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user && filtersLoadedRef.current) {
      fetchLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user, pagination.page, pagination.limit, searchQuery,
    selectedStatus, selectedAssigned, selectedMonth, selectedYear,
  ]);

  useEffect(() => {
    if (user && user.role === "admin") {
      fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (assignedDropdownRef.current && !assignedDropdownRef.current.contains(event.target as Node)) {
        setAssignedDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        if (!toastShownRef.current) {
          toast.error("Please login first");
          toastShownRef.current = true;
        }
        router.push("/");
        return;
      }
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error(err);
      if (!toastShownRef.current) {
        toast.error("Something went wrong");
        toastShownRef.current = true;
      }
      router.push("/");
    }
  };

  const fetchLeads = async (pageArg?: number, limitArg?: number) => {
    setLoading(true);
    try {
      const pageToUse = pageArg || pagination.page;
      const limitToUse = limitArg || pagination.limit;
      let url = `/api/leads/list?page=${pageToUse}&limit=${limitToUse}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (selectedStatus) url += `&status=${encodeURIComponent(selectedStatus)}`;
      if (selectedAssigned) url += `&assignedTo=${encodeURIComponent(selectedAssigned)}`;
      if (selectedMonth) url += `&month=${selectedMonth}`;
      if (selectedYear) url += `&year=${selectedYear}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads);
        const selectedLeadId = sessionStorage.getItem("selectedLeadId");

if (selectedLeadId) {
  setTimeout(() => {
    const row = document.getElementById(`lead-${selectedLeadId}`);

if (row) {
  row.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  // Highlight the row
  row.classList.add(
    "bg-yellow-200",
    "dark:bg-yellow-700",
    "transition-colors",
    "duration-700"
  );

  // Remove highlight after 2 seconds
  setTimeout(() => {
    row.classList.remove(
      "bg-yellow-200",
      "dark:bg-yellow-700"
    );

    sessionStorage.removeItem("selectedLeadId");
  }, 2000);
}
  }, 100);
}
        setPagination((prev) => ({ ...data.pagination, page: pageToUse }));
        if (
          data.pagination.page > data.pagination.totalPages &&
          data.pagination.totalPages > 0
        ) {
          setPagination((prev) => ({ ...prev, page: data.pagination.totalPages }));
        }
      } else {
        toast.error("Failed to fetch leads");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPagination((prev) => ({ ...prev, page: newPage }));
    fetchLeads(newPage);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) {
        const data = await res.json();
        const allUsers = (data.users || []).filter((u: { role: string }) =>
          ["admin", "employee", "meeting"].includes(u.role),
        );
        setUsers(allUsers);
      }
    } catch {
      // ignore
    }
  };

  const handleAssign = (leadId: number, currentAssigneeId: number | null) => {
    setSelectedLeadId(leadId);
    setSelectedLeadAssignee(currentAssigneeId);
    setAssignModalOpen(true);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "new-lead":         return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
      case "call-back":        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100";
      case "not-answering":    return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100";
      case "meeting-scheduled":return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100";
      case "not-interested":   return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
      case "wrong-number":     return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100";
      case "document-pending": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100";
      case "payment-pending":  return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100";
      case "sales":            return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      default:                 return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100";
    }
  };

  const formatStatusText = (status: string) => {
    switch (status) {
      case "new-lead":          return "New Lead";
      case "call-back":         return "Call Back";
      case "not-answering":     return "Not Answering";
      case "meeting-scheduled": return "Meeting Scheduled";
      case "not-interested":    return "Not Interested";
      case "wrong-number":      return "Wrong Number";
      case "document-pending":  return "Doc Pending";
      case "payment-pending":   return "Pay Pending";
      case "sales":             return "Sales";
      default:                  return status;
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    if (!window.confirm("Are you sure you want to delete this lead? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/delete`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Lead deleted successfully");
        fetchLeads(pagination.page, pagination.limit);
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to delete lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    }
  };

  const renderPagination = () => {
    if (pagination.totalPages === 0) return null;
    return (
      <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="relative inline-flex items-center px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages}
            className="ml-3 relative inline-flex items-center px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            Showing{" "}
            <span className="font-medium">
              {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
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
              .filter((page) =>
                page === 1 ||
                page === pagination.totalPages ||
                (page >= pagination.page - 1 && page <= pagination.page + 1)
              )
              .flatMap((page, idx, arr) => {
                const elements: React.ReactNode[] = [];
                if (idx > 0 && page - arr[idx - 1] > 1) {
                  elements.push(
                    <span
                      key={`ellipsis-before-${page}`}
                      className="relative inline-flex items-center px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      ...
                    </span>,
                  );
                }
                elements.push(
                  <button
                    key={`page-${page}`}
                    onClick={() => handlePageChange(page)}
                    className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
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
              className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Next</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const statusOptions = [
    { value: "new-lead", label: "New Lead" },
    { value: "call-back", label: "Call Back" },
    { value: "not-answering", label: "Not Answering" },
    { value: "meeting-scheduled", label: "Meeting Scheduled" },
    { value: "not-interested", label: "Not Interested" },
    { value: "wrong-number", label: "Wrong Number" },
    { value: "document-pending", label: "Document Pending" },
    { value: "payment-pending", label: "Payment Pending" },
    { value: "sales", label: "Sales" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />
      <div className="max-w-7xl mx-auto py-4 sm:px-4 lg:px-6">
        <div className="px-3 py-4 sm:px-0">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Leads</h1>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                Rows per page
              </label>
              <select
                value={pagination.limit}
                onChange={(e) =>
                  setPagination((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }))
                }
                className="px-2 py-1 border rounded bg-white dark:bg-gray-700 text-xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition whitespace-nowrap"
              >
                + Create Lead
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">

            {/* Filters */}
            <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex flex-wrap gap-2">

                {/* Search */}
                <div className="flex-1 min-w-[160px]">
                  <input
                    type="text"
                    placeholder="Search name or phone"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPagination((p) => ({ ...p, page: 1 }));
                    }}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                {/* Status */}
                <div className="min-w-[140px]">
                  <div className="relative" ref={statusDropdownRef}>
                    <input
                      type="text"
                      placeholder="Search status..."
                      value={statusSearchQuery}
                      onChange={(e) => setStatusSearchQuery(e.target.value)}
                      onFocus={() => setStatusDropdownOpen(true)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    />
                    {selectedStatus && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatus("");
                          setStatusSearchQuery("");
                          setPagination((p) => ({ ...p, page: 1 }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    {statusDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatus("");
                            setStatusSearchQuery("");
                            setStatusDropdownOpen(false);
                            setPagination((p) => ({ ...p, page: 1 }));
                          }}
                          className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700"
                        >
                          All Statuses
                        </button>
                        {statusOptions
                          .filter((s) => s.label.toLowerCase().includes(statusSearchQuery.toLowerCase()))
                          .map((status) => (
                            <button
                              key={status.value}
                              type="button"
                              onClick={() => {
                                setSelectedStatus(status.value);
                                setStatusSearchQuery(status.label);
                                setStatusDropdownOpen(false);
                                setPagination((p) => ({ ...p, page: 1 }));
                              }}
                              className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {status.label}
                            </button>
                          ))}
                        {statusOptions.filter((s) =>
                          s.label.toLowerCase().includes(statusSearchQuery.toLowerCase())
                        ).length === 0 && (
                          <div className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                            No statuses found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Assigned To (admin only) */}
                {user?.role === "admin" && (
                  <div className="min-w-[140px]">
                    <div className="relative" ref={assignedDropdownRef}>
                      <input
                        type="text"
                        placeholder="Search assignees..."
                        value={assignedSearchQuery}
                        onChange={(e) => setAssignedSearchQuery(e.target.value)}
                        onFocus={() => setAssignedDropdownOpen(true)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                      />
                      {selectedAssigned && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAssigned("");
                            setAssignedSearchQuery("");
                            setPagination((p) => ({ ...p, page: 1 }));
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      {assignedDropdownOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAssigned("");
                              setAssignedSearchQuery("");
                              setAssignedDropdownOpen(false);
                              setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700"
                          >
                            All Assignees
                          </button>
                          {users
                            .filter((emp) =>
                              emp.name.toLowerCase().includes(assignedSearchQuery.toLowerCase())
                            )
                            .map((emp) => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAssigned(emp.id.toString());
                                  setAssignedSearchQuery(emp.name);
                                  setAssignedDropdownOpen(false);
                                  setPagination((p) => ({ ...p, page: 1 }));
                                }}
                                className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                              >
                                {emp.name}
                              </button>
                            ))}
                          {users.filter((emp) =>
                            emp.name.toLowerCase().includes(assignedSearchQuery.toLowerCase())
                          ).length === 0 && (
                            <div className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                              No assignees found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Month */}
                <div className="min-w-[110px]">
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setPagination((p) => ({ ...p, page: 1 }));
                    }}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">All Months</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>

                {/* Year */}
                <div className="min-w-[90px]">
                  <select
                    value={selectedYear}
                    onChange={(e) => {
                      setSelectedYear(e.target.value);
                      setPagination((p) => ({ ...p, page: 1 }));
                    }}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">All Years</option>
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading leads...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">No leads found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        {[
                          "Name", "Phone", "Created At", "Due Date",
                          "Last Worked", "Status", "Assigned To",
                          "Assigned By", "Actions",
                        ].map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {leads.map((lead) => (
                        <tr
                          id={`lead-${lead.id}`}
                          key={lead.id}
                          className={`transition-colors duration-700 ${
                            user.role === "admin"
                              ? lead.assignedToRole === "admin"
                                ? "bg-red-100 dark:bg-red-900/20"
                                : lead.assignedToRole === "meeting"
                                  ? "bg-purple-100 dark:bg-purple-900/20"
                                  : lead.assignedToRole === "employee"
                                    ? "bg-green-100 dark:bg-green-900/20"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-700"
                              : !lead.isOwner
                                ? "bg-red-100 dark:bg-red-900/20 opacity-50"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700"
                          }`}
                        >
                          {/* Name */}
                          <td className="px-3 py-2 whitespace-nowrap max-w-[160px]">
                            <div className="flex items-center gap-1.5">
                              {user.role === "admin" || lead.isOwner ? (
  <button
    onClick={() => {
  sessionStorage.setItem("selectedLeadId", String(lead.id));
router.push(`/dashboard/leads/${lead.id}`);
}}
    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline cursor-pointer text-left truncate max-w-[110px]"
  >
    {lead.name || "-"}
  </button>
) : (
  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-not-allowed truncate max-w-[110px]">
    {lead.name || "-"}
  </span>
)}
                              {lead.lastNoteAddedByAdmin && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 whitespace-nowrap">
                                  Admin
                                </span>
                              )}
                              {lead.lastNote && (
                                <div className="relative group">
                                  <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 cursor-help flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                 <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 min-w-[250px] max-w-[600px] w-max p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg">

                                    <div className="font-semibold mb-1">
                                      Last Note by {lead.lastNote.performedByName}
                                      <span className="text-gray-300 dark:text-gray-400">
                                        {" "}
                                        ({new Date(lead.lastNote.timestamp).toLocaleString("en-US", {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })})
                                      </span>
                                    </div>

                                    <div className="text-white break-words whitespace-pre-wrap">
                                      Note — {lead.lastNote.note}
                                    </div>

                                    <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Phone */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {user.role === "admin" || lead.isOwner ? (
  <button
   onClick={() => {
sessionStorage.setItem("selectedLeadId", String(lead.id));
router.push(`/dashboard/leads/${lead.id}`);
}}
    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline"
  >
    {lead.phone || "-"}
  </button>
) : (
  <span className="text-xs text-gray-500 dark:text-gray-400 cursor-not-allowed">
    {lead.phone || "-"}
  </span>
)}
                          </td>

                          {/* Created At */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.createdAt
                                ? new Date(lead.createdAt).toLocaleString("en-US", {
                                    year: "numeric", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })
                                : "-"}
                            </div>
                          </td>

                          {/* Due Date */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.dueDate
                                ? new Date(lead.dueDate).toLocaleDateString("en-US", {
                                    year: "numeric", month: "short", day: "numeric",
                                  })
                                : "-"}
                            </div>
                          </td>

                          {/* Last Worked At */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.lastNote?.timestamp
                                ? new Date(lead.lastNote.timestamp).toLocaleString("en-US", {
                                    year: "numeric", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })
                                : "-"}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full ${getStatusBadgeColor(lead.status)}`}>
                              {formatStatusText(lead.status)}
                            </span>
                          </td>

                          {/* Assigned To */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.assignedToName || "Unassigned"}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {lead.assignedToRole === "admin" && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Admin</span>
                              )}
                              {lead.assignedToRole === "meeting" && (
                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Meeting</span>
                              )}
                              {lead.assignedToRole === "employee" && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Employee</span>
                              )}
                            </div>
                          </td>

                          {/* Assigned By */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.assignedByName || "-"}
                            </div>
                            {lead.assignedByRole && (
                              <span
                                className={`mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded ${
                                  lead.assignedByRole === "admin"
                                    ? "bg-red-100 text-red-700"
                                    : lead.assignedByRole === "meeting"
                                      ? "bg-purple-100 text-purple-700"
                                      : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {lead.assignedByRole}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {(user.role === "admin" || lead.isOwner) && (
                                <button
                                  onClick={() => handleAssign(lead.id, lead.assignedTo)}
                                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline"
                                >
                                  {lead.assignedTo ? "Reassign" : "Assign"}
                                </button>
                              )}
                              {user.role === "admin" || lead.isOwner ? (
  <button
   onClick={() => {
  sessionStorage.setItem("selectedLeadId", String(lead.id));
router.push(`/dashboard/leads/${lead.id}`);
}}
    className="text-[11px] text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 hover:underline"
  >
    View
  </button>
) : (
  <span className="text-[11px] text-orange-600 dark:text-orange-400 cursor-not-allowed">
    Read Only
  </span>
)}
                              {user.role === "admin" && (
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="text-[11px] text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:underline"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination()}
              </>
            )}
          </div>
        </div>
      </div>

      <CreateLeadModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchLeads}
      />

      {selectedLeadId && (
        <AssignLeadModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setSelectedLeadId(null);
            setSelectedLeadAssignee(null);
          }}
          onSuccess={fetchLeads}
          leadId={selectedLeadId}
          currentAssigneeId={selectedLeadAssignee}
        />
      )}
    </div>
  );
}