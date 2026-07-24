"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { INDUSTRIES, LEAD_SOURCES } from "@/lib/bd/constants";

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

// Draft is kept in localStorage so an accidental refresh doesn't wipe
// in-progress data. It's only cleared once the lead is actually created.
const FORM_DRAFT_KEY = "bd_create_lead_form_draft";

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

export default function BDCreateLeadModal({
  onClose,
  onCreated,
  selfAssign = true,
}: {
  onClose: () => void;
  onCreated: (leadId: number) => void;
  // When true (BD user) the lead is self-assigned; when false (admin) it's
  // round-robin'd to a Business Development user.
  selfAssign?: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [submitting, setSubmitting] = useState(false);

  // Persist every keystroke as a draft so a refresh restores the in-progress form.
  useEffect(() => {
    try {
      window.localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(form));
    } catch {
      // ignore storage errors (e.g. private browsing quota)
    }
  }, [form]);

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.industry.trim() || !form.country.trim() || !form.website.trim()) {
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
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create lead");
        return;
      }

      toast.success(
        selfAssign
          ? "Lead Created Successfully — assigned to you"
          : `Lead Created Successfully — assigned to ${data.assignedToName || "a BD user"}`
      );
      try {
        window.localStorage.removeItem(FORM_DRAFT_KEY);
      } catch {
        // ignore storage errors
      }
      onCreated(data.lead.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create lead");
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
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Create Lead</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          {selfAssign
            ? "This lead will be assigned to you directly — no daily quota applies here."
            : "This lead will be auto-assigned to a Business Development user (round-robin)."}
        </p>

        <form onSubmit={handleSubmit}>
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
            <Field label="Country *" value={form.country} onChange={(v) => handleChange("country", v)} />
            <Field label="Website *" value={form.website} onChange={(v) => handleChange("website", v)} />
            <Field label="Company Name" value={form.companyName} onChange={(v) => handleChange("companyName", v)} />
            <Field label="Email" type="email" value={form.email} onChange={(v) => handleChange("email", v)} />
            <Field label="Phone Number" value={form.phoneNumber} onChange={(v) => handleChange("phoneNumber", v)} />
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
            <Field label="Address" value={form.address} onChange={(v) => handleChange("address", v)} />
            <Field label="LinkedIn" value={form.linkedin} onChange={(v) => handleChange("linkedin", v)} />
            <Field label="Instagram" value={form.instagram} onChange={(v) => handleChange("instagram", v)} />
            <Field label="Facebook" value={form.facebook} onChange={(v) => handleChange("facebook", v)} />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "+ Create Lead"}
            </button>
          </div>
        </form>
      </div>
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