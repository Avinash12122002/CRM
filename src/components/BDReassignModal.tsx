"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type BDUser = { id: number; name: string; role: string };

export default function BDReassignModal({
  lead,
  onClose,
  onReassigned,
}: {
  lead: { id: number; companyName?: string; assignedTo?: number; assignedToName?: string };
  onClose: () => void;
  onReassigned: () => void;
}) {
  const [bdUsers, setBdUsers] = useState<BDUser[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/by-role?role=business_development");
        const data = await res.json();
        setBdUsers(data.users || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load Business Development users");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedTo) {
      toast.error("Select a Business Development user");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bd/leads/${lead.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: Number(assignedTo) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to reassign lead");
        return;
      }
      toast.success(data.message || "Lead reassigned");
      onReassigned();
    } catch (err) {
      console.error(err);
      toast.error("Failed to reassign lead");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Reassign Lead
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          {lead.companyName || `Lead #${lead.id}`}
          {lead.assignedToName ? (
            <>
              {" "}
              — currently owned by{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {lead.assignedToName}
              </span>
            </>
          ) : null}
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
            Assign to Business Development user
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{loading ? "Loading..." : "Select a user"}</option>
            {bdUsers.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id === lead.assignedTo}>
                {u.name}
                {u.id === lead.assignedTo ? " (current owner)" : ""}
              </option>
            ))}
          </select>

          {!loading && bdUsers.length === 0 && (
            <p className="text-xs text-red-500 mt-2">
              No Business Development users exist yet.
            </p>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Reassigning..." : "Reassign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
