"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import { INDUSTRIES, LEAD_SOURCES } from "@/lib/bd/constants";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting" | "business_development";
};

type BDLead = {
  id: number;
  industry: string;
  companyName: string;
  email: string;
  website?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  decisionMakerName?: string | null;
  decisionMakerPosition?: string | null;
  phoneNumber: string;
  country?: string | null;
  address?: string | null;
  leadSource?: string | null;
  leadSourceOther?: string | null;
  remarks?: string | null;
  priority: "High" | "Medium" | "Low" | null;
  pipelineStage: string;
  status: "active" | "deal_done" | "lost";
  locked: boolean;
  assignedTo: number;
  assignedToName: string;
  createdByName: string;
  createdAt: string;
};

type HistoryEntry = {
  id: number;
  fromStage: string | null;
  toStage: string;
  note: string;
  changedByName: string;
  changedAt: string;
};

type NoteEntry = {
  id: number;
  note: string;
  createdByName: string;
  createdAt: string;
};

const STAGES = [
  "New Lead",
  "Research Started",
  "Priority Set",
  "Initial Contact",
  "Response Received",
  "Meeting Scheduled",
  "Follow Up",
  "Deal Done",
];

const PRIORITIES = ["High", "Medium", "Low"];
const SELECTED_LEAD_KEY = "selectedBDLeadId";

