"use client";

/**
 * AttendanceOverrideModal
 *
 * Admin modal to override a single attendance record's status.
 * Requires a mandatory note explaining the change.
 * Calls PATCH /api/attendance/[id] and fires onSuccess when done.
 */

import { useState } from "react";
import toast from "react-hot-toast";
import { ATTENDANCE_STATUSES, STATUS_CONFIG } from "@/lib/attendance/constants";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/attendance/types";

interface Props {
  record: AttendanceRecord;
  onSuccess: (updated: AttendanceRecord) => void;
  onClose: () => void;
}

export default function AttendanceOverrideModal({ record, onSuccess, onClose }: Props) {
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [note, setNote] = useState(record.note || "");
  const [saving, setSaving] = useState(false);

  const formattedDate = new Date(record.date + "T00:00:00").toLocaleDateString(
    "en-IN",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      toast.error("A note is required for admin overrides");
      return;
    }

    setSaving(true);
    const t = toast.loading("Updating record…");
    try {
      const res = await fetch(`/api/attendance/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() }),
      });
      const data = await res.json();
      toast.dismiss(t);

      if (res.ok) {
        toast.success("Attendance record updated");
        onSuccess(data.record as AttendanceRecord);
      } else {
        toast.error(data.message || "Failed to update record");
      }
    } catch {
      toast.dismiss(t);
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Override Attendance
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Context */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Editing record for
            </p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {record.userName}{" "}
                (
                {record.role === "wm"
                  ? "WM"
                  : record.role === "wcm"
                  ? "WCM"
                  : record.role === "wtc"
                  ? "WTC"
                  : record.role === "supervisor"
                  ? "Supervisor"
                  : record.role.replace(/_/g, " ")}
                )
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{formattedDate}</p>
          </div>

          {/* Status picker */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              New Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ATTENDANCE_STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                      status === s
                        ? `border-current ${cfg.bgColor} ${cfg.color}`
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                  >
                    <span>{cfg.emoji}</span>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Reason / Note <span className="text-red-500">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Employee submitted medical certificate for leave approval"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium border border-zinc-300 dark:border-zinc-600 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !note.trim()}
              className="flex-1 py-2.5 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl transition-colors disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Override"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
