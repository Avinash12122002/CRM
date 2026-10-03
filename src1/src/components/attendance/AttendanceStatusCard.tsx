"use client";

/**
 * AttendanceStatusCard
 *
 * Compact dashboard widget shown below Time Tracker (CheckInOutCard).
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { STATUS_CONFIG, SELF_MARK_STATUSES } from "@/lib/attendance/constants";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/attendance/types";

export default function AttendanceStatusCard() {
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [today, setToday] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<AttendanceStatus | null>(null);

  // Reason modal state for Half Day / Leave
  const [reasonModalStatus, setReasonModalStatus] = useState<AttendanceStatus | null>(null);
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/attendance/today-status");
        if (res.ok) {
          const data = await res.json();
          setRecord(data.record);
          setToday(data.today || "");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleMark(status: AttendanceStatus, note?: string) {
    setMarking(status);
    const t = toast.loading("Marking attendance…");
    try {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const data = await res.json();
      toast.dismiss(t);
      if (res.ok) {
        toast.success("Attendance marked!");
        setRecord(data.record as AttendanceRecord);
      } else {
        toast.error(data.message || "Failed to mark attendance");
      }
    } catch {
      toast.dismiss(t);
      toast.error("Network error — please try again");
    } finally {
      setMarking(null);
    }
  }

  function handleButtonClick(status: AttendanceStatus) {
    if (status === "half-day" || status === "leave") {
      setReasonModalStatus(status);
      setReasonText("");
    } else {
      handleMark(status);
    }
  }

  const formattedDate = today
    ? new Date(today + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : "";

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 p-3.5 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📅</span>
            <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100">
              Today&apos;s Attendance
            </h3>
          </div>
          {formattedDate && (
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {formattedDate}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
          </div>
        ) : record ? (
          /* Already marked */
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  STATUS_CONFIG[record.status].bgColor
                } ${STATUS_CONFIG[record.status].color}`}
              >
                <span>{STATUS_CONFIG[record.status].emoji}</span>
                {STATUS_CONFIG[record.status].label}
              </span>
              {record.checkInTime && (
                <span className="text-[10px] text-zinc-400">
                  {new Date(record.checkInTime).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {record.note && (
              <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-700/40 px-2.5 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-700/60 truncate">
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">Reason:</span> {record.note}
              </p>
            )}
            {record.markedBy === "admin" && (
              <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Overridden by admin</p>
            )}
            {record.markedBy === "system" && (
              <p className="text-[10px] text-zinc-400">Auto-marked by system</p>
            )}
          </div>
        ) : (
          /* Not yet marked */
          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Select status for today:
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {SELF_MARK_STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => handleButtonClick(s)}
                    disabled={!!marking}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${cfg.bgColor} ${cfg.color} hover:opacity-90`}
                  >
                    {marking === s ? (
                      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <span>{cfg.emoji}</span>
                    )}
                    <span className="truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Reason Modal Popup for Half Day / Leave */}
      {reasonModalStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReasonModalStatus(null);
              setReasonText("");
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 w-full max-w-xs shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <span>{STATUS_CONFIG[reasonModalStatus].emoji}</span>
                Reason for {STATUS_CONFIG[reasonModalStatus].label}
              </h4>
              <button
                onClick={() => {
                  setReasonModalStatus(null);
                  setReasonText("");
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Please enter your reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder={
                  reasonModalStatus === "leave"
                    ? "e.g. Medical emergency, Family function"
                    : "e.g. Doctor visit in afternoon"
                }
                rows={2}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 dark:border-zinc-600 rounded-xl bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                autoFocus
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setReasonModalStatus(null);
                  setReasonText("");
                }}
                className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reasonText.trim() || !!marking}
                onClick={() => {
                  const st = reasonModalStatus;
                  const note = reasonText.trim();
                  setReasonModalStatus(null);
                  setReasonText("");
                  handleMark(st, note);
                }}
                className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
