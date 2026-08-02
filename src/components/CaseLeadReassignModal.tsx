"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface CaseManagerOption {
  id: number;
  name: string;
  leadCount: number;
}

interface CaseLeadReassignModalProps {
  lead: { id: number; name?: string; assignedTo: number | null; assignedToName?: string };
  onClose: () => void;
  onReassigned: () => void;
}

export default function CaseLeadReassignModal({
  lead,
  onClose,
  onReassigned,
}: CaseLeadReassignModalProps) {
  const [caseManagers, setCaseManagers] = useState<CaseManagerOption[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/case-manager/options");
        const data = await res.json();
        if (res.ok) {
          setCaseManagers(data.caseManagers || []);
        } else {
          toast.error(data.message || "Failed to load case managers");
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load case managers");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedTo) {
      toast.error("Select a case manager");
      return;
    }
    if (Number(assignedTo) === lead.assignedTo) {
      toast.error("Lead is already assigned to this case manager");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, assignedTo: Number(assignedTo) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to reassign lead");
        return;
      }
      toast.success("Lead reassigned successfully");
      onReassigned();
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
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
            Reassign Case Lead
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
          {lead.name || `Lead #${lead.id}`}
          {lead.assignedToName ? (
            <>
              {" "}
              — currently with{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {lead.assignedToName}
              </span>
            </>
          ) : null}
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
            Assign to Case Manager
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{loading ? "Loading..." : "Select a case manager"}</option>
            {caseManagers.map((cm) => (
              <option key={cm.id} value={cm.id} disabled={cm.id === lead.assignedTo}>
                {cm.name} ({cm.leadCount} lead{cm.leadCount === 1 ? "" : "s"})
                {cm.id === lead.assignedTo ? " — current" : ""}
              </option>
            ))}
          </select>

          {!loading && caseManagers.length === 0 && (
            <p className="text-xs text-red-500 mt-2">
              No case managers exist yet.
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
