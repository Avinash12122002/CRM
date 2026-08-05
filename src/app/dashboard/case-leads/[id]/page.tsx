"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import CaseLeadReassignModal from "@/components/CaseLeadReassignModal";
import CaseLeadEditModal from "@/components/CaseLeadEditModal";
import CaseMarketingWorkspace from "@/components/CaseMarketingWorkspace";
import type { MarketingSummary } from "@/lib/caseMarketing";

interface User {
  id: number;
  name: string;
  email?: string;
  role:
    | "admin"
    | "telecaller"
    | "employee"
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
  caseManagerAssignedAt?: string | null;
  history: HistoryEntry[];
  occupations?: string[];
  caseManagerEmail?: string;
  caseManagerPassword?: string;
  candidateEmail?: string;
  candidatePassword?: string;
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
  const [activePhase, setActivePhase] = useState<number>(1);
  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(null);

  const [caseManagerEmailInput, setCaseManagerEmailInput] = useState("");
  const [caseManagerPasswordInput, setCaseManagerPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

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

  const fetchLead = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const res = await fetch(`/api/case-manager/leads/${leadId}`);
      const data = await res.json();
      if (res.ok) {
        setLead(data.lead);
        setCaseManagerEmailInput(data.lead.caseManagerEmail || data.lead.candidateEmail || "");
        setCaseManagerPasswordInput(data.lead.caseManagerPassword || data.lead.candidatePassword || "");
      } else {
        toast.error(data.message || "Failed to load lead");
        router.push("/dashboard/case-leads");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    setSavingCredentials(true);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseManagerEmail: caseManagerEmailInput,
          caseManagerPassword: caseManagerPasswordInput,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Case Manager Email & Password saved successfully!");
        if (lead) {
          setLead({
            ...lead,
            caseManagerEmail: data.caseManagerEmail,
            caseManagerPassword: data.caseManagerPassword,
          });
        }
      } else {
        toast.error(data.message || "Failed to save credentials");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong saving credentials");
    } finally {
      setSavingCredentials(false);
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            {field("Assigned On", new Date(lead.caseManagerAssignedAt || lead.createdAt).toLocaleString("en-IN"))}
            {field("Created On", new Date(lead.createdAt).toLocaleString("en-IN"))}
            {field("Last Updated", new Date(lead.updatedAt).toLocaleString("en-IN"))}
          </div>

          {/* Document & Compact Marketing Stats */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Signed Document */}
              <div className="flex items-center gap-2 shrink-0 border-r border-gray-200 dark:border-gray-800 pr-3">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  CV :
                </span>
                {lead.salesDocument?.fileId ? (
                  <a
                    href={`/api/leads/${lead.id}/document`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition shadow-2xs"
                  >
                    View PDF
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">None</span>
                )}
              </div>

              {/* All 8 Workspace Values as Small Compact Pills in Same Row */}
              {marketingSummary && (
                <div className="flex flex-wrap items-center gap-1.5 flex-1">
                  {[
                    { label: "Employers", value: marketingSummary.totalEmployers },
                    { label: "Emails", value: marketingSummary.initialEmailsSent },
                    { label: "Follow-ups", value: marketingSummary.followupsDueToday, alert: marketingSummary.followupsDueToday > 0 },
                    { label: "Interviews", value: marketingSummary.interviewsScheduled },
                    { label: "Replies", value: marketingSummary.totalReplies },
                    { label: "Interested", value: marketingSummary.interestedEmployers },
                    { label: "Response", value: `${marketingSummary.averageResponseRate}%` },
                    { label: "Completion", value: `${marketingSummary.completionPercent}%` },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs transition ${
                        stat.alert
                          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 font-bold"
                          : "border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {stat.label}:
                      </span>
                      <span className="font-extrabold text-gray-900 dark:text-gray-100">
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Candidate Occupations — Displayed directly below the View PDF section */}
            {lead.occupations && lead.occupations.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800/60">
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Candidate Occupations:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {lead.occupations.map((occ, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                    >
                      💼 {occ}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Case Manager Email & Password — Displayed directly below Occupations */}
            <div className="pt-2.5 border-t border-gray-100 dark:border-gray-800/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    🔑 Case Manager Email &amp; Password (Used to send mails):
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800/60">
                    Visible to Case Manager &amp; Admin
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={savingCredentials}
                  className="px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  {savingCredentials ? "Saving..." : "💾 Save Credentials"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50/80 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-200/80 dark:border-gray-800">
                {/* Case Manager Email Field */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1 uppercase tracking-wider">
                    Case Manager Email
                  </label>
                  <input
                    type="email"
                    placeholder="Enter email used to send mails..."
                    value={caseManagerEmailInput}
                    onChange={(e) => setCaseManagerEmailInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Case Manager Password Field with Show/Hide toggle */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1 uppercase tracking-wider">
                    Case Manager Password
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password used to send mails..."
                      value={caseManagerPasswordInput}
                      onChange={(e) => setCaseManagerPasswordInput(e.target.value)}
                      className="w-full px-3 py-1.5 pr-9 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CV Marketing Workspace */}
        <CaseMarketingWorkspace
          leadId={lead.id}
          canEdit={true}
          activePhase={activePhase}
          onPhaseChange={(phase: number) => setActivePhase(phase)}
          onHistoryUpdate={() => fetchLead(false)}
          onSummaryLoaded={(s) => setMarketingSummary(s)}
        />
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
