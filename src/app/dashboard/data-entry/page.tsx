"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  assignedToName: string;
  createdAt: string;
};

const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// Working date is locked to today — reps can't past-date or future-date a lead
// (which would otherwise let them spin up a fresh 25-lead quota bucket on an
// arbitrary date to "reset" or backdate their target tracking).

const emptyForm = {
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
};

// Draft is kept in localStorage so an accidental refresh/tab-close doesn't
// wipe in-progress data entry. It's only cleared once the lead is actually
// submitted successfully.
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

export default function DataEntryPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingDate, setWorkingDate] = useState(todayISO());
  const [historyDate, setHistoryDate] = useState(todayISO());
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SubmittedLead[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const reminderTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist every keystroke as a draft so a refresh restores the in-progress form.
  useEffect(() => {
    try {
      window.localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(form));
    } catch {
      // ignore storage errors (e.g. private browsing quota)
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
        if (!["employee", "meeting"].includes(me.role)) {
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

  // History has its own date picker so reps can look back at previous days'
  // leads without affecting the working date (which stays locked to today
  // for actually creating leads).
  useEffect(() => {
    if (!user) return;
    loadHistory(historyDate);
  }, [user, historyDate, loadHistory]);

  // Reminder: check every 2 hours while the page stays open
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

    if (form.leadSource === "Job Portals" && !form.leadSourceOther.trim()) {
      toast.error("Please enter the job portal name");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bd/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDate, ...form }),
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

        {/* Working date + target */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Working Date
            </label>
            <input
              type="date"
              value={workingDate}
              min={todayISO()}
              max={todayISO()}
              onChange={(e) => {
                const picked = e.target.value;
                if (picked !== todayISO()) {
                  toast.error("Working date is locked to today");
                  return;
                }
                setWorkingDate(picked);
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Today&apos;s Target</p>
            <p
              className={`text-3xl font-bold ${
                progress?.targetCompleted
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-800 dark:text-gray-100"
              }`}
            >
              {counterLabel || "25 Remaining"}
            </p>
            {progress?.targetCompleted && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Daily target completed 🎉
              </p>
            )}
          </div>
        </div>

        {/* Lead form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
            New Lead
          </h2>

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
            <Field label="Website *" value={form.website} onChange={(v) => handleChange("website", v)} />
            <Field label="Company Name" value={form.companyName} onChange={(v) => handleChange("companyName", v)} />
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
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Lead Source</label>
              <select
                value={form.leadSource}
                onChange={(e) => handleChange("leadSource", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select lead source</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {form.leadSource === "Job Portals" && (
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

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-foreground text-background font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Lead"}
          </button>
        </form>

        {/* Submitted leads history — browsable by date, but this never affects
            the working date above, so new leads can still only be created
            on today's date. */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {historyLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No leads submitted for this date
                    </td>
                  </tr>
                ) : (
                  history.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {new Date(lead.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100 break-words">{lead.companyName || "—"}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 break-words">{lead.industry}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 break-words">{lead.assignedToName}</td>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}