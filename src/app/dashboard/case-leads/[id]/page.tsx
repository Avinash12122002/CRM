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
    | "case_manager"
    | "wm"
    | "wcm"
    | "wtc"
    | "supervisor";
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

  const [showOccupationEdit, setShowOccupationEdit] = useState(false);
  const [editOccupations, setEditOccupations] = useState<string[]>([]);
  const [savingOccupations, setSavingOccupations] = useState(false);

  const [showPdfReuploadModal, setShowPdfReuploadModal] = useState(false);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const handlePdfReupload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reuploadFile) {
      toast.error("Please choose a PDF file to upload");
      return;
    }

    const MAX_FILE_SIZE = 4.5 * 1024 * 1024;
    if (reuploadFile.size > MAX_FILE_SIZE) {
      toast.error(
        `File size (${(reuploadFile.size / (1024 * 1024)).toFixed(1)}MB) exceeds limit of 4.5MB. Please choose a compressed PDF.`,
      );
      return;
    }

    setUploadingPdf(true);
    try {
      const safeFileName = reuploadFile.name.replace(/['"\\/]/g, "_");
      const safeFile = new File([reuploadFile], safeFileName, {
        type: reuploadFile.type || "application/pdf",
      });

      const formData = new FormData();
      formData.append("file", safeFile);

      const res = await fetch(`/api/case-manager/leads/${leadId}/document`, {
        method: "PUT",
        body: formData,
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { message: `Server error (${res.status})` };
      }

      if (res.ok) {
        toast.success("PDF document updated successfully!");
        setLead((prev) =>
          prev
            ? {
                ...prev,
                salesDocument: data.salesDocument || {
                  fileId: data.fileId || "updated",
                  fileName: safeFileName,
                  uploadedAt: new Date().toISOString(),
                },
              }
            : prev,
        );
        setShowPdfReuploadModal(false);
        setReuploadFile(null);
      } else {
        toast.error(data.message || "Failed to upload PDF");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong uploading PDF");
    } finally {
      setUploadingPdf(false);
    }
  };

  const [deletingPdf, setDeletingPdf] = useState(false);

  const handleDeletePdf = async () => {
    if (!lead || !lead.salesDocument?.fileId) return;
    if (
      !window.confirm(
        "Are you sure you want to delete this PDF document? The file will be removed.",
      )
    ) {
      return;
    }

    setDeletingPdf(true);
    try {
      const res = await fetch(`/api/case-manager/leads/${lead.id}/document`, {
        method: "DELETE",
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { message: `Server error (${res.status})` };
      }

      if (res.ok) {
        toast.success("PDF document deleted successfully!");
        setLead((prev) => (prev ? { ...prev, salesDocument: undefined } : prev));
      } else {
        toast.error(data.message || "Failed to delete PDF");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong deleting PDF");
    } finally {
      setDeletingPdf(false);
    }
  };

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
      if (data.role !== "case_manager" && data.role !== "wcm" && data.role !== "admin") {
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

  const handleStartEditOccupations = () => {
    setEditOccupations(
      lead?.occupations && lead.occupations.length > 0 ? [...lead.occupations] : [""]
    );
    setShowOccupationEdit(true);
  };

  const handleAddOccupationInput = () => {
    setEditOccupations((prev) => [...prev, ""]);
  };

  const handleRemoveOccupationInput = (index: number) => {
    setEditOccupations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOccupationChange = (index: number, value: string) => {
    setEditOccupations((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSaveOccupations = async () => {
    const clean = editOccupations.map((o) => o.trim()).filter(Boolean);
    if (clean.length === 0) {
      toast.error("Please add at least one occupation");
      return;
    }
    setSavingOccupations(true);
    try {
      const res = await fetch(`/api/case-manager/leads/${leadId}/occupations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occupations: clean }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Occupations updated successfully!");
        setLead((prev) => (prev ? { ...prev, occupations: clean } : prev));
        setShowOccupationEdit(false);
      } else {
        toast.error(data.message || "Failed to update occupations");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong updating occupations");
    } finally {
      setSavingOccupations(false);
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
                  <>
                    <a
                      href={`/api/leads/${lead.id}/document?v=${lead.salesDocument?.fileId || Date.now()}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition shadow-2xs"
                    >
                      View PDF
                    </a>
                    {user?.role === "admin" && (
                      <button
                        onClick={handleDeletePdf}
                        disabled={deletingPdf}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition shadow-2xs cursor-pointer"
                        title="Delete candidate PDF document"
                      >
                        {deletingPdf ? "Deleting..." : "🗑️ Delete PDF"}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-400">None</span>
                    {user?.role === "admin" && (
                      <button
                        onClick={() => {
                          setReuploadFile(null);
                          setShowPdfReuploadModal(true);
                        }}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-2xs cursor-pointer"
                        title="Upload candidate PDF document"
                      >
                        + Upload PDF
                      </button>
                    )}
                  </>
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
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Candidate Occupations:
                  </span>
                  {user.role === "admin" && !showOccupationEdit && (
                    <button
                      type="button"
                      onClick={handleStartEditOccupations}
                      className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition cursor-pointer"
                    >
                      {lead.occupations && lead.occupations.length > 0 ? "✏️ Edit Occupations" : "+ Add Occupation"}
                    </button>
                  )}
                </div>
                {user.role === "admin" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800/60">
                    Admin Editable
                  </span>
                )}
              </div>

              {showOccupationEdit ? (
                <div className="bg-purple-50/50 dark:bg-purple-950/20 p-3 rounded-lg border border-purple-200 dark:border-purple-900/60 mt-1">
                  <p className="text-xs text-purple-900 dark:text-purple-300 font-medium mb-2">
                    Add or update candidate occupations (Admin only):
                  </p>
                  <div className="space-y-2 mb-3">
                    {editOccupations.map((occ, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={occ}
                          onChange={(e) => handleOccupationChange(idx, e.target.value)}
                          placeholder="e.g. Registered Nurse, Aged Care Worker"
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        {editOccupations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOccupationInput(idx)}
                            className="p-1.5 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition"
                            title="Remove occupation"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleAddOccupationInput}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 hover:bg-purple-100/50 transition cursor-pointer"
                    >
                      + Add More Occupation
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowOccupationEdit(false)}
                        disabled={savingOccupations}
                        className="px-3 py-1 text-xs font-semibold rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 transition cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveOccupations}
                        disabled={savingOccupations}
                        className="px-3 py-1 text-xs font-semibold rounded bg-purple-600 hover:bg-purple-700 text-white transition cursor-pointer disabled:opacity-50"
                      >
                        {savingOccupations ? "Saving..." : "💾 Save Occupations"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-row flex-nowrap items-center gap-1.5 mt-1 whitespace-nowrap overflow-x-auto">
                  {lead.occupations && lead.occupations.length > 0 ? (
                    lead.occupations.map((occ, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center shrink-0 px-2.5 py-0.5 text-xs font-semibold rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 whitespace-nowrap"
                      >
                        💼 {occ}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs italic text-gray-400">
                      No occupations added yet {user.role === "admin" ? "(Click '+ Add Occupation' above to add)" : ""}
                    </span>
                  )}
                </div>
              )}
            </div>

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
          occupations={lead.occupations || []}
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

      {/* Admin Re-upload PDF Modal */}
      {showPdfReuploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Re-upload Candidate PDF / Resume
              </h3>
              <button
                onClick={() => setShowPdfReuploadModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handlePdfReupload} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Select New Signed PDF / Resume *
                </label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setReuploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-zinc-700 dark:text-zinc-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-zinc-800 dark:file:text-zinc-200"
                  required
                />
                {reuploadFile && (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Selected: {reuploadFile.name} ({(reuploadFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowPdfReuploadModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingPdf || !reuploadFile}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-md transition shadow-2xs cursor-pointer"
                >
                  {uploadingPdf ? "Uploading..." : "Upload & Update PDF"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
