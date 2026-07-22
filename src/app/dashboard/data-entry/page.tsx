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
  companyName: "",
  email: "",
  website: "",
  linkedin: "",
  facebook: "",
  instagram: "",
  decisionMakerName: "",
  decisionMakerPosition: "",
  phoneNumber: "",
  country: "",
  address: "",
  leadSource: "",
  leadSourceOther: "",
  remarks: "",
};

export default function DataEntryPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingDate, setWorkingDate] = useState(todayISO());
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SubmittedLead[]>([]);
  const reminderTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    try {
      const res = await fetch(`/api/bd/leads/list?date=${date}&view=created`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.leads || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadProgress(workingDate);
    loadHistory(workingDate);
  }, [user, workingDate, loadProgress, loadHistory]);

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
      loadProgress(workingDate);
      loadHistory(workingDate);
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
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  const counterLabel = progress
    ? progress.totalCreated < progress.target
      ? `${progress.remaining} Remaining`
      : `${progress.totalCreated} Created`
    : "";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <DashboardNavbar user={user} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
          Data Entry
        </h1>

        {/* Working date + target */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
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
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="text-right">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Today&apos;s Target</p>
            <p
              className={`text-3xl font-bold ${
                progress?.targetCompleted
                  ? "text-green-600 dark:text-green-400"
                  : "text-zinc-900 dark:text-zinc-100"
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
          className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            New Lead
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Industry *</label>
              <select
                value={form.industry}
                onChange={(e) => handleChange("industry", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Website *" value={form.website} onChange={(v) => handleChange("website", v)} />
            <Field label="Country *" value={form.country} onChange={(v) => handleChange("country", v)} />
            <Field label="Company Name" value={form.companyName} onChange={(v) => handleChange("companyName", v)} />
            <Field label="Email" type="email" value={form.email} onChange={(v) => handleChange("email", v)} />
            <Field
              label="Phone Number"
              value={form.phoneNumber}
              onChange={(v) => handleChange("phoneNumber", v)}
            />
            <div>
              <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Lead Source</label>
              <select
                value={form.leadSource}
                onChange={(e) => handleChange("leadSource", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <Field label="LinkedIn" value={form.linkedin} onChange={(v) => handleChange("linkedin", v)} />
            <Field label="Facebook" value={form.facebook} onChange={(v) => handleChange("facebook", v)} />
            <Field label="Instagram" value={form.instagram} onChange={(v) => handleChange("instagram", v)} />
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
            <Field label="Address" value={form.address} onChange={(v) => handleChange("address", v)} />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
              Remarks
            </label>
            <textarea
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {/* Today's submitted leads */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Today&apos;s Submitted Leads
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Read only — cannot edit or delete</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Industry</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400">
                      No leads submitted yet for this date
                    </td>
                  </tr>
                ) : (
                  history.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {new Date(lead.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-6 py-3 text-sm text-zinc-900 dark:text-zinc-100">{lead.companyName || "—"}</td>
                      <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">{lead.industry}</td>
                      <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">{lead.assignedToName}</td>
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
      <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
