"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";
import { INDUSTRIES, DATA_ENTRY_PHASES } from "@/lib/bd/constants";
import { useDuplicateCheck } from "@/lib/bd/useDuplicateCheck";

type MeResponse = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "business_development" | "wtc" | "wm";
};

type DailyProgress = {
  date: string;
  target: number;
  totalCreated: number;
  remaining: number;
  targetCompleted: boolean;
};

type SubmittedLead = {
  id: number;
  companyName: string;
  industry: string;
  leadSource?: string;
  leadSourceOther?: string;
  assignedToName: string;
  createdAt: string;
};

const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const emptyForm = {
  industry: "",
  country: "",
  website: "",
  companyName: "",
  email: "",
  phoneNumber: "",
  decisionMakerName: "",
  decisionMakerPosition: "",
  leadSourceOther: "",
  address: "",
  linkedin: "",
  instagram: "",
  facebook: "",
  remarks: "",
};

const FORM_DRAFT_KEY = "bd_data_entry_form_draft";

type FormState = typeof emptyForm;

function loadDraft(): FormState {
  if (typeof window === "undefined") return { ...emptyForm };
  try {
    const saved = window.localStorage.getItem(FORM_DRAFT_KEY);
    if (!saved) return { ...emptyForm };
    const parsed = JSON.parse(saved) as Partial<FormState>;
    return { ...emptyForm, ...parsed };
  } catch {
    return { ...emptyForm };
  }
}

function loadCompletedPhases(date: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(`bd_completed_phases_${date}`);
    if (!saved) return [];
    return JSON.parse(saved) as number[];
  } catch {
    return [];
  }
}

