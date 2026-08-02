"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import CaseLeadReassignModal from "@/components/CaseLeadReassignModal";
import CaseLeadEditModal from "@/components/CaseLeadEditModal";

interface User {
  id: number;
  name: string;
  email?: string;
  role:
    | "admin"
    | "telecaller"
    | "meeting"
    | "business_development"
    | "billing"
    | "case_manager";
}

interface HistoryEntry {
  action: string;
  performedBy: number;
  performedByName: string;
  timestamp: string;
  details?: string;
  oldStatus?: string;
  newStatus?: string;
  newAssigneeName?: string;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  state?: string;
  city?: string;
  country?: string;
  age?: number;
  passportType?: string;
  leadSource?: string;
  jobApplied?: string;
  status: string;
  assignedTo: number | null;
  assignedToName?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
  salesDocument?: {
    fileId: string;
    fileName: string;
    uploadedAt: string;
    uploadedByName?: string;
  };
}

export default function CaseManagerLeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReassign, setShowReassign] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.role !== "case_manager" && data.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      setUser({ id: data.id, name: data.name, email: data.email, role: data.role });
      fetchLead();
    } catch (err) {
      console.error(err);
      router.push("/");
    }
  };

  const fetchLead = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      const data = await res.json();
      if (res.ok) {
        setLead(data.lead);
      } else {
        toast.error(data.message || "Failed to load lead");
        router.push("/dashboard/case-leads");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (
      !window.confirm(
        `Are you sure you want to delete "${lead.name || "this lead"}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Lead deleted successfully");
        router.push("/dashboard/case-leads");
      } else {
        toast.error(data.message || "Failed to delete lead");
        setDeleting(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      setDeleting(false);
    }
  };

  const field = (label: string, value?: string | number | null) => (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100">{value || "-"}</p>
    </div>
  );

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {user && <DashboardNavbar user={user} />}
        <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8 px-4">
          <p className="text-gray-600 dark:text-gray-400 py-6">
            Loading lead details...
          </p>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-2 font-medium transition cursor-pointer"
        >
          <svg
            className="w-5 h-5"
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
          Back to Lead
        </button>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-6 gap-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{lead.name}</h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 uppercase">
                {lead.status}
              </span>
              {user.role === "admin" && (
                <>
                  <button
                    onClick={() => setShowEdit(true)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setShowReassign(true)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300"
                  >
                    Reassign
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {field("Phone", lead.phone)}
            {field("Email", lead.email)}
            {field("Country", lead.country)}
            {field("State / City", [lead.state, lead.city].filter(Boolean).join(", "))}
            {field("Age", lead.age)}
            {field("Passport Type", lead.passportType)}
            {field("Job Applied", lead.jobApplied)}
            {field("Lead Source", lead.leadSource)}
            {field("Case Manager", lead.assignedToName)}
            {field("Created By", lead.createdByName)}
            {field("Created On", new Date(lead.createdAt).toLocaleString("en-IN"))}
            {field("Last Updated", new Date(lead.updatedAt).toLocaleString("en-IN"))}
          </div>

          {/* Document */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Signed Document
            </p>
            {lead.salesDocument?.fileId ? (
              <a
                href={`/api/leads/${lead.id}/document`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                View PDF — {lead.salesDocument.fileName}
              </a>
            ) : (
              <p className="text-sm text-gray-500">No document uploaded.</p>
            )}
          </div>
        </div>

        {/* Audit trail */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">
            History &amp; Audit Trail
          </h2>
          {!lead.history?.length ? (
            <p className="text-sm text-gray-500">No history recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {[...lead.history]
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                )
                .map((h, idx) => (
                  <li key={idx} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                    <p className="text-gray-900 dark:text-gray-100">
                      {h.details || h.action}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {h.performedByName} · {new Date(h.timestamp).toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </main>

      {showReassign && (
        <CaseLeadReassignModal
          lead={{
            id: lead.id,
            name: lead.name,
            assignedTo: lead.assignedTo,
            assignedToName: lead.assignedToName,
          }}
          onClose={() => setShowReassign(false)}
          onReassigned={() => {
            setShowReassign(false);
            fetchLead();
          }}
        />
      )}

      {showEdit && (
        <CaseLeadEditModal
          lead={lead}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            fetchLead();
          }}
        />
      )}
    </div>
  );
}
