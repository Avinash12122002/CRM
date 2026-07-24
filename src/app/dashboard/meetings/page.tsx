"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";

type Meeting = {
  id: number;
  name: string;
  phone: string;
  status: string;
  meetingStatus?: string;
  meetingDetails?: {
    meetingDate: string;
    startTime: string;
    endTime: string;
    meetingUserName: string;
    status: string;
    bookedByName: string;
  };
};

type User = {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "employee" | "meeting";
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Stats = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};

export default function MeetingsPage() {
  const [user, setUser]           = useState<User | null>(null);
  const [meetings, setMeetings]   = useState<Meeting[]>([]);
  const [loading, setLoading]     = useState(true);       // initial auth+data load
  const [pageLoading, setPageLoading] = useState(false);  // subsequent page changes
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // ── Lazy init from localStorage — NO extra render cycle / useEffect chain ──
  const [page, setPage] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = Number(localStorage.getItem("meetingPage"));
      return saved > 0 ? saved : 1;
    }
    return 1;
  });

  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0, scheduled: 0, completed: 0, cancelled: 0,
  });

  // Persist page to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("meetingPage", String(page));
  }, [page]);

  // Guard against page going out of bounds after data loads
  useEffect(() => {
    if (pagination && page > pagination.totalPages && pagination.totalPages > 0) {
      setPage(pagination.totalPages);
    }
  }, [pagination]);

  // ── Auth: runs once ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const me = await res.json();
        setUser(me);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  // ── Fetch meetings whenever page changes (or on initial mount) ───────────
  useEffect(() => {
    fetchMeetings(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function fetchMeetings(targetPage: number) {
    setPageLoading(true);
    try {
      const res = await fetch(`/api/meetings?page=${targetPage}&limit=10`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setMeetings(data.meetings || []);
      setPagination(data.pagination);
      // Stats come on every request now (API optimized to always include them)
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load meetings");
    } finally {
      setPageLoading(false);
    }
  }

  const completeMeeting = async (leadId: number) => {
    if (!window.confirm("Mark this meeting as completed?")) return;
    setActionLoading(leadId);
    try {
      const res = await fetch("/api/meetings/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (res.ok) { toast.success("Meeting marked as completed"); fetchMeetings(page); }
      else toast.error(data.message || "Failed to complete meeting");
    } catch { toast.error("Something went wrong"); }
    finally { setActionLoading(null); }
  };

  const cancelMeeting = async (leadId: number) => {
    if (!window.confirm("Are you sure you want to cancel this meeting?")) return;
    setActionLoading(leadId);
    try {
      const res = await fetch("/api/meetings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (res.ok) { toast.success("Meeting cancelled"); fetchMeetings(page); }
      else toast.error(data.message || "Failed to cancel meeting");
    } catch { toast.error("Something went wrong"); }
    finally { setActionLoading(null); }
  };

  const statusBadge = (status?: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
      case "cancelled": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
      default:          return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    }
  };

  const rowBg = (status?: string) => {
    switch (status) {
      case "completed": return "bg-green-50/60 dark:bg-green-900/10";
      case "cancelled": return "bg-red-50/60 dark:bg-red-900/10";
      default:          return "hover:bg-gray-50 dark:hover:bg-zinc-700/50";
    }
  };

  // ── Initial full-page load ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading meetings...</p>
        </div>
      </div>
    );
  }

  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {user && <DashboardNavbar user={user} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meetings</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage all scheduled meetings
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total",     value: stats.total,     color: "bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700",         text: "text-gray-900 dark:text-gray-100" },
            { label: "Scheduled", value: stats.scheduled, color: "bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800",     text: "text-blue-700 dark:text-blue-300" },
            { label: "Completed", value: stats.completed, color: "bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800", text: "text-green-700 dark:text-green-300" },
            { label: "Cancelled", value: stats.cancelled, color: "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800",         text: "text-red-700 dark:text-red-300" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl px-4 py-3 ${card.color}`}>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${card.text}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Table — wrapper is relative so we can overlay the loading state */}
        <div className="relative bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-700 overflow-hidden">

          {/* ── Loading overlay: keeps existing rows visible during pagination ── */}
          {pageLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-zinc-800/60 backdrop-blur-[2px] rounded-xl">
              <div className="flex flex-col items-center gap-2">
                <svg className="w-7 h-7 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-xs text-zinc-500">Loading page {page}...</p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-zinc-700">
              <thead className="bg-gray-50 dark:bg-zinc-700">
                <tr>
                  {["Lead","Phone","Meeting Date","Start","End","Meeting User","Booked By","Status","Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
                {meetings.length === 0 && !pageLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                      <svg className="w-10 h-10 mx-auto text-gray-300 dark:text-zinc-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-gray-500 dark:text-zinc-400">No meetings found</p>
                    </td>
                  </tr>
                ) : (
                  meetings.map((meeting) => {
                    const isFinished  = meeting.meetingStatus === "completed" || meeting.meetingStatus === "cancelled";
                    const isActioning = actionLoading === meeting.id;
                    return (
                      <tr key={meeting.id} className={`transition-colors ${rowBg(meeting.meetingStatus)}`}>

                        <td className="px-4 py-2.5">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{meeting.name}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{meeting.phone}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{meeting.meetingDetails?.meetingDate || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{meeting.meetingDetails?.startTime || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{meeting.meetingDetails?.endTime || "—"}</span>
                        </td>
                         <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{meeting.meetingDetails?.meetingUserName || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{meeting.meetingDetails?.bookedByName || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusBadge(meeting.meetingStatus)}`}>
                            {meeting.meetingStatus || "scheduled"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            <button
                              disabled={isFinished || isActioning}
                              onClick={() => completeMeeting(meeting.id)}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition ${
                                isFinished || isActioning
                                  ? "bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 cursor-not-allowed"
                                  : "bg-green-600 hover:bg-green-700 text-white"
                              }`}
                            >
                              {isActioning ? (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                              ) : "Complete"}
                            </button>
                            <button
                              disabled={isFinished || isActioning}
                              onClick={() => cancelMeeting(meeting.id)}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition ${
                                isFinished || isActioning
                                  ? "bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 cursor-not-allowed"
                                  : "bg-red-500 hover:bg-red-600 text-white"
                              }`}
                            >
                              {isActioning ? (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                              ) : "Cancel"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 dark:border-zinc-700">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {pagination ? (
                <>
                  Showing{" "}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {(page - 1) * 10 + 1}
                  </span>
                  {" – "}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {Math.min(page * 10, pagination.total)}
                  </span>
                  {" of "}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {pagination.total}
                  </span>
                </>
              ) : "—"}
            </p>

            <div className="flex items-center gap-1">
              <button
                disabled={pageLoading || page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>

              {/* Page number pills */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
                  .flatMap((p, idx, arr) => {
                    const els = [];
                    if (idx > 0 && p - arr[idx - 1] > 1) {
                      els.push(<span key={`dots-${p}`} className="px-1 text-xs text-zinc-400">…</span>);
                    }
                    els.push(
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        disabled={pageLoading}
                        className={`w-7 h-7 text-xs rounded-lg font-medium transition ${
                          p === page
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {p}
                      </button>
                    );
                    return els;
                  })}
              </div>

              <button
                disabled={pageLoading || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}