export default function BDLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [lead, setLead] = useState<BDLead | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editForm, setEditForm] = useState({
    industry: "",
    country: "",
    website: "",
    companyName: "",
    email: "",
    phoneNumber: "",
    decisionMakerName: "",
    decisionMakerPosition: "",
    leadSource: "",
    leadSourceOther: "",
    address: "",
    linkedin: "",
    instagram: "",
    facebook: "",
    remarks: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveNote, setMoveNote] = useState("");
  const [movePriority, setMovePriority] = useState("");
  const [moving, setMoving] = useState(false);

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [markingLost, setMarkingLost] = useState(false);

  // Where "Back" and post-action redirects should land. Admins reach this
  // page from the BD Leads list (there's no BD Pipeline nav for them), so send
  // them back there instead of to /dashboard/bd-pipeline.
  const listPath = () =>
    user?.role === "admin" ? "/dashboard/bd-leads" : "/dashboard/bd-pipeline";

  const load = useCallback(async () => {
    const res = await fetch(`/api/bd/leads/${id}`);
    if (!res.ok) {
      toast.error("Lead not found or access denied");
      router.push(listPath());
      return;
    }
    const data = await res.json();
    setLead(data.lead);
    setHistory(data.history || []);
    setNotes(data.notes || []);
    setCanEdit(data.canEdit);
    setEditForm({
      industry: data.lead.industry || "",
      country: data.lead.country || "",
      website: data.lead.website || "",
      companyName: data.lead.companyName || "",
      email: data.lead.email || "",
      phoneNumber: data.lead.phoneNumber || "",
      decisionMakerName: data.lead.decisionMakerName || "",
      decisionMakerPosition: data.lead.decisionMakerPosition || "",
      leadSource: data.lead.leadSource || "",
      leadSourceOther: data.lead.leadSourceOther || "",
      address: data.lead.address || "",
      linkedin: data.lead.linkedin || "",
      instagram: data.lead.instagram || "",
      facebook: data.lead.facebook || "",
      remarks: data.lead.remarks || "",
    });
    // listPath intentionally omitted — the error redirect it powers is a rare
    // path and we don't want load() re-created on every user change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const me = await res.json();
        if (!["business_development", "admin"].includes(me.role)) {
          router.push("/dashboard");
          return;
        }
        setUser(me);
        await load();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSaveEdit = async () => {
    if (!editForm.industry.trim() || !editForm.country.trim() || !editForm.website.trim()) {
      toast.error("Industry, Country and Website are required");
      return;
    }
    if (editForm.leadSource === "Job Portals" && !editForm.leadSourceOther.trim()) {
      toast.error("Please enter the job portal name");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/bd/leads/${id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to save changes");
        return;
      }
      toast.success("Lead updated");
      load();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      toast.error("Note cannot be empty");
      return;
    }
    setAddingNote(true);
    try {
      const res = await fetch(`/api/bd/leads/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to add note");
        return;
      }
      setNoteText("");
      load();
    } catch {
      toast.error("Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  const nextStage = lead ? STAGES[STAGES.indexOf(lead.pipelineStage) + 1] : null;

  const handleMoveForward = async () => {
    if (!moveNote.trim()) {
      toast.error("A note is required to move this lead forward");
      return;
    }
    if (nextStage === "Priority Set" && !movePriority) {
      toast.error("Select a priority (High / Medium / Low)");
      return;
    }
    setMoving(true);
    try {
      const res = await fetch(`/api/bd/leads/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: moveNote, priority: movePriority || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to move lead");
        return;
      }
      toast.success(data.message);
      setShowMoveModal(false);
      setMoveNote("");
      setMovePriority("");

      if (nextStage === "Deal Done") {
        sessionStorage.setItem(SELECTED_LEAD_KEY, String(id));
        router.push(listPath());
        return;
      }
      load();
    } catch {
      toast.error("Failed to move lead");
    } finally {
      setMoving(false);
    }
  };

  const handleMarkLost = async () => {
    if (!lostReason.trim()) {
      toast.error("A reason is required");
      return;
    }
    setMarkingLost(true);
    try {
      const res = await fetch(`/api/bd/leads/${id}/lost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: lostReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to mark lead as lost");
        return;
      }
      toast.success("Lead marked as lost");
      setShowLostModal(false);
      setLostReason("");
      sessionStorage.setItem(SELECTED_LEAD_KEY, String(id));
      router.push(listPath());
    } catch {
      toast.error("Failed to mark lead as lost");
    } finally {
      setMarkingLost(false);
    }
  };

  if (loading || !user || !lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back button */}
        <button
          onClick={() => {
            sessionStorage.setItem(SELECTED_LEAD_KEY, String(lead.id));
            router.push(listPath());
          }}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-2 font-medium transition cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {user?.role === "admin" ? "Back to BD Leads" : "Back to BD Pipeline"}
        </button>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{lead.companyName || "Unnamed Lead"}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lead.industry}
              </p>
            </div>
            <div className="flex gap-2">
              {lead.priority && (
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                  {lead.priority} Priority
                </span>
              )}
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full ${
                  lead.status === "deal_done"
                    ? "bg-green-100 text-green-800"
                    : lead.status === "lost"
                    ? "bg-red-100 text-red-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {lead.status === "lost" ? "Lead Lost" : lead.pipelineStage}
              </span>
            </div>
          </div>

          {(lead.status !== "active" || lead.locked) && (
            <div className="mt-4 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
              This lead is closed and owned by Admin. Read only.
            </div>
          )}
        </div>

        {/* Pipeline stepper */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Pipeline</h2>
            {lead.status !== "lost" && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Stage {Math.min(STAGES.indexOf(lead.pipelineStage) + 1, STAGES.length)} of {STAGES.length}
              </span>
            )}
          </div>

          {lead.status === "lost" ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-3 mb-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-sm">
                ✕
              </span>
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Lead Lost</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/70">
                  This lead exited the pipeline and is now owned by Admin.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-2 -mx-1 overflow-x-auto pb-2">
              <div className="flex items-center min-w-max px-1">
                {STAGES.map((stage, i) => {
                  const currentIndex = STAGES.indexOf(lead.pipelineStage);
                  const done = i < currentIndex;
                  const current = i === currentIndex;
                  const upcoming = i > currentIndex;
                  return (
                    <div key={stage} className="flex items-center">
                      <div className="flex flex-col items-center w-[104px]">
                        <div
                          className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold shadow-sm transition-all ${
                            done
                              ? "bg-blue-600 text-white"
                              : current
                              ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40 scale-110"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                          {current && (
                            <span className="absolute -bottom-1.5 h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                          )}
                        </div>
                        <p
                          className={`mt-2 text-center text-[11px] leading-tight font-medium ${
                            upcoming
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-gray-800 dark:text-gray-100"
                          }`}
                        >
                          {stage}
                        </p>
                      </div>
                      {i < STAGES.length - 1 && (
                        <svg
                          width="28"
                          height="12"
                          viewBox="0 0 28 12"
                          fill="none"
                          className="mb-5 shrink-0"
                        >
                          <line
                            x1="0"
                            y1="6"
                            x2="20"
                            y2="6"
                            stroke={done ? "#2563eb" : "#d4d4d8"}
                            strokeWidth="2"
                            className="dark:opacity-60"
                          />
                          <path
                            d="M18 1L25 6L18 11"
                            stroke={done ? "#2563eb" : "#d4d4d8"}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="dark:opacity-60"
                          />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {canEdit && lead.status === "active" && nextStage && (
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setShowMoveModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Move to &quot;{nextStage}&quot;
                <span aria-hidden>→</span>
              </button>
              <button
                onClick={() => setShowLostModal(true)}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-700 dark:text-red-400 dark:border-red-800 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Lead Lost
              </button>
            </div>
          )}
        </div>

        {/* Editable lead details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Lead Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Industry *" value={lead.industry || "—"} editable={canEdit}>
              <select
                value={editForm.industry}
                onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </ReadOnlyField>
            <ReadOnlyField label="Country *" value={lead.country || "—"} editable={canEdit}>
              <input
                value={editForm.country}
                onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Website *" value={lead.website || "—"} editable={canEdit}>
              <input
                value={editForm.website}
                onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Company Name" value={lead.companyName || "—"} editable={canEdit}>
              <input
                value={editForm.companyName}
                onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Email" value={lead.email || "—"} editable={canEdit}>
              <input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Phone Number" value={lead.phoneNumber || "—"} editable={canEdit}>
              <input
                value={editForm.phoneNumber}
                onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Decision Maker Name" value={lead.decisionMakerName || "—"} editable={canEdit}>
              <input
                value={editForm.decisionMakerName}
                onChange={(e) => setEditForm({ ...editForm, decisionMakerName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Decision Maker Position" value={lead.decisionMakerPosition || "—"} editable={canEdit}>
              <input
                value={editForm.decisionMakerPosition}
                onChange={(e) => setEditForm({ ...editForm, decisionMakerPosition: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField
              label="Lead Source"
              value={
                lead.leadSource
                  ? `${lead.leadSource}${
                      lead.leadSource === "Job Portals" && lead.leadSourceOther
                        ? ` (${lead.leadSourceOther})`
                        : ""
                    }`
                  : "—"
              }
              editable={canEdit}
            >
              <div className="space-y-2">
                <select
                  value={editForm.leadSource}
                  onChange={(e) => setEditForm({ ...editForm, leadSource: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                >
                  <option value="">Select lead source</option>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {editForm.leadSource === "Job Portals" && (
                  <input
                    value={editForm.leadSourceOther}
                    onChange={(e) => setEditForm({ ...editForm, leadSourceOther: e.target.value })}
                    placeholder="Job portal name *"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                )}
              </div>
            </ReadOnlyField>
            <ReadOnlyField label="Address" value={lead.address || "—"} editable={canEdit}>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="LinkedIn" value={lead.linkedin || "—"} editable={canEdit}>
              <input
                value={editForm.linkedin}
                onChange={(e) => setEditForm({ ...editForm, linkedin: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Instagram" value={lead.instagram || "—"} editable={canEdit}>
              <input
                value={editForm.instagram}
                onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Facebook" value={lead.facebook || "—"} editable={canEdit}>
              <input
                value={editForm.facebook}
                onChange={(e) => setEditForm({ ...editForm, facebook: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <ReadOnlyField label="Remarks" value={lead.remarks || "—"} editable={canEdit}>
              <textarea
                value={editForm.remarks}
                onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </ReadOnlyField>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created By</p>
              <p className="text-sm text-gray-800 dark:text-gray-100 py-2">{lead.createdByName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Assigned To</p>
              <p className="text-sm text-gray-800 dark:text-gray-100 py-2">{lead.assignedToName}</p>
            </div>
          </div>

          {canEdit && (
            <button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="mt-4 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {savingEdit ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Notes</h2>

          {canEdit && (
            <div className="flex gap-2 mb-4">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote}
                className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}

          <div className="space-y-3">
            {notes.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No notes yet</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                  <p className="text-sm text-gray-800 dark:text-gray-100">{n.note}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {n.createdByName} · {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* History timeline (immutable) — newest first */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Timeline</h2>
          <div className="space-y-4">
            {[...history].reverse().map((h) => (
              <div key={h.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(h.changedAt).toLocaleDateString()}{" "}
                  {new Date(h.changedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {h.fromStage ? `${h.fromStage} → ${h.toStage}` : h.toStage}
                </p>
                {h.note && <p className="text-sm text-gray-600 dark:text-gray-400">{h.note}</p>}
                <p className="text-xs text-gray-400 dark:text-gray-500">by {h.changedByName}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Move stage modal */}
      {showMoveModal && (
        <Modal onClose={() => setShowMoveModal(false)} title={`Move to "${nextStage}"`}>
          {nextStage === "Priority Set" && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Priority</label>
              <select
                value={movePriority}
                onChange={(e) => setMovePriority(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              >
                <option value="">Select priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Note (required)
          </label>
          <textarea
            value={moveNote}
            onChange={(e) => setMoveNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
            placeholder="e.g. Called client. Client requested callback tomorrow."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowMoveModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleMoveForward}
              disabled={moving}
              className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {moving ? "Moving..." : "Confirm"}
            </button>
          </div>
        </Modal>
      )}

      {/* Lead lost modal */}
      {showLostModal && (
        <Modal onClose={() => setShowLostModal(false)} title="Mark Lead as Lost">
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Reason (required)
          </label>
          <textarea
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
            placeholder="e.g. Client went with a competitor."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowLostModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleMarkLost}
              disabled={markingLost}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {markingLost ? "Saving..." : "Confirm Lost"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  editable,
  children,
}: {
  label: string;
  value: string;
  editable: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      {editable ? children : <p className="text-sm text-gray-800 dark:text-gray-100 py-2">{value}</p>}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}