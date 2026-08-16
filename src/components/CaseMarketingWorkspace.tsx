"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  PHASES,
  STATUS_OPTIONS,
  getFollowupInfo,
  isTerminalStatus,
  type MarketingSummary,
} from "@/lib/caseMarketing";

interface MarketingSource {
  id: number;
  leadId: number;
  phase: number;
  name: string;
  order: number;
  status: "pending" | "active" | "completed";
  createdByName?: string;
  completedByName?: string;
}

interface MarketingEmployer {
  id: number;
  leadId: number;
  phase: number;
  sourceId: number;
  sourceName: string;
  companyName: string;
  occupation?: string;
  website?: string;
  jobUrl?: string;
  hrEmail?: string;
  generalEmail?: string;
  contactPerson?: string;
  phone?: string;
  city?: string;
  state?: string;
  notes?: string;
  emailSent: boolean;
  emailSentAt?: string;
  templateUsed?: string;
  mailboxUsed?: string;
  status?: string | null;
  statusNotes?: string | null;
  statusUpdatedAt?: string;
  statusUpdatedByName?: string;
  lastFollowupAt?: string;
  followupCount?: number;
  createdAt: string;
  createdByName?: string;
}

const EMPLOYER_FIELD_DEFS: { key: keyof MarketingEmployer; label: string; required?: boolean }[] = [
  { key: "companyName", label: "Company Name", required: true },
  { key: "website", label: "Website", required: true },
  { key: "jobUrl", label: "Job Advertisement URL", required: true },
  { key: "occupation", label: "Occupation" },
  { key: "hrEmail", label: "HR Email" },
  { key: "generalEmail", label: "General Email" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "notes", label: "Notes" },
];

const emptyEmployerForm = (defaultOccupation = "") =>
  EMPLOYER_FIELD_DEFS.reduce(
    (acc, f) => ({ ...acc, [f.key]: f.key === "occupation" ? defaultOccupation : "" }),
    {} as Record<string, string>
  );

const normalizeUrl = (url: string) =>
  url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "").trim();

export default function CaseMarketingWorkspace({
  leadId,
  occupations = [],
  canEdit,
  onHistoryUpdate,
  activePhase: externalActivePhase,
  onPhaseChange,
  onSummaryLoaded,
}: {
  leadId: number;
  occupations?: string[];
  canEdit: boolean;
  onHistoryUpdate?: () => void;
  activePhase?: number;
  onPhaseChange?: (phase: number) => void;
  onSummaryLoaded?: (summary: MarketingSummary) => void;
}) {
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [internalActivePhase, setInternalActivePhase] = useState<number>(1);
  const activePhase = externalActivePhase ?? internalActivePhase;

  const changePhase = (phase: number) => {
    setInternalActivePhase(phase);
    onPhaseChange?.(phase);
  };

  const [sources, setSources] = useState<MarketingSource[]>([]);
  const [employers, setEmployers] = useState<MarketingEmployer[]>([]);
  const [allLeadEmployers, setAllLeadEmployers] = useState<MarketingEmployer[]>([]);
  const [loadingPhase, setLoadingPhase] = useState(false);

  // ── Filters state for Step 3 Employers Table ──
  const [filterSourceId, setFilterSourceId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWebsite, setFilterWebsite] = useState("");
  const [filterCompanyName, setFilterCompanyName] = useState("");
  const [filterOccupation, setFilterOccupation] = useState("");
  const [filterEmails, setFilterEmails] = useState("");
  const [filterContactPerson, setFilterContactPerson] = useState("");
  const [filterPhone, setFilterPhone] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");

  // ── Pagination State for Employers Table ──
  const [empPage, setEmpPage] = useState<number>(1);
  const [empLimit, setEmpLimit] = useState<number>(10);

  // Reset page when active phase or filters change
  useEffect(() => {
    setEmpPage(1);
  }, [
    activePhase,
    filterSourceId,
    filterStatus,
    filterWebsite,
    filterCompanyName,
    filterOccupation,
    filterEmails,
    filterContactPerson,
    filterPhone,
    filterCity,
    filterState,
  ]);

  const hasActiveFilters =
    Boolean(filterSourceId) ||
    Boolean(filterStatus) ||
    Boolean(filterWebsite) ||
    Boolean(filterCompanyName) ||
    Boolean(filterOccupation) ||
    Boolean(filterEmails) ||
    Boolean(filterContactPerson) ||
    Boolean(filterPhone) ||
    Boolean(filterCity) ||
    Boolean(filterState);

  const clearAllFilters = () => {
    setFilterSourceId("");
    setFilterStatus("");
    setFilterWebsite("");
    setFilterCompanyName("");
    setFilterOccupation("");
    setFilterEmails("");
    setFilterContactPerson("");
    setFilterPhone("");
    setFilterCity("");
    setFilterState("");
  };

  const filteredEmployers = employers.filter((emp) => {
    if (filterSourceId && String(emp.sourceId) !== filterSourceId) return false;

    // Filter by table occupation column filter
    if (filterOccupation) {
      if (filterOccupation === "__unspecified__") {
        if (emp.occupation && emp.occupation.trim().length > 0) return false;
      } else if ((emp.occupation || "").trim().toLowerCase() !== filterOccupation.trim().toLowerCase()) {
        return false;
      }
    }

    if (filterStatus) {
      if (filterStatus === "Email Sent" && !emp.emailSent) return false;
      if (filterStatus === "Not Emailed Yet" && emp.emailSent) return false;
      if (
        filterStatus !== "Email Sent" &&
        filterStatus !== "Not Emailed Yet" &&
        emp.status !== filterStatus
      ) {
        return false;
      }
    }
    if (
      filterWebsite &&
      !emp.website?.toLowerCase().includes(filterWebsite.toLowerCase().trim())
    ) {
      return false;
    }
    if (
      filterCompanyName &&
      !emp.companyName?.toLowerCase().includes(filterCompanyName.toLowerCase().trim())
    ) {
      return false;
    }
    if (filterEmails) {
      const q = filterEmails.toLowerCase().trim();
      const matchHr = emp.hrEmail?.toLowerCase().includes(q);
      const matchGeneral = emp.generalEmail?.toLowerCase().includes(q);
      if (!matchHr && !matchGeneral) return false;
    }
    if (
      filterContactPerson &&
      !emp.contactPerson?.toLowerCase().includes(filterContactPerson.toLowerCase().trim())
    ) {
      return false;
    }
    if (filterPhone && !emp.phone?.toLowerCase().includes(filterPhone.toLowerCase().trim())) {
      return false;
    }
    if (filterCity && !emp.city?.toLowerCase().includes(filterCity.toLowerCase().trim())) {
      return false;
    }
    if (filterState && !emp.state?.toLowerCase().includes(filterState.toLowerCase().trim())) {
      return false;
    }
    return true;
  });

  const empTotal = filteredEmployers.length;
  const empTotalPages = Math.ceil(empTotal / empLimit) || 1;
  const paginatedEmployers = filteredEmployers.slice((empPage - 1) * empLimit, empPage * empLimit);

  const [addSourceText, setAddSourceText] = useState("");
  const [savingSource, setSavingSource] = useState(false);

  // Track if user clicked "Done Adding Job Boards" per phase
  const [step1FinishedMap, setStep1FinishedMap] = useState<Record<number, boolean>>({});

  const [showEmployerForm, setShowEmployerForm] = useState(true);
  const [employerForm, setEmployerForm] = useState(emptyEmployerForm());
  const [savingEmployer, setSavingEmployer] = useState(false);

  const [viewDetailsEmployer, setViewDetailsEmployer] = useState<MarketingEmployer | null>(null);
  const [editEmployerModal, setEditEmployerModal] = useState<MarketingEmployer | null>(null);
  const [editEmployerForm, setEditEmployerForm] = useState<Record<string, string>>({});
  const [savingEditEmployer, setSavingEditEmployer] = useState(false);

  const handleOpenEditEmployer = (emp: MarketingEmployer) => {
    setEditEmployerModal(emp);
    setEditEmployerForm({
      companyName: emp.companyName || "",
      occupation: emp.occupation || "",
      website: emp.website || "",
      jobUrl: emp.jobUrl || "",
      hrEmail: emp.hrEmail || "",
      generalEmail: emp.generalEmail || "",
      contactPerson: emp.contactPerson || "",
      phone: emp.phone || "",
      city: emp.city || "",
      state: emp.state || "",
      notes: emp.notes || "",
    });
  };

  const handleSaveEditEmployer = async () => {
    if (!editEmployerModal) return;
    if (!editEmployerForm.companyName?.trim() || !editEmployerForm.website?.trim() || !editEmployerForm.jobUrl?.trim()) {
      toast.error("Company Name, Website, and Job Link are required");
      return;
    }
    setSavingEditEmployer(true);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/employers/${editEmployerModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_details",
          ...editEmployerForm,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Employer details updated successfully!");
        setEditEmployerModal(null);
        if (viewDetailsEmployer?.id === editEmployerModal.id) {
          setViewDetailsEmployer(data.employer || null);
        }
        refreshAll();
      } else {
        toast.error(data.message || "Failed to update employer");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setSavingEditEmployer(false);
    }
  };


  const [statusModalEmployer, setStatusModalEmployer] = useState<MarketingEmployer | null>(null);
  const [statusValue, setStatusValue] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [busySourceId, setBusySourceId] = useState<number | null>(null);
  const [loggingFollowupEmpId, setLoggingFollowupEmpId] = useState<number | null>(null);

  const handleLogFollowupEmployer = async (employerId: number) => {
    setLoggingFollowupEmpId(employerId);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/employers/${employerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "log_followup" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Follow-up logged successfully!");
        refreshAll();
      } else {
        toast.error(data.message || "Failed to log follow-up");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoggingFollowupEmpId(null);
    }
  };

  const phaseConfig = PHASES.find((p) => p.phase === activePhase) || PHASES[0];
  const activeSource = sources.find((s) => s.status === "active") || null;
  const firstUnlocked = [...sources].sort((a, b) => a.order - b.order).find((s) => s.status !== "completed") || null;

  // ── Auto-save & Restore Employer Form Draft in LocalStorage ──
  const draftKey = activeSource
    ? `cm_employer_draft_lead_${leadId}_src_${activeSource.id}`
    : `cm_employer_draft_lead_${leadId}_phase_${activePhase}`;

  // Restore saved draft on load or source change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setEmployerForm(parsed);
          return;
        }
      } catch (err) {
        console.error("Failed to parse employer draft", err);
      }
    }
    setEmployerForm(emptyEmployerForm());
  }, [draftKey]);

  // Auto-save draft on form input change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasContent = Object.values(employerForm).some(
      (val) => val && String(val).trim() !== ""
    );
    if (hasContent) {
      localStorage.setItem(draftKey, JSON.stringify(employerForm));
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [employerForm, draftKey]);

  // Prevent accidental tab closure if unsaved text exists
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasContent = Object.values(employerForm).some(
        (val) => val && String(val).trim() !== ""
      );
      if (hasContent) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [employerForm]);

  const isDraftRestored = Object.values(employerForm).some(
    (v) => v && String(v).trim() !== ""
  );

  const handleToggleOrCancelEmployerForm = () => {
    if (showEmployerForm) {
      if (isDraftRestored) {
        if (!window.confirm("Discard unsaved employer data?")) return;
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(draftKey);
      }
      setEmployerForm(emptyEmployerForm());
      setShowEmployerForm(false);
    } else {
      setShowEmployerForm(true);
    }
  };

  // ── Phase locking: phase N is accessible only when phase N-1 is fully complete ──
  // Build completion map: for the active phase use live sources data (most up-to-date).
  // For all other phases use the phaseCompletionStatus from the summary API,
  // which is authoritative since it is computed across ALL phases' sources.
  const phaseCompletionMap: Record<number, boolean> = {};
  PHASES.forEach((p) => {
    if (p.phase === activePhase) {
      // Live: a phase is complete ONLY if all job boards are completed AND at least 1 employer exists AND all employers have emailSent === true
      const allSourcesDone = sources.length > 0 && sources.every((s) => s.status === "completed");
      const allEmailsSent = employers.length > 0 && employers.every((e) => e.emailSent === true);
      phaseCompletionMap[p.phase] = allSourcesDone && allEmailsSent;
    } else {
      // Other phases: use the pre-computed status from summary
      phaseCompletionMap[p.phase] = summary?.phaseCompletionStatus?.[p.phase] ?? false;
    }
  });

  const isPhaseComplete = (phase: number): boolean =>
    phaseCompletionMap[phase] === true;

  const isPhaseAccessible = (phase: number): boolean => {
    if (phase === 1) return true;
    if (phase === activePhase) return true; // Currently active phase is ALWAYS accessible while working in it
    return isPhaseComplete(phase - 1);
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/summary`);
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary);
        onSummaryLoaded?.(data.summary);
      }
    } catch (err) {
      console.error(err);
    }
  }, [leadId, onSummaryLoaded]);

  const fetchPhaseData = useCallback(
    async (phase: number) => {
      setLoadingPhase(true);
      try {
        const [sourcesRes, employersRes] = await Promise.all([
          fetch(`/api/case-marketing/${leadId}/sources?phase=${phase}`),
          fetch(`/api/case-marketing/${leadId}/employers?phase=${phase}`),
        ]);
        const sourcesData = await sourcesRes.json();
        const employersData = await employersRes.json();
        if (sourcesRes.ok) setSources(sourcesData.sources || []);
        if (employersRes.ok) setEmployers(employersData.employers || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPhase(false);
      }
    },
    [leadId],
  );

  const fetchAllEmployers = useCallback(async () => {
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/employers`);
      const data = await res.json();
      if (res.ok) setAllLeadEmployers(data.employers || []);
    } catch (err) {
      console.error(err);
    }
  }, [leadId]);

  useEffect(() => {
    fetchSummary();
    fetchAllEmployers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    fetchPhaseData(activePhase);
  }, [activePhase, fetchPhaseData]);

  const refreshAll = () => {
    fetchSummary();
    fetchPhaseData(activePhase);
    fetchAllEmployers();
    onHistoryUpdate?.();
  };

  const handleAddSources = async () => {
    const names = addSourceText
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) {
      toast.error(`Enter at least one ${phaseConfig.sourceLabel.toLowerCase()}`);
      return;
    }
    setSavingSource(true);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: activePhase, names }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${phaseConfig.sourceLabelPlural} saved`);
        setAddSourceText("");
        refreshAll();
      } else {
        toast.error(data.message || "Failed to save");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setSavingSource(false);
    }
  };

  const togglePreset = (name: string) => {
    const current = addSourceText
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (current.includes(name)) return;
    setAddSourceText(current.concat(name).join(", "));
  };

  const handleSelectSource = async (source: MarketingSource) => {
    setBusySourceId(source.id);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Research started on ${source.name}`);
        refreshAll();
      } else {
        toast.error(data.message || "Could not start this source");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setBusySourceId(null);
    }
  };

  const handleCompleteSource = async (source: MarketingSource) => {
    if (!window.confirm(`Mark "${source.name}" as complete? You can re-open it at any time.`)) return;
    setBusySourceId(source.id);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${source.name} completed`);
        refreshAll();
      } else {
        toast.error(data.message || "Could not complete this source");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setBusySourceId(null);
    }
  };

  const handleReopenSource = async (source: MarketingSource) => {
    setBusySourceId(source.id);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Re-opened research on ${source.name}`);
        refreshAll();
      } else {
        toast.error(data.message || "Could not re-open this source");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setBusySourceId(null);
    }
  };

  const handleFinishStep1 = async () => {
    if (sources.length === 0) {
      toast.error(`Add at least one ${phaseConfig.sourceLabel.toLowerCase()} first.`);
      return;
    }
    setStep1FinishedMap((prev) => ({ ...prev, [activePhase]: true }));
    toast.success(`Finished adding ${phaseConfig.sourceLabelPlural.toLowerCase()}. Now work through them one by one below.`);
    if (!activeSource && firstUnlocked) {
      await handleSelectSource(firstUnlocked);
    }
  };

  const handleAddEmployer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSource) return;
    if (!employerForm.companyName?.trim() || !employerForm.website?.trim() || !employerForm.jobUrl?.trim()) {
      toast.error("Company Name, Website, and Job Advertisement URL are required");
      return;
    }
    const normName = employerForm.companyName.trim().toLowerCase();
    const normWeb = normalizeUrl(employerForm.website);
    const normJob = normalizeUrl(employerForm.jobUrl);

    if (employers.some((emp) => (emp.companyName || "").trim().toLowerCase() === normName)) {
      toast.error("An employer with this company name has already been added!");
      return;
    }
    if (employers.some((emp) => normalizeUrl(emp.website || "") === normWeb)) {
      toast.error("This website has already been added for this candidate!");
      return;
    }
    if (employers.some((emp) => normalizeUrl(emp.jobUrl || "") === normJob)) {
      toast.error("This job advertisement URL has already been added for this candidate!");
      return;
    }

    setSavingEmployer(true);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/employers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: activeSource.id, ...employerForm }),
      });
      const data = await res.json();
      if (res.ok) {
        const currentScrollY = window.scrollY;
        toast.success("Employer saved — ready for next employer");
        if (typeof window !== "undefined") {
          localStorage.removeItem(draftKey);
        }
        setEmployerForm(emptyEmployerForm());
        setShowEmployerForm(true);
        refreshAll();
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY });
        });
      } else {
        toast.error(data.message || "Failed to save employer");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setSavingEmployer(false);
    }
  };

  const [markingEmailSentEmpId, setMarkingEmailSentEmpId] = useState<number | null>(null);

  const handleMarkEmailSentDirect = async (employerId: number, companyName: string) => {
    const currentScrollY = window.scrollY;
    setMarkingEmailSentEmpId(employerId);
    try {
      const res = await fetch(`/api/case-marketing/${leadId}/employers/${employerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email_sent" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Email marked as sent for ${companyName}`);
        refreshAll();
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY });
        });
      } else {
        toast.error(data.message || "Failed to update");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setMarkingEmailSentEmpId(null);
    }
  };

  const handleSaveStatus = async () => {
    if (!statusModalEmployer) return;
    if (!statusValue) {
      toast.error("Select a status");
      return;
    }
    if (!statusNotes.trim()) {
      toast.error("Notes are required");
      return;
    }
    setSavingStatus(true);
    try {
      const res = await fetch(
        `/api/case-marketing/${leadId}/employers/${statusModalEmployer.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status_update", status: statusValue, notes: statusNotes }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success("Status updated");
        setStatusModalEmployer(null);
        setStatusValue("");
        setStatusNotes("");
        refreshAll();
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setSavingStatus(false);
    }
  };

  const sourceBadge = (s: MarketingSource) => {
    if (s.status === "completed")
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">✓ Completed</span>;
    if (s.status === "active")
      return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">In Progress</span>;
    if (firstUnlocked && firstUnlocked.id === s.id)
      return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Ready</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">🔒 Locked</span>;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">CV Marketing Workspace</h2>

      {/* Phase tabs — locked until previous phase is fully complete */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-100 dark:border-gray-800 pb-3">
        {PHASES.map((p) => {
          const accessible = isPhaseAccessible(p.phase);
          const active = activePhase === p.phase;
          const completed = isPhaseComplete(p.phase);

          let buttonStyle = "bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-600 cursor-not-allowed opacity-60";
          if (active) {
            buttonStyle = "bg-red-600 text-white font-bold shadow-md hover:bg-red-700";
          } else if (completed) {
            buttonStyle = "bg-emerald-600 text-white font-bold shadow-md hover:bg-emerald-700";
          } else if (accessible) {
            buttonStyle = "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 font-medium";
          }

          return (
            <button
              key={p.phase}
              onClick={() => {
                if (accessible) {
                  changePhase(p.phase);
                }
              }}
              disabled={!accessible}
              title={
                !accessible
                  ? `Complete Phase ${p.phase - 1} first to unlock this phase`
                  : completed
                  ? `Phase ${p.phase} Completed ✓`
                  : undefined
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition ${buttonStyle}`}
            >
              {!accessible ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : completed ? (
                <span className="font-bold">✓</span>
              ) : null}
              Phase {p.phase} · {p.label}
            </button>
          );
        })}
      </div>

      {loadingPhase ? (
        <p className="text-sm text-gray-500 py-4">Loading...</p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-gray-500">{phaseConfig.description}</p>

          {/* Warning banner if all sources are completed but emails are still pending */}
          {sources.length > 0 &&
            sources.every((s) => s.status === "completed") &&
            (employers.length === 0 || employers.some((e) => !e.emailSent)) && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300 font-semibold shadow-xs">
                <span>⚠️ All {phaseConfig.sourceLabelPlural.toLowerCase()} for Phase {activePhase} are completed, but Phase {activePhase < 4 ? activePhase + 1 : activePhase} remains locked until initial emails are marked as sent for all jobs.</span>
              </div>
            )}

          {/* Step 1: add sources */}
          {canEdit && (() => {
            const isStep1Done = step1FinishedMap[activePhase] ?? sources.some((s) => s.status === "active" || s.status === "completed");

            return (
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Step 1 — Add {phaseConfig.sourceLabelPlural}
                  </p>
                  {isStep1Done && (
                    <button
                      onClick={() => setStep1FinishedMap((prev) => ({ ...prev, [activePhase]: false }))}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Add More {phaseConfig.sourceLabelPlural}
                    </button>
                  )}
                </div>

                {isStep1Done ? (
                  <div className="p-2.5 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center justify-between text-xs text-green-800 dark:text-green-300 font-medium">
                    <span>✓ Finished adding {phaseConfig.sourceLabelPlural.toLowerCase()} for Phase {activePhase} ({sources.length} added). Work through them below in Step 2.</span>
                  </div>
                ) : (
                  <>
                    {phaseConfig.presets.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {phaseConfig.presets.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => togglePreset(preset)}
                            className="px-2 py-1 text-[11px] rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={addSourceText}
                      onChange={(e) => setAddSourceText(e.target.value)}
                      placeholder={`Enter ${phaseConfig.sourceLabelPlural.toLowerCase()}, separated by commas or new lines`}
                      rows={2}
                      className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 mb-3"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddSources}
                        disabled={savingSource}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingSource ? "Saving..." : `Save ${phaseConfig.sourceLabelPlural}`}
                      </button>
                      {sources.length > 0 && (
                        <button
                          onClick={handleFinishStep1}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700"
                        >
                          ✓ Done Adding {phaseConfig.sourceLabelPlural}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Step 2: source list / dropdown */}
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Step 2 — {phaseConfig.sourceLabelPlural} ({sources.length})
            </p>
            {sources.length === 0 ? (
              <p className="text-sm text-gray-500">No {phaseConfig.sourceLabelPlural.toLowerCase()} added yet. Enter them above in Step 1.</p>
            ) : (
              <ul className="space-y-2">
                {[...sources]
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-gray-100 dark:border-gray-800 px-3 py-2"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</span>{" "}
                        {sourceBadge(s)}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          {s.status === "pending" && firstUnlocked?.id === s.id && (
                            <button
                              onClick={() => handleSelectSource(s)}
                              disabled={busySourceId === s.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                            >
                              {busySourceId === s.id ? "Starting..." : "Start"}
                            </button>
                          )}
                          {s.status === "pending" && firstUnlocked?.id !== s.id && (
                            <span className="px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 opacity-60 flex items-center gap-1 font-normal select-none">
                              🔒 Locked
                            </span>
                          )}
                          {s.status === "active" && (
                            <button
                              onClick={() => handleCompleteSource(s)}
                              disabled={busySourceId === s.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                            >
                              {busySourceId === s.id ? "Completing..." : `Complete ${phaseConfig.sourceLabel}`}
                            </button>
                          )}
                          {s.status === "completed" && (
                            <button
                              onClick={() => handleReopenSource(s)}
                              disabled={busySourceId === s.id}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 disabled:opacity-50 cursor-pointer"
                            >
                              {busySourceId === s.id ? "Opening..." : "↩️ Re-open / Continue"}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Active source workspace */}
          {activeSource && (
            <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Working on: {activeSource.name}
                  </p>
                  {isDraftRestored && (
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                      📝 Draft Auto-Saved
                    </span>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleToggleOrCancelEmployerForm}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                  >
                    {showEmployerForm ? "Cancel" : "+ Add Employer"}
                  </button>
                )}
              </div>

              {/* Employer Form */}
              {showEmployerForm && canEdit && (
                <form onSubmit={handleAddEmployer} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  {EMPLOYER_FIELD_DEFS.map((f) => {
                    const val = employerForm[f.key] || "";
                    let dupWarning = "";
                    const targetList = allLeadEmployers.length > 0 ? allLeadEmployers : employers;

                    if (f.key === "companyName") {
                      const normName = val.trim().toLowerCase();
                      if (normName.length > 0 && targetList.some((emp) => (emp.companyName || "").trim().toLowerCase() === normName)) {
                        dupWarning = "⚠️ Duplicate Company Name! An employer with this company name has already been added.";
                      }
                    } else if (f.key === "website") {
                      const normWeb = normalizeUrl(val);
                      if (normWeb.length > 0 && targetList.some((emp) => normalizeUrl(emp.website || "") === normWeb)) {
                        dupWarning = "⚠️ Duplicate Website! An employer with this website has already been added.";
                      }
                    } else if (f.key === "jobUrl") {
                      const normJob = normalizeUrl(val);
                      if (normJob.length > 0 && targetList.some((emp) => normalizeUrl(emp.jobUrl || "") === normJob)) {
                        dupWarning = "⚠️ Duplicate Job URL! An employer with this job advertisement URL has already been added.";
                      }
                    }

                    if (f.key === "occupation") {
                      return (
                        <div key={f.key}>
                          <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                            {f.label}{f.required ? " *" : ""}
                          </label>
                          {occupations && occupations.length > 0 ? (
                            <select
                              value={val}
                              onChange={(e) => setEmployerForm((prev) => ({ ...prev, occupation: e.target.value }))}
                              className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-purple-500"
                            >
                              <option value="">-- Select Candidate Occupation --</option>
                              {occupations.map((occ) => (
                                <option key={occ} value={occ}>
                                  💼 {occ}
                                </option>
                              ))}
                              {val && !occupations.includes(val) && (
                                <option value={val}>💼 {val} (Custom)</option>
                              )}
                            </select>
                          ) : (
                            <input
                              value={val}
                              onChange={(e) => setEmployerForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              placeholder="e.g. Registered Nurse"
                              className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5"
                            />
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={f.key} className={f.key === "notes" ? "sm:col-span-2" : ""}>
                        <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                          {f.label}{f.required ? " *" : ""}
                        </label>
                        {f.key === "notes" ? (
                          <textarea
                            value={val}
                            onChange={(e) => setEmployerForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            rows={2}
                            className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5"
                          />
                        ) : (
                          <input
                            value={val}
                            onChange={(e) => setEmployerForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            className={`w-full text-sm rounded-md border ${
                              dupWarning
                                ? "border-red-500 focus:ring-red-500"
                                : "border-gray-200 dark:border-gray-700"
                            } bg-white dark:bg-gray-900 px-2 py-1.5`}
                          />
                        )}
                        {dupWarning && (
                          <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-0.5">
                            {dupWarning}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <div className="sm:col-span-2 mt-2">
                    {(() => {
                      const normName = (employerForm.companyName || "").trim().toLowerCase();
                      const normWeb = normalizeUrl(employerForm.website || "");
                      const normJob = normalizeUrl(employerForm.jobUrl || "");

                      const isDupName = normName.length > 0 && employers.some((emp) => (emp.companyName || "").trim().toLowerCase() === normName);
                      const isDupWeb = normWeb.length > 0 && employers.some((emp) => normalizeUrl(emp.website || "") === normWeb);
                      const isDupJob = normJob.length > 0 && employers.some((emp) => normalizeUrl(emp.jobUrl || "") === normJob);

                      const missingRequired = !employerForm.companyName?.trim() || !employerForm.website?.trim() || !employerForm.jobUrl?.trim();
                      const isDisabled = savingEmployer || isDupName || isDupWeb || isDupJob || missingRequired;

                      return (
                        <button
                          type="submit"
                          disabled={isDisabled}
                          className="px-4 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingEmployer ? "Saving..." : "Save Employer"}
                        </button>
                      );
                    })()}
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Unified Employers Section for Phase */}
          <div className="space-y-4">
            {/* Single Unified Data Table Box */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                  <thead className="bg-zinc-100/90 dark:bg-zinc-800/90">
                    {/* Header Titles */}
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-[120px]">
                        Job Board
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-[140px]">
                        Occupation
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-40">
                        Company Name
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-[130px]">
                        Website / Date
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-[150px]">
                        Contact &amp; Phone
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-[140px]">
                        Emails
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide min-w-[200px]">
                        Status &amp; Actions
                      </th>
                    </tr>

                    {/* Integrated In-Table Column Filters */}
                    <tr className="bg-zinc-200/60 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-700">
                      {/* 1. Job Board Filter */}
                      <th className="p-1.5 align-middle">
                        <select
                          value={filterSourceId}
                          onChange={(e) => setFilterSourceId(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                        >
                          <option value="">All {phaseConfig.sourceLabelPlural}</option>
                          {sources.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </th>

                      {/* 2. Occupation Filter */}
                      <th className="p-1.5 align-middle">
                        <select
                          value={filterOccupation}
                          onChange={(e) => setFilterOccupation(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                        >
                          <option value="">All Occupations</option>
                          {occupations && occupations.map((occ) => (
                            <option key={occ} value={occ}>
                              💼 {occ}
                            </option>
                          ))}
                          {Array.from(new Set(employers.map((e) => e.occupation?.trim()).filter(Boolean)))
                            .filter((occ) => !occupations?.includes(occ!))
                            .map((occ) => (
                              <option key={occ} value={occ}>
                                💼 {occ}
                              </option>
                            ))}
                          <option value="__unspecified__">Unspecified</option>
                        </select>
                      </th>

                      {/* 3. Company Name Filter */}
                      <th className="p-1.5 align-middle">
                        <input
                          type="text"
                          placeholder="Filter company..."
                          value={filterCompanyName}
                          onChange={(e) => setFilterCompanyName(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                        />
                      </th>

                      {/* 4. Website Filter */}
                      <th className="p-1.5 align-middle">
                        <input
                          type="text"
                          placeholder="Filter website..."
                          value={filterWebsite}
                          onChange={(e) => setFilterWebsite(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                        />
                      </th>

                      {/* 5. Contact & Phone Filter */}
                      <th className="p-1.5 align-middle">
                        <input
                          type="text"
                          placeholder="Filter contact..."
                          value={filterContactPerson}
                          onChange={(e) => setFilterContactPerson(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                        />
                      </th>

                      {/* 6. Emails Filter */}
                      <th className="p-1.5 align-middle">
                        <input
                          type="text"
                          placeholder="Filter email..."
                          value={filterEmails}
                          onChange={(e) => setFilterEmails(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                        />
                      </th>

                      {/* 7. Status Filter & Clear Button */}
                      <th className="p-1.5 align-middle">
                        <div className="flex items-center gap-1">
                          <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-normal focus:ring-1 focus:ring-red-500"
                          >
                            <option value="">All Statuses</option>
                            <option value="Not Emailed Yet">Not Emailed Yet</option>
                            <option value="Email Sent">Email Sent</option>
                            {STATUS_OPTIONS.map((st) => (
                              <option key={st.value} value={st.value}>
                                {st.value}
                              </option>
                            ))}
                          </select>
                          {hasActiveFilters && (
                            <button
                              onClick={clearAllFilters}
                              title="Clear all filters"
                              className="px-2 py-1 text-[10px] font-bold rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                            >
                              ✖ Clear
                            </button>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredEmployers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-500">
                          {employers.length === 0
                            ? `No employers added yet for Phase ${activePhase}.`
                            : "No employers match the selected filters."}
                        </td>
                      </tr>
                    ) : (
                      paginatedEmployers.map((emp) => {
                        const followup = getFollowupInfo(
                          emp.emailSentAt,
                          emp.status,
                          emp.lastFollowupAt,
                          emp.followupCount || 0,
                        );

                        const primaryEmail =
                          emp.hrEmail || emp.generalEmail || "-";

                        return (
                          <tr
                            key={emp.id}
                            className={`transition ${
                              followup?.isDueOrOverdue
                                ? "bg-red-50/60 dark:bg-red-950/30 hover:bg-red-100/60"
                                : "hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
                            }`}
                          >
                            {/* Job Board Badge */}
                            <td className="px-3 py-1.5 text-xs align-middle">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                                📌 {emp.sourceName || "Source"}
                              </span>
                            </td>

                            {/* Occupation Badge */}
                            <td className="px-3 py-1.5 text-xs align-middle">
                              {emp.occupation ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 whitespace-nowrap">
                                  💼 {emp.occupation}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs italic">-</span>
                              )}
                            </td>

                            {/* Company Name */}
                            <td className="px-3 py-1.5 text-xs align-middle">
                              <div className="flex flex-col">
                                <button
                                  onClick={() => setViewDetailsEmployer(emp)}
                                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer text-left"
                                >
                                  {emp.companyName}
                                </button>
                                {emp.jobUrl && (
                                  <a
                                    href={
                                      emp.jobUrl.startsWith("http")
                                        ? emp.jobUrl
                                        : `https://${emp.jobUrl}`
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Job Ad Link 🔗
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Website */}
                            <td className="px-3 py-1.5 text-xs align-middle">
                              {emp.website ? (
                                <a
                                  href={
                                    emp.website.startsWith("http")
                                      ? emp.website
                                      : `https://${emp.website}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-40 inline-block"
                                >
                                  🌐 {emp.website}
                                </a>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Contact Person & Phone */}
                            <td className="px-3 py-1.5 text-xs align-middle text-gray-700 dark:text-gray-300">
                              <span className="font-medium">{emp.contactPerson || "-"}</span>
                              {emp.phone && <span className="text-[10px] text-gray-500 block">{emp.phone}</span>}
                            </td>

                            {/* Emails */}
                            <td className="px-3 py-1.5 text-xs align-middle text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {primaryEmail}
                              </span>
                            </td>

                            {/* Status & Actions */}
                            <td className="px-3 py-1.5 text-xs align-middle">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {emp.status ? (
                                  <span
                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                      isTerminalStatus(emp.status)
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                    }`}
                                  >
                                    {emp.status}
                                  </span>
                                ) : emp.emailSent ? (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                    ✓ Email Sent
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                    ✉️ Not Emailed Yet
                                  </span>
                                )}

                                {followup?.isDueOrOverdue && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-red-600 text-white">
                                    🔔 Follow-up Due
                                  </span>
                                )}

                                {canEdit && followup?.isDueOrOverdue && !followup.closed && (
                                  <button
                                    onClick={() => handleLogFollowupEmployer(emp.id)}
                                    disabled={loggingFollowupEmpId === emp.id}
                                    className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                                  >
                                    {loggingFollowupEmpId === emp.id ? "Saving..." : "Take Follow-up 🔔"}
                                  </button>
                                )}

                                <button
                                  onClick={() => setViewDetailsEmployer(emp)}
                                  className="px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 cursor-pointer"
                                >
                                  View
                                </button>

                                {canEdit && (
                                  <>
                                    <button
                                      onClick={() => handleOpenEditEmployer(emp)}
                                      className="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 cursor-pointer"
                                    >
                                      Edit
                                    </button>

                                    {!emp.emailSent ? (
                                      <button
                                        onClick={() => handleMarkEmailSentDirect(emp.id, emp.companyName)}
                                        disabled={markingEmailSentEmpId === emp.id}
                                        className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                                      >
                                        {markingEmailSentEmpId === emp.id ? "Saving..." : "Mark Email Sent"}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setStatusModalEmployer(emp);
                                          setStatusValue(emp.status || "");
                                          setStatusNotes("");
                                        }}
                                        className="px-2 py-0.5 text-[10px] font-medium rounded bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 cursor-pointer"
                                      >
                                        Status
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Employers Table Pagination Footer */}
              {empTotalPages > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setEmpPage((prev) => Math.max(1, prev - 1))}
                      disabled={empPage === 1}
                      className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setEmpPage((prev) => Math.min(empTotalPages, prev + 1))}
                      disabled={empPage === empTotalPages}
                      className="ml-3 relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>

                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-700 dark:text-gray-300">
                        Showing{" "}
                        <span className="font-medium">
                          {empTotal === 0 ? 0 : (empPage - 1) * empLimit + 1}
                        </span>{" "}
                        to{" "}
                        <span className="font-medium">
                          {Math.min(empPage * empLimit, empTotal)}
                        </span>{" "}
                        of <span className="font-medium">{empTotal}</span> employers
                      </p>

                      <select
                        value={empLimit}
                        onChange={(e) => {
                          setEmpLimit(Number(e.target.value));
                          setEmpPage(1);
                        }}
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        <option value={10}>10 per page</option>
                        <option value={25}>25 per page</option>
                        <option value={50}>50 per page</option>
                      </select>
                    </div>

                    <nav className="relative z-0 inline-flex rounded-md shadow-xs -space-x-px">
                      <button
                        onClick={() => setEmpPage((prev) => Math.max(1, prev - 1))}
                        disabled={empPage === 1}
                        className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <span className="sr-only">Previous</span>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>

                      {Array.from({ length: empTotalPages }, (_, i) => i + 1)
                        .filter(
                          (p) =>
                            p === 1 ||
                            p === empTotalPages ||
                            (p >= empPage - 1 && p <= empPage + 1),
                        )
                        .flatMap((p, idx, arr) => {
                          const elements: React.ReactNode[] = [];
                          if (idx > 0 && p - arr[idx - 1] > 1) {
                            elements.push(
                              <span
                                key={`ellipsis-${p}`}
                                className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300"
                              >
                                ...
                              </span>,
                            );
                          }
                          elements.push(
                            <button
                              key={`page-${p}`}
                              onClick={() => setEmpPage(p)}
                              className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium cursor-pointer ${
                                p === empPage
                                  ? "z-10 bg-gray-900 dark:bg-gray-100 border-gray-900 dark:border-gray-100 text-white dark:text-gray-900"
                                  : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                              }`}
                            >
                              {p}
                            </button>,
                          );
                          return elements;
                        })}

                      <button
                        onClick={() => setEmpPage((prev) => Math.min(empTotalPages, prev + 1))}
                        disabled={empPage === empTotalPages}
                        className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <span className="sr-only">Next</span>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* Status Update modal */}
      {statusModalEmployer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 w-full max-w-sm">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
              Status update — {statusModalEmployer.companyName}
            </h3>
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value)}
              className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 mb-3"
            >
              <option value="">Select status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value}
                </option>
              ))}
            </select>
            <label className="text-xs font-medium text-gray-500">Notes *</label>
            <textarea
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              rows={3}
              className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStatusModalEmployer(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={savingStatus}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {savingStatus ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal — Compact 3-Column Grid Layout (No Scrolling) */}
      {viewDetailsEmployer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 w-full max-w-3xl shadow-2xl">
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {viewDetailsEmployer.companyName}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                  {sources.find((s) => s.id === viewDetailsEmployer.sourceId)?.name || viewDetailsEmployer.sourceName}
                </span>
              </div>
              <button
                onClick={() => setViewDetailsEmployer(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-base font-bold px-1.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Compact Grid for Employer Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-gray-50/70 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">1. Company Name</span>
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{viewDetailsEmployer.companyName || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">2. Occupation</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.occupation || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">3. Website URL</span>
                <p className="truncate">
                  {viewDetailsEmployer.website ? (
                    <a href={viewDetailsEmployer.website.startsWith("http") ? viewDetailsEmployer.website : `https://${viewDetailsEmployer.website}`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline font-medium">{viewDetailsEmployer.website}</a>
                  ) : "-"}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">4. HR Email</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.hrEmail || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">5. General Email</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.generalEmail || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">6. Contact Person</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.contactPerson || "-"}</p>
              </div>

              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">7. Phone</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.phone || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">8. City</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.city || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">9. State</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewDetailsEmployer.state || "-"}</p>
              </div>

              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Status</span>
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{viewDetailsEmployer.status || (viewDetailsEmployer.emailSent ? "✓ Email Sent" : "✉️ Not Emailed Yet")}</p>
              </div>

              <div className="sm:col-span-2">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">10. Job Advertisement URL</span>
                <p className="truncate">
                  {viewDetailsEmployer.jobUrl ? (
                    <a href={viewDetailsEmployer.jobUrl.startsWith("http") ? viewDetailsEmployer.jobUrl : `https://${viewDetailsEmployer.jobUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline font-medium">{viewDetailsEmployer.jobUrl}</a>
                  ) : "-"}
                </p>
              </div>

              {(viewDetailsEmployer.notes || viewDetailsEmployer.statusNotes) && (
                <div className="sm:col-span-3">
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">11. Notes</span>
                  <p className="font-medium text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{viewDetailsEmployer.notes || viewDetailsEmployer.statusNotes || "-"}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[10px] text-gray-500">
                Created by {viewDetailsEmployer.createdByName || "System"} · {new Date(viewDetailsEmployer.createdAt).toLocaleDateString("en-IN")}
              </p>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    onClick={() => {
                      handleOpenEditEmployer(viewDetailsEmployer);
                      setViewDetailsEmployer(null);
                    }}
                    className="px-3 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 cursor-pointer"
                  >
                    ✏️ Edit Details
                  </button>
                )}
                <button
                  onClick={() => setViewDetailsEmployer(null)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employer Modal — Compact 3-Column Grid Layout (No Scrolling) */}
      {editEmployerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 w-full max-w-3xl shadow-2xl">
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                Edit Employer Details — {editEmployerModal.companyName}
              </h3>
              <button
                onClick={() => setEditEmployerModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-base font-bold px-1.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditEmployer();
              }}
              className="space-y-2.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EMPLOYER_FIELD_DEFS.map((field) => {
                  const val = editEmployerForm[field.key] || "";
                  let dupWarning: string | null = null;
                  const targetList = allLeadEmployers.length > 0 ? allLeadEmployers : employers;

                  if (field.key === "companyName" && val.trim().length > 0) {
                    const norm = val.trim().toLowerCase();
                    const isDup = targetList.some(
                      (emp) => emp.id !== editEmployerModal.id && (emp.companyName || "").trim().toLowerCase() === norm
                    );
                    if (isDup) dupWarning = "Duplicate Company Name!";
                  } else if (field.key === "website" && val.trim().length > 0) {
                    const norm = normalizeUrl(val);
                    const isDup = norm.length > 0 && targetList.some(
                      (emp) => emp.id !== editEmployerModal.id && normalizeUrl(emp.website || "") === norm
                    );
                    if (isDup) dupWarning = "Duplicate Website!";
                  } else if (field.key === "jobUrl" && val.trim().length > 0) {
                    const norm = normalizeUrl(val);
                    const isDup = norm.length > 0 && targetList.some(
                      (emp) => emp.id !== editEmployerModal.id && normalizeUrl(emp.jobUrl || "") === norm
                    );
                    if (isDup) dupWarning = "Duplicate Job Link!";
                  }

                  if (field.key === "occupation") {
                    return (
                      <div key={field.key}>
                        <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {occupations && occupations.length > 0 ? (
                          <select
                            value={val}
                            onChange={(e) =>
                              setEditEmployerForm((prev) => ({ ...prev, occupation: e.target.value }))
                            }
                            className="w-full text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">-- Select Candidate Occupation --</option>
                            {occupations.map((occ) => (
                              <option key={occ} value={occ}>
                                💼 {occ}
                              </option>
                            ))}
                            {val && !occupations.includes(val) && (
                              <option value={val}>💼 {val} (Custom)</option>
                            )}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) =>
                              setEditEmployerForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            className="w-full text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    );
                  }

                  const isTextArea = field.key === "notes";
                  const isFullSpan = field.key === "jobUrl" || isTextArea;

                  return (
                    <div key={field.key} className={isFullSpan ? "sm:col-span-3" : ""}>
                      <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {isTextArea ? (
                        <textarea
                          value={val}
                          onChange={(e) =>
                            setEditEmployerForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          rows={2}
                          className="w-full text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <input
                          type={field.key.toLowerCase().includes("email") ? "email" : "text"}
                          value={val}
                          onChange={(e) =>
                            setEditEmployerForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className={`w-full text-xs rounded border ${
                            dupWarning
                              ? "border-red-500 dark:border-red-500 bg-red-50/30 dark:bg-red-950/20"
                              : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                          } px-2 py-1 focus:ring-1 focus:ring-blue-500`}
                        />
                      )}
                      {dupWarning && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold mt-0.5">
                          {dupWarning}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditEmployerModal(null)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
                {(() => {
                  const normName = (editEmployerForm.companyName || "").trim().toLowerCase();
                  const normWeb = normalizeUrl(editEmployerForm.website || "");
                  const normJob = normalizeUrl(editEmployerForm.jobUrl || "");
                  const targetList = allLeadEmployers.length > 0 ? allLeadEmployers : employers;

                  const isDupName = normName.length > 0 && targetList.some((emp) => emp.id !== editEmployerModal.id && (emp.companyName || "").trim().toLowerCase() === normName);
                  const isDupWeb = normWeb.length > 0 && targetList.some((emp) => emp.id !== editEmployerModal.id && normalizeUrl(emp.website || "") === normWeb);
                  const isDupJob = normJob.length > 0 && targetList.some((emp) => emp.id !== editEmployerModal.id && normalizeUrl(emp.jobUrl || "") === normJob);

                  const missingRequired = !editEmployerForm.companyName?.trim() || !editEmployerForm.website?.trim() || !editEmployerForm.jobUrl?.trim();
                  const isDisabled = savingEditEmployer || isDupName || isDupWeb || isDupJob || missingRequired;

                  return (
                    <button
                      type="submit"
                      disabled={isDisabled}
                      className="px-4 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {savingEditEmployer ? "Saving..." : "Save Changes"}
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
