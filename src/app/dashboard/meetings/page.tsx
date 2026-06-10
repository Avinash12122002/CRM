"use client";

import { useEffect, useState } from "react";
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
  };
};

type User = {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "employee" | "meeting";
};

export default function MeetingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchMeetings = async () => {
    try {
      const res = await fetch("/api/meetings");
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return;
        const me = await meRes.json();
        setUser(me);
        await fetchMeetings();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

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
      if (res.ok) {
        toast.success("Meeting marked as completed");
        fetchMeetings();
      } else {
        toast.error(data.message || "Failed to complete meeting");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setActionLoading(null);
    }
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
      if (res.ok) {
        toast.success("Meeting cancelled");
        fetchMeetings();
      } else {
        toast.error(data.message || "Failed to cancel meeting");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setActionLoading(null);
    }
  };

  // Derived counts for summary cards
  const total      = meetings.length;
  const scheduled  = meetings.filter((m) => !m.meetingStatus || m.meetingStatus === "scheduled").length;
  const completed  = meetings.filter((m) => m.meetingStatus === "completed").length;
  const cancelled  = meetings.filter((m) => m.meetingStatus === "cancelled").length;

  const statusBadge = (status?: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
      default:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    }
  };

  const rowBg = (status?: string) => {
    switch (status) {
      case "completed": return "bg-green-50/60 dark:bg-green-900/10";
      case "cancelled": return "bg-red-50/60 dark:bg-red-900/10";
      default:          return "hover:bg-gray-50 dark:hover:bg-zinc-700/50";
    }
  };

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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {user && <DashboardNavbar user={user} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meetings</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage all scheduled meetings
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total",     value: total,     color: "bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700",          text: "text-gray-900 dark:text-gray-100" },
            { label: "Scheduled", value: scheduled,  color: "bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800",      text: "text-blue-700 dark:text-blue-300" },
            { label: "Completed", value: completed,  color: "bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800",  text: "text-green-700 dark:text-green-300" },
            { label: "Cancelled", value: cancelled,  color: "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800",          text: "text-red-700 dark:text-red-300" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl px-4 py-3 ${card.color}`}>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${card.text}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-zinc-700">
              <thead className="bg-gray-50 dark:bg-zinc-700">
                <tr>
                  {[
                    "Lead", "Phone", "Meeting Date",
                    "Start", "End", "Meeting User", "Status", "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
                {meetings.length === 0 ? (
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
                    const isFinished =
                      meeting.meetingStatus === "completed" ||
                      meeting.meetingStatus === "cancelled";
                    const isActioning = actionLoading === meeting.id;

                    return (
                      <tr key={meeting.id} className={`transition-colors ${rowBg(meeting.meetingStatus)}`}>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                            {meeting.name}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-xs text-gray-700 dark:text-gray-300">
                            {meeting.phone}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-xs text-gray-700 dark:text-gray-300">
                            {meeting.meetingDetails?.meetingDate || "—"}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-xs text-gray-700 dark:text-gray-300">
                            {meeting.meetingDetails?.startTime || "—"}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-xs text-gray-700 dark:text-gray-300">
                            {meeting.meetingDetails?.endTime || "—"}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-xs text-gray-700 dark:text-gray-300">
                            {meeting.meetingDetails?.meetingUserName || "—"}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusBadge(meeting.meetingStatus)}`}>
                            {meeting.meetingStatus || "scheduled"}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            <button
                              disabled={isFinished || isActioning}
                              onClick={() => completeMeeting(meeting.id)}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg text-white transition ${
                                isFinished || isActioning
                                  ? "bg-gray-200 dark:bg-zinc-600 text-gray-400 dark:text-zinc-500 cursor-not-allowed"
                                  : "bg-green-600 hover:bg-green-700"
                              }`}
                            >
                              {isActioning ? "..." : "Complete"}
                            </button>

                            <button
                              disabled={isFinished || isActioning}
                              onClick={() => cancelMeeting(meeting.id)}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg text-white transition ${
                                isFinished || isActioning
                                  ? "bg-gray-200 dark:bg-zinc-600 text-gray-400 dark:text-zinc-500 cursor-not-allowed"
                                  : "bg-red-500 hover:bg-red-600"
                              }`}
                            >
                              {isActioning ? "..." : "Cancel"}
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
        </div>

      </div>
    </div>
  );
}