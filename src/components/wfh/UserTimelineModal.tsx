"use client";

import { useEffect, useState } from "react";

interface ActionLog {
  id: number;
  actionType: string;
  entityType: string;
  entityId: string | number;
  summary: string;
  timestamp: string;
}

interface UserTimelineModalProps {
  userId: number;
  date: string;
  onClose: () => void;
}

export default function UserTimelineModal({ userId, date, onClose }: UserTimelineModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    user: { id: number; name: string; username: string; role: string };
    activity: {
      checkIn: string;
      checkOut: string | null;
      activeSeconds: number;
      idleSeconds: number;
      actionsToday: number;
      isGhostAlert: boolean;
      workVerificationStatus: string;
      isMonitored?: boolean;
    } | null;
    actions: ActionLog[];
  } | null>(null);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/wfh-monitor/timeline?userId=${userId}&date=${date}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchTimeline();
  }, [userId, date]);

  const formatMins = (secs?: number) => {
    const totalMins = Math.floor((secs || 0) / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h ${m}m`;
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "--";
    return new Date(isoString).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>{data?.user.name || "Employee"} Timeline</span>
              {data?.user.role && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 uppercase">
                  {data.user.role.replace(/_/g, " ")}
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Detailed audit trail of actions performed on {date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-zinc-400 text-sm animate-pulse">
              Loading user activity timeline...
            </div>
          ) : !data ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              Failed to load activity details.
            </div>
          ) : (
            <>
              {/* Summary Stats Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-800/40 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
                <div>
                  <span className="text-zinc-400 block mb-0.5">Check In</span>
                  <span className="font-semibold text-gray-800 dark:text-zinc-200">
                    {formatTime(data.activity?.checkIn)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">Active Time</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatMins(data.activity?.activeSeconds)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">Idle Time</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {formatMins(data.activity?.idleSeconds)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">Total Actions</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                    {(data.actions || []).length}
                  </span>
                </div>
              </div>

              {/* Ghost Check-in Alert Banner if zero work performed or prolonged inactivity (Only for monitored roles) */}
              {data.activity?.isMonitored && (data.actions || []).length === 0 ? (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <h4 className="font-bold text-sm">Ghost Check-In Detected</h4>
                      <p className="text-xs mt-1 leading-relaxed">
                        This user clocked in but has not performed any recorded work actions in the CRM today (no notes added, no lead status changes, no emails sent).
                      </p>
                    </div>
                  </div>
                </div>
              ) : data.activity?.isMonitored && data.activity?.isGhostAlert ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <h4 className="font-bold text-sm">Prolonged Inactivity Detected</h4>
                      <p className="text-xs mt-1 leading-relaxed">
                        This user has not performed any CRM actions for over 10 minutes while clocked in.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Action History Feed */}
              <div>
                <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
                  Chronological Actions ({(data.actions || []).length})
                </h4>

                {(data.actions || []).length === 0 ? (
                  <p className="text-xs text-zinc-400 italic py-4 text-center">
                    No actions logged for this date.
                  </p>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
                    {(data.actions || []).map((act) => (
                      <div key={act.id} className="relative group">
                        <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white dark:ring-zinc-900" />
                        <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3 shadow-xs">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {act.actionType.replace(/_/g, " ")}
                            </span>
                            <span className="text-zinc-400">
                              {formatTime(act.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-700 dark:text-zinc-200">
                            {act.summary}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 text-xs font-medium rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
