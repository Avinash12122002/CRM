"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import CreateTriloknathLeadModal from "@/components/CreateTriloknathLeadModal";
import AssignTriloknathLeadModal from "@/components/AssignTriloknathLeadModal";

interface User {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "wm" | "wcm" | "wtc" | "supervisor";
}

interface Lead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  status: string;
  isAgent?: boolean;
  dueDate?: string;
  callbackDate?: string;
  callbackSeen?: boolean;
  isDueToday?: boolean;
  assignedTo: number | null;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToRole?: "admin" | "telecaller" | "employee" | "meeting" | "case_manager" | "wm" | "wcm" | "wtc" | "supervisor";
  assignedBy?: number;
  assignedByName?: string;
  assignedByRole?: "admin" | "telecaller" | "employee" | "meeting" | "case_manager" | "wm" | "wcm" | "wtc" | "supervisor";
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

const FILTER_STORAGE_KEY = "triloknath_leads_filters";

interface StoredFilters {
  searchQuery: string;
  selectedStatus: string;
  statusSearchQuery: string;
  selectedAssigned: string;
  assignedSearchQuery: string;
  selectedMonth: string;
  selectedYear: string;
  agentFilter: string;
  page: number;
  limit: number;
}

export default function TriloknathLeadsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<
    { id: number; name: string; role: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusSearchQuery, setStatusSearchQuery] = useState("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [selectedAssigned, setSelectedAssigned] = useState("");
  const [assignedSearchQuery, setAssignedSearchQuery] = useState("");
  const [assignedDropdownOpen, setAssignedDropdownOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedLeadAssignee, setSelectedLeadAssignee] = useState<
    number | null
  >(null);
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
          setSelectedYear(
            filters.selectedYear !== undefined ? filters.selectedYear : "",
          );
          setAgentFilter(filters.agentFilter || "");
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
        agentFilter,
        page: pagination.page,
        limit: pagination.limit,
      };
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    }
  }, [
    searchQuery,
    selectedStatus,
    statusSearchQuery,
    selectedAssigned,
    assignedSearchQuery,
    selectedMonth,
    selectedYear,
    agentFilter,
    pagination.page,
    pagination.limit,
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
    user,
    pagination.page,
    pagination.limit,
    searchQuery,
    selectedStatus,
    selectedAssigned,
    selectedMonth,
    selectedYear,
    agentFilter,
  ]);

  useEffect(() => {
    if (user && user.role === "admin") {
      fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setStatusDropdownOpen(false);
      }
      if (
        assignedDropdownRef.current &&
        !assignedDropdownRef.current.contains(event.target as Node)
      ) {
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
      let url = `/api/triloknath/leads/list?page=${pageToUse}&limit=${limitToUse}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (selectedStatus)
        url += `&status=${encodeURIComponent(selectedStatus)}`;
      if (selectedAssigned)
        url += `&assignedTo=${encodeURIComponent(selectedAssigned)}`;
      if (selectedMonth) url += `&month=${selectedMonth}`;
      if (selectedYear) url += `&year=${selectedYear}`;
      if (agentFilter) url += `&isAgent=${agentFilter}`;

      const res = await fetch(url);

      if (!res.ok) {
        if (!toastShownRef.current) {
          toast.error("Failed to load Triloknath leads");
          toastShownRef.current = true;
        }
        return;
      }

      const data = await res.json();
      setLeads(data.leads || []);
      setPagination(
        data.pagination || {
          total: 0,
          page: pageToUse,
          limit: limitToUse,
          totalPages: 0,
        },
      );
    } catch (err) {
      console.error(err);
      if (!toastShownRef.current) {
        toast.error("Failed to load Triloknath leads");
        toastShownRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) {
      return;
    }

    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}/delete`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.message || "Failed to delete lead");
        return;
      }

      toast.success("Lead deleted successfully");
      fetchLeads();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete lead");
    }
  };

  const handleOpenAssignModal = (
    leadId: number,
    currentAssignee: number | null,
  ) => {
    setSelectedLeadId(leadId);
    setSelectedLeadAssignee(currentAssignee);
    setAssignModalOpen(true);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedStatus("");
    setStatusSearchQuery("");
    setSelectedAssigned("");
    setAssignedSearchQuery("");
    setSelectedMonth("");
    setSelectedYear(new Date().getFullYear().toString());
    setAgentFilter("");
    setPagination((prev) => ({ ...prev, page: 1 }));
    localStorage.removeItem(FILTER_STORAGE_KEY);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "new-lead":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300";
      case "call-back":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300";
      case "not-answering":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300";
      case "meeting-scheduled":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300";
      case "not-interested":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      case "wrong-number":
        return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
      case "document-pending":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300";
      case "payment-pending":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300";
      case "sales":
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const getRowBgColor = (lead: Lead) => {
    if (lead.status === "call-back" && lead.callbackDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cbDate = new Date(lead.callbackDate);
      cbDate.setHours(0, 0, 0, 0);

      const isOverdue = cbDate.getTime() < today.getTime();
      if (isOverdue) {
        return "border-l-4 border-l-rose-400 bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20";
      }
      return "border-l-4 border-l-amber-300 bg-amber-50/30 dark:bg-amber-900/5 hover:bg-amber-50/60 dark:hover:bg-amber-900/10";
    }

    if (user && user.role === "admin") {
      if (lead.assignedToRole === "admin") {
        return "border-l-4 border-l-red-300 hover:bg-gray-50 dark:hover:bg-gray-700/50";
      }
      if (lead.assignedToRole === "meeting" || lead.assignedToRole === "wm") {
        return "border-l-4 border-l-purple-300 hover:bg-gray-50 dark:hover:bg-gray-700/50";
      }
      if (lead.assignedToRole === "telecaller" || lead.assignedToRole === "employee" || lead.assignedToRole === "wtc" || lead.assignedToRole === "supervisor") {
        return "border-l-4 border-l-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/50";
      }
      if (lead.assignedToRole === "case_manager" || lead.assignedToRole === "wcm") {
        return "border-l-4 border-l-teal-300 hover:bg-gray-50 dark:hover:bg-gray-700/50";
      }
    }

    return "border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50";
  };

  const getRoleBadgeLabel = (role?: string) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "meeting":
        return "Meeting";
      case "telecaller":
        return "Telecaller";
      case "employee":
        return "Employee";
      case "case_manager":
        return "Case Manager";
      case "wm":
        return "WM";
      case "wcm":
        return "WCM";
      case "wtc":
        return "WTC";
      case "supervisor":
        return "Supervisor";
      default:
        return role || "";
    }
  };

  const getRoleBadgeClasses = (role?: string) => {
    switch (role) {
      case "admin":
        return "bg-red-100 text-red-700";
      case "meeting":
      case "wm":
        return "bg-purple-100 text-purple-700";
      case "telecaller":
      case "wtc":
      case "supervisor":
        return "bg-blue-100 text-blue-700";
      case "employee":
        return "bg-indigo-100 text-indigo-700";
      case "case_manager":
      case "wcm":
        return "bg-teal-100 text-teal-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatStatusText = (status: string) => {
    switch (status) {
      case "new-lead":
        return "New Lead";
      case "call-back":
        return "Call Back";
      case "not-answering":
        return "Not Answering";
      case "meeting-scheduled":
        return "Meeting Scheduled";
      case "not-interested":
        return "Not Interested";
      case "wrong-number":
        return "Wrong Number";
      case "document-pending":
        return "Doc Pending";
      case "payment-pending":
        return "Pay Pending";
      case "sales":
        return "Sales";
      default:
        return status;
    }
  };

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    return (
      <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
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
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  Math.abs(page - pagination.page) <= 1,
              )
              .map((page, index, array) => {
                const showEllipsis = index > 0 && page - array[index - 1] > 1;
                return (
                  <React.Fragment key={page}>
                    {showEllipsis && (
                      <span className="relative inline-flex items-center px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        ...
                      </span>
                    )}
                    <button
                      onClick={() => handlePageChange(page)}
                      className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
                        pagination.page === page
                          ? "z-10 bg-blue-50 dark:bg-blue-900/50 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold"
                          : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}

            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
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

  const statuses = [
    { value: "", label: "All Statuses" },
    ...statusOptions,
  ];

  const months = [
    { value: "", label: "All Months" },
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) =>
    (currentYear - i).toString(),
  );

  const filteredStatuses = statuses.filter((s) =>
    s.label.toLowerCase().includes(statusSearchQuery.toLowerCase()),
  );

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(assignedSearchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />
      <div className="max-w-7xl mx-auto py-4 sm:px-4 lg:px-6">
        <div className="px-3 py-4 sm:px-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Triloknath Leads
            </h1>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                Rows per page
              </label>
              <select
                value={pagination.limit}
                onChange={(e) =>
                  setPagination((prev) => ({
                    ...prev,
                    limit: Number(e.target.value),
                    page: 1,
                  }))
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

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
            {/* Filters */}
            <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex flex-wrap gap-2">
                {/* Search */}
                <div className="flex-1 min-w-40">
                  <input
                    type="text"
                    placeholder="Search name, phone, or email"
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
                        <svg
                          className="w-3 h-3"
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
                    {statusDropdownOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatus("");
                            setStatusSearchQuery("");
                            setStatusDropdownOpen(false);
                            setPagination((p) => ({ ...p, page: 1 }));
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs border-b border-gray-100 dark:border-gray-700 ${
                            !selectedStatus
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                              : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          All Statuses
                        </button>
                        {filteredStatuses.slice(1).map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => {
                              setSelectedStatus(s.value);
                              setStatusSearchQuery(s.label);
                              setStatusDropdownOpen(false);
                              setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs ${
                              selectedStatus === s.value
                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Assigned To (Admin Only) */}
                {user.role === "admin" && (
                  <div className="min-w-[140px]">
                    <div className="relative" ref={assignedDropdownRef}>
                      <input
                        type="text"
                        placeholder="Search assignees..."
                        value={assignedSearchQuery}
                        onChange={(e) =>
                          setAssignedSearchQuery(e.target.value)
                        }
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
                          <svg
                            className="w-3 h-3"
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
                      {assignedDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAssigned("");
                              setAssignedSearchQuery("");
                              setAssignedDropdownOpen(false);
                              setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs border-b border-gray-100 dark:border-gray-700 ${
                              !selectedAssigned
                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            All Assignees
                          </button>
                          {filteredUsers.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setSelectedAssigned(u.id.toString());
                                setAssignedSearchQuery(u.name);
                                setAssignedDropdownOpen(false);
                                setPagination((p) => ({ ...p, page: 1 }));
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs ${
                                selectedAssigned === u.id.toString()
                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {u.name} ({u.role})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Month */}
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                {/* Year */}
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                {/* Agent Filter */}
                <select
                  value={agentFilter}
                  onChange={(e) => {
                    setAgentFilter(e.target.value);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">All Leads</option>
                  <option value="false">Direct Leads</option>
                  <option value="true">Agent Leads</option>
                </select>

                {(searchQuery ||
                  selectedStatus ||
                  selectedAssigned ||
                  selectedMonth ||
                  agentFilter) && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-1 self-center"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Legend Row */}
              <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Assigned to Admin
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
                  Assigned to Meeting
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                  Assigned to Telecaller
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />
                  Assigned to Case Manager
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                  Agent
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Callback Due Today
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                  Callback Overdue
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 text-left">NAME</th>
                    <th className="py-2.5 px-3 text-left">PHONE</th>
                    <th className="py-2.5 px-3 text-left">EMAIL</th>
                    <th className="py-2.5 px-3 text-left">CREATED AT</th>
                    <th className="py-2.5 px-3 text-left">LAST WORKED</th>
                    <th className="py-2.5 px-3 text-left">STATUS</th>
                    <th className="py-2.5 px-3 text-left">ASSIGNED TO</th>
                    <th className="py-2.5 px-3 text-left">ASSIGNED BY</th>
                    <th className="py-2.5 px-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        Loading Triloknath leads...
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        No Triloknath leads found.
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => {
                      return (
                        <tr
                          key={lead.id}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition ${getRowBgColor(
                            lead,
                          )}`}
                        >
                          {/* Name */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {user.role === "admin" || lead.isOwner ? (
                                <button
                                  onClick={() => {
                                    sessionStorage.setItem(
                                      "selectedLeadId",
                                      String(lead.id),
                                    );
                                    router.push(
                                      `/dashboard/triloknath-leads/${lead.id}`,
                                    );
                                  }}
                                  className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline text-left truncate max-w-[110px]"
                                >
                                  {lead.name || "-"}
                                </button>
                              ) : (
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-not-allowed truncate max-w-[110px]">
                                  {lead.name || "-"}
                                </span>
                              )}

                              {lead.isAgent && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 whitespace-nowrap border border-amber-300 dark:border-amber-700">
                                  Agent
                                </span>
                              )}

                              {lead.lastNoteAddedByAdmin && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 whitespace-nowrap">
                                  Admin
                                </span>
                              )}

                              {lead.lastNote && (
                                <div className="relative group">
                                  <svg
                                    className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 cursor-help shrink-0"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 min-w-[250px] max-w-[600px] w-max p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg">
                                    <div className="font-semibold mb-1">
                                      Last Note by{" "}
                                      {lead.lastNote.performedByName}
                                      <span className="text-gray-300 dark:text-gray-400">
                                        {" "}
                                        (
                                        {new Date(
                                          lead.lastNote.timestamp,
                                        ).toLocaleString("en-US", {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                        )
                                      </span>
                                    </div>

                                    <div className="text-white wrap-break-word whitespace-pre-wrap">
                                      Note — {lead.lastNote.note}
                                    </div>

                                    <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Phone */}
                          <td className="px-3 py-2">
                            {user.role === "admin" || lead.isOwner ? (
                              <button
                                onClick={() => {
                                  sessionStorage.setItem(
                                    "selectedLeadId",
                                    String(lead.id),
                                  );
                                  router.push(
                                    `/dashboard/triloknath-leads/${lead.id}`,
                                  );
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

                          {/* Email */}
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-600 dark:text-gray-300 truncate block max-w-40">
                              {lead.email || "-"}
                            </span>
                          </td>

                          {/* Created At */}
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.createdAt
                                ? new Date(lead.createdAt).toLocaleString(
                                    "en-US",
                                    {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : "-"}
                            </div>
                          </td>

                          {/* Last Worked At */}
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.lastNote?.timestamp
                                ? new Date(
                                    lead.lastNote.timestamp,
                                  ).toLocaleString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                            </div>
                          </td>

                          {/* Status - Rendered exactly as static badge pill like main leads page */}
                          <td className="px-3 py-2">
                            {lead.status === "call-back" ? (
                              <div className="flex flex-col">
                                <span
                                  className={`px-1.5 py-0.5 inline-flex w-fit text-[11px] font-semibold rounded-full ${getStatusBadgeColor(
                                    lead.status,
                                  )}`}
                                >
                                  🔔 Call Back
                                </span>

                                <span
                                  className={`mt-1 text-[10px] font-semibold ${
                                    lead.isDueToday
                                      ? "text-green-600 dark:text-green-400"
                                      : !lead.isDueToday &&
                                          lead.callbackDate &&
                                          new Date(lead.callbackDate).setHours(
                                            0,
                                            0,
                                            0,
                                            0,
                                          ) < new Date().setHours(0, 0, 0, 0)
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-orange-600 dark:text-orange-400"
                                  }`}
                                >
                                  {lead.callbackDate
                                    ? (() => {
                                        const callback = new Date(
                                          lead.callbackDate,
                                        );
                                        const today = new Date();

                                        callback.setHours(0, 0, 0, 0);
                                        today.setHours(0, 0, 0, 0);

                                        if (
                                          callback.getTime() === today.getTime()
                                        ) {
                                          return "Today";
                                        }

                                        if (callback < today) {
                                          return `Overdue (${callback.toLocaleDateString(
                                            "en-US",
                                            {
                                              day: "2-digit",
                                              month: "short",
                                            },
                                          )})`;
                                        }

                                        return callback.toLocaleDateString(
                                          "en-US",
                                          {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                          },
                                        );
                                      })()
                                    : "-"}
                                </span>
                              </div>
                            ) : (
                              <span
                                className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full ${getStatusBadgeColor(
                                  lead.status,
                                )}`}
                              >
                                {formatStatusText(lead.status)}
                              </span>
                            )}
                          </td>

                          {/* Assigned To */}
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.assignedToName || "Unassigned"}
                            </div>
                            {lead.assignedToRole && (
                              <span
                                className={`mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded ${getRoleBadgeClasses(
                                  lead.assignedToRole,
                                )}`}
                              >
                                {getRoleBadgeLabel(lead.assignedToRole)}
                              </span>
                            )}
                          </td>

                          {/* Assigned By */}
                          <td className="px-3 py-2">
                            <div className="text-xs text-gray-900 dark:text-gray-100">
                              {lead.assignedByName || "-"}
                            </div>
                            {lead.assignedByRole && (
                              <span
                                className={`mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded ${getRoleBadgeClasses(
                                  lead.assignedByRole,
                                )}`}
                              >
                                {getRoleBadgeLabel(lead.assignedByRole)}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2 text-right text-xs font-medium space-x-2 whitespace-nowrap">
                            {user.role === "admin" && (
                              <button
                                onClick={() =>
                                  handleOpenAssignModal(
                                    lead.id,
                                    lead.assignedTo,
                                  )
                                }
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                              >
                                Reassign
                              </button>
                            )}

                            {user.role === "admin" || lead.isOwner ? (
                              <button
                                onClick={() => {
                                  sessionStorage.setItem(
                                    "selectedLeadId",
                                    String(lead.id),
                                  );
                                  router.push(
                                    `/dashboard/triloknath-leads/${lead.id}`,
                                  );
                                }}
                                className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                              >
                                View
                              </button>
                            ) : null}

                            {user.role === "admin" && (
                              <button
                                onClick={() => handleDeleteLead(lead.id)}
                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {renderPagination()}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateTriloknathLeadModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false);
          fetchLeads();
        }}
      />

      {selectedLeadId !== null && (
        <AssignTriloknathLeadModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setSelectedLeadId(null);
            setSelectedLeadAssignee(null);
          }}
          onSuccess={() => {
            setAssignModalOpen(false);
            setSelectedLeadId(null);
            setSelectedLeadAssignee(null);
            fetchLeads();
          }}
          leadId={selectedLeadId}
          currentAssigneeId={selectedLeadAssignee}
        />
      )}
    </div>
  );
}
