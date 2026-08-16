"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface AssignTriloknathLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  leadId: number;
  currentAssigneeId?: number | null;
}

interface UserOption {
  id: number;
  name: string;
  role: string;
}

export default function AssignTriloknathLeadModal({
  isOpen,
  onClose,
  onSuccess,
  leadId,
  currentAssigneeId,
}: AssignTriloknathLeadModalProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>(currentAssigneeId ? currentAssigneeId.toString() : "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAssignedTo(currentAssigneeId ? currentAssigneeId.toString() : "");
      (async () => {
        try {
          const res = await fetch("/api/auth/users");
          const data = await res.json();
          if (res.ok) {
            const allUsers = (data.users || []).filter((user: UserOption) =>
              ["admin", "telecaller", "employee", "meeting", "case_manager", "wm", "wcm", "wtc", "supervisor"].includes(user.role),
            );
            setUsers(allUsers);
          } else {
            toast.error(data.message || "Failed to load users");
          }
        } catch (err) {
          console.error(err);
          toast.error("Failed to load users");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isOpen, currentAssigneeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/triloknath/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, assignedTo: assignedTo ? Number(assignedTo) : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to assign lead");
        return;
      }
      toast.success("Triloknath Lead assigned successfully");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          Assign Triloknath Lead #{leadId}
        </h3>

        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading staff users...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Select Assignee
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (
                    {u.role === "wm"
                      ? "WM"
                      : u.role === "wcm"
                      ? "WCM"
                      : u.role === "wtc"
                      ? "WTC"
                      : u.role === "supervisor"
                      ? "Supervisor"
                      : u.role.replace(/_/g, " ")}
                    )
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
              >
                {submitting ? "Saving..." : "Save Assignment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
