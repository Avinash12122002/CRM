"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface CaseLeadForEdit {
  id: number;
  name: string;
  phone?: string;
  email: string;
  state?: string;
  city?: string;
  country?: string;
  age?: number;
  passportType?: string;
  leadSource?: string;
  jobApplied?: string;
}

interface CaseLeadEditModalProps {
  lead: CaseLeadForEdit;
  onClose: () => void;
  onSaved: () => void;
}

export default function CaseLeadEditModal({
  lead,
  onClose,
  onSaved,
}: CaseLeadEditModalProps) {
  const [name, setName] = useState(lead.name || "");
  const [phone, setPhone] = useState(lead.phone || "");
  const [email, setEmail] = useState(lead.email || "");
  const [country, setCountry] = useState(lead.country || "");
  const [state, setState] = useState(lead.state || "");
  const [city, setCity] = useState(lead.city || "");
  const [age, setAge] = useState(lead.age ? String(lead.age) : "");
  const [passportType, setPassportType] = useState(lead.passportType || "");
  const [leadSource, setLeadSource] = useState(lead.leadSource || "");
  const [jobApplied, setJobApplied] = useState(lead.jobApplied || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error("Phone is required");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          country,
          state,
          city,
          age,
          passportType,
          leadSource,
          jobApplied,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to update lead");
        return;
      }
      toast.success("Lead updated successfully");
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass =
    "block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1";

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
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Edit Case Lead
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                Phone <span className="text-red-500">*</span>
              </label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Passport Type</label>
              <input
                value={passportType}
                onChange={(e) => setPassportType(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Lead Source</label>
              <input
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Job Applied</label>
              <input
                value={jobApplied}
                onChange={(e) => setJobApplied(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