export default function DataEntryPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingDate] = useState(todayISO());
  const [historyDate, setHistoryDate] = useState(todayISO());
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [submitting, setSubmitting] = useState(false);

  // Phase tab state: 1 (Google Maps), 2 (Search Engines), 3 (Business Directories), 4 (Job Portals)
  const [completedPhases, setCompletedPhases] = useState<number[]>(() => loadCompletedPhases(todayISO()));
  const [activePhase, setActivePhase] = useState<number>(() => {
    const done = loadCompletedPhases(todayISO());
    if (done.length === 0) return 1;
    // Default to the first uncompleted phase, or 4 if all completed
    const nextUncompleted = [1, 2, 3, 4].find((p) => !done.includes(p));
    return nextUncompleted || 4;
  });

  const companyDup = useDuplicateCheck("companyName", form.companyName);
  const websiteDup = useDuplicateCheck("website", form.website);
  const [history, setHistory] = useState<SubmittedLead[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const reminderTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPhaseConfig =
    DATA_ENTRY_PHASES.find((p) => p.phase === activePhase) || DATA_ENTRY_PHASES[0];

  useEffect(() => {
    try {
      window.localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(form));
    } catch {
      // ignore storage errors
    }
  }, [form]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const me = await res.json();
        if (!["telecaller", "employee", "meeting", "wtc", "wm"].includes(me.role)) {
          router.push("/dashboard");
          return;
        }
        setUser(me);
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const loadProgress = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/bd/targets/today?date=${date}`);
      if (res.ok) setProgress(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadHistory = useCallback(async (date: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/bd/leads/list?date=${date}&view=created`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.leads || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadProgress(workingDate);
  }, [user, workingDate, loadProgress]);

  useEffect(() => {
    if (!user) return;
    loadHistory(historyDate);
  }, [user, historyDate, loadHistory]);

  useEffect(() => {
    if (!user) return;

    const checkReminder = async () => {
      try {
        const res = await fetch("/api/bd/targets/reminder-check");
        if (res.ok) {
          const data = await res.json();
          if (data.shouldNotify) {
            toast(`Reminder: You still have ${data.remaining} leads pending today.`, {
              icon: "⏰",
              duration: 6000,
            });
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    reminderTimer.current = setInterval(checkReminder, REMINDER_INTERVAL_MS);
    return () => {
      if (reminderTimer.current) clearInterval(reminderTimer.current);
    };
  }, [user]);

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectPhase = (pNum: number, isAccessible: boolean) => {
    if (activePhase === pNum) return;
    if (!isAccessible) {
      toast.error(`Phase ${pNum} is locked. Complete Phase ${pNum - 1} first to unlock it!`, {
        icon: "🔒",
      });
      return;
    }
    setActivePhase(pNum);
  };

  const handleCompletePhase = () => {
    let updated = completedPhases;
    if (!completedPhases.includes(activePhase)) {
      updated = [...completedPhases, activePhase];
      setCompletedPhases(updated);
      try {
        window.localStorage.setItem(`bd_completed_phases_${workingDate}`, JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
    }

    if (activePhase < 4) {
      const nextP = activePhase + 1;
      setActivePhase(nextP);
      toast.success(`🎉 Phase ${activePhase} Completed! Moved to Phase ${nextP} (${DATA_ENTRY_PHASES[nextP - 1].label})`, {
        duration: 5000,
      });
    } else {
      toast.success(`🎉 Congratulations! All 4 Phases Completed for Today!`, {
        icon: "🏆",
        duration: 6000,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.industry.trim() ||
      !form.country.trim() ||
      !form.website.trim()
    ) {
      toast.error("Industry, Country and Website are required");
      return;
    }

    if (activePhase === 4 && !form.leadSourceOther.trim()) {
      toast.error("Please enter the job portal name");
      return;
    }

    if (companyDup.exists || websiteDup.exists) {
      toast.error("Please resolve the duplicate company name / website before submitting");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bd/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workingDate,
          ...form,
          leadSource: currentPhaseConfig.source,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create lead");
        return;
      }

      toast.success(`Lead Created Successfully - Assigned to ${data.assignedToName}`);
      setForm({ ...emptyForm });
      try {
        window.localStorage.removeItem(FORM_DRAFT_KEY);
      } catch {
        // ignore storage errors
      }
      loadProgress(workingDate);
      if (historyDate === todayISO()) loadHistory(historyDate);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create lead");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const counterLabel = progress
    ? progress.totalCreated < progress.target
      ? `${progress.remaining} Remaining`
      : `${progress.totalCreated} Created`
    : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">
          Data Entry
        </h1>

        {/* Top bar: Date (Read-only) + Target */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-2xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              Today&apos;s Date
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {new Date(workingDate + "T00:00:00.000+05:30").toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Today
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              Today&apos;s Target (25 Leads)
            </p>
            <p
              className={`text-3xl font-extrabold ${
                progress?.targetCompleted
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-800 dark:text-gray-100"
              }`}
            >
              {counterLabel || "25 Remaining"}
            </p>
            {progress?.targetCompleted && (
              <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1">
                Daily target completed 🎉
              </p>
            )}
          </div>
        </div>

        {/* 4 Phase Tabs: Red = Active, Green = Completed, Grey = Locked */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide flex items-center gap-2">
                <span>Phase Progress</span>
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Phase {activePhase} Active ({completedPhases.length}/4 Completed)
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Current phase shows in <span className="font-bold text-red-600">RED</span>. Click &quot;Complete Phase&quot; to finish and unlock the next phase! Completed phases show in <span className="font-bold text-emerald-600">GREEN</span>.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCompletePhase}
              className="self-start sm:self-auto px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              {completedPhases.includes(activePhase)
                ? `✓ Phase ${activePhase} Completed`
                : activePhase < 4
                ? `✓ Complete Phase ${activePhase} & Next Phase ➔`
                : `🎉 Complete Final Phase (Phase 4)`}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DATA_ENTRY_PHASES.map((p) => {
              const isCompleted = completedPhases.includes(p.phase);
              const isActive = activePhase === p.phase;
              const isAccessible = p.phase === 1 || isCompleted || completedPhases.includes(p.phase - 1);

              let tabStyle = "";
              let badgeText = "";

              if (isActive) {
                // CURRENT ACTIVE PHASE: RED
                tabStyle = "bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-400/40 cursor-pointer";
                badgeText = "Current";
              } else if (isCompleted) {
                // COMPLETED PHASE: GREEN
                tabStyle = "bg-emerald-600 text-white border-emerald-600 shadow-xs hover:bg-emerald-700 cursor-pointer";
                badgeText = "✓ Done";
              } else if (isAccessible) {
                // UNLOCKED BUT NOT ACTIVE/COMPLETED YET
                tabStyle = "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-red-400 hover:bg-red-50/40 cursor-pointer";
                badgeText = "Unlocked";
              } else {
                // LOCKED FUTURE PHASE
                tabStyle = "bg-gray-100 dark:bg-gray-800/60 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700/60 cursor-not-allowed";
                badgeText = "🔒 Locked";
              }

              return (
                <button
                  key={p.phase}
                  type="button"
                  onClick={() => handleSelectPhase(p.phase, isAccessible)}
                  title={
                    isActive
                      ? `Current Active Phase ${p.phase}`
                      : isCompleted
                      ? `Phase ${p.phase} Completed (Click to view/switch back)`
                      : isAccessible
                      ? `Phase ${p.phase} Unlocked (Click to switch)`
                      : `Phase ${p.phase} is locked. Complete Phase ${p.phase - 1} first!`
                  }
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition ${tabStyle}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive || isCompleted ? "text-white/80" : "text-gray-400"}`}>
                      Phase {p.phase}
                    </span>
                    <span className="text-sm font-extrabold">{p.label}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${isActive || isCompleted ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
                    {badgeText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lead form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8 shadow-2xs"
        >
          <div className="flex items-center justify-between mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                New Lead Submission
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Active Source: <span className="font-bold text-red-600 dark:text-red-400">Phase {activePhase} · {currentPhaseConfig.source}</span>
              </p>
            </div>

            {completedPhases.includes(activePhase) && (
              <span className="px-3 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ✓ Phase {activePhase} Marked Completed
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Industry *</label>
              <select
                value={form.industry}
                onChange={(e) => handleChange("industry", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Country *" value={form.country} onChange={(v) => handleChange("country", v)} />
            <Field
              label="Website *"
              value={form.website}
              onChange={(v) => handleChange("website", v)}
              checking={websiteDup.checking}
              error={websiteDup.message}
            />
            <Field
              label="Company Name"
              value={form.companyName}
              onChange={(v) => handleChange("companyName", v)}
              checking={companyDup.checking}
              error={companyDup.message}
            />
            <Field label="Email" type="email" value={form.email} onChange={(v) => handleChange("email", v)} />
            <Field
              label="Phone Number"
              value={form.phoneNumber}
              onChange={(v) => handleChange("phoneNumber", v)}
            />
            <Field
              label="Decision Maker Name"
              value={form.decisionMakerName}
              onChange={(v) => handleChange("decisionMakerName", v)}
            />
            <Field
              label="Decision Maker Position"
              value={form.decisionMakerPosition}
              onChange={(v) => handleChange("decisionMakerPosition", v)}
            />

            {/* If Phase 4 (Job Portals), render Job Portal Name required input */}
            {activePhase === 4 && (
              <Field
                label="Job Portal Name *"
                value={form.leadSourceOther}
                onChange={(v) => handleChange("leadSourceOther", v)}
              />
            )}

            <Field label="Address" value={form.address} onChange={(v) => handleChange("address", v)} />
            <Field label="LinkedIn" value={form.linkedin} onChange={(v) => handleChange("linkedin", v)} />
            <Field label="Instagram" value={form.instagram} onChange={(v) => handleChange("instagram", v)} />
            <Field label="Facebook" value={form.facebook} onChange={(v) => handleChange("facebook", v)} />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Remarks
            </label>
            <textarea
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="submit"
              disabled={submitting || companyDup.exists || websiteDup.exists}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? "Submitting..." : `Submit Lead (Phase ${activePhase})`}
            </button>

            <button
              type="button"
              onClick={handleCompletePhase}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {completedPhases.includes(activePhase) ? (
                <>✓ Phase {activePhase} Completed</>
              ) : activePhase < 4 ? (
                <>✓ Complete Phase {activePhase} &amp; Move to Phase {activePhase + 1} ➔</>
              ) : (
                <>🎉 Complete Final Phase (Phase 4)</>
              )}
            </button>
          </div>
        </form>

        {/* Submitted leads history */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-2xs">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                {historyDate === todayISO()
                  ? "Today's Submitted Leads"
                  : `Submitted Leads — ${new Date(historyDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Read only — cannot edit or delete</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={historyDate}
                max={todayISO()}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {historyDate !== todayISO() && (
                <button
                  type="button"
                  onClick={() => setHistoryDate(todayISO())}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Today
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Company</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Industry</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Phase / Lead Source</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {historyLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No leads submitted for this date
                    </td>
                  </tr>
                ) : (
                  history.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {new Date(lead.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 text-xs font-semibold text-gray-800 dark:text-gray-100 wrap-break-word">{lead.companyName || "—"}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 wrap-break-word">{lead.industry}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 wrap-break-word">
                        {lead.leadSource ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {lead.leadSource}
                            {lead.leadSource === "Job Portals" && lead.leadSourceOther ? ` (${lead.leadSourceOther})` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 wrap-break-word">{lead.assignedToName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  checking = false,
  error = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  checking?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
        {label}
        {checking && <span className="ml-2 text-xs font-normal text-gray-400">checking…</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 ${
          error
            ? "border-red-500 focus:ring-red-500"
            : "border-gray-300 dark:border-gray-700 focus:ring-blue-500"
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}