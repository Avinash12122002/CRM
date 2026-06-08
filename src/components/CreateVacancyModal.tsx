"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";

const LexicalEditor = dynamic(() => import("./LexicalEditor"), { ssr: false });

type CreateVacancyModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

export default function CreateVacancyModal({
  onClose,
  onSuccess,
}: CreateVacancyModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jobTitle.trim()) {
      toast.error("Please enter a job title");
      return;
    }

    if (
      !description.trim() ||
      description === "<p></p>" ||
      description === "<p><br></p>"
    ) {
      toast.error("Please enter a description");
      return;
    }

    setSubmitting(true);
    const loadingToast = toast.loading("Creating vacancy...");

    try {
      const res = await fetch("/api/vacancies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, description }),
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        toast.success("Vacancy created successfully");
        setJobTitle("");
        setDescription("");
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create vacancy");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Error creating vacancy:", error);
      toast.error("Failed to create vacancy");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Create Vacancy
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
              Job Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Senior Software Engineer"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
              Description <span className="text-red-500">*</span>
            </label>
            <div className="border border-gray-300 rounded-lg overflow-hidden dark:border-gray-700">
              <div className="dark:bg-gray-800 dark:text-gray-100">
                <LexicalEditor
                  initialContent=""
                  onChange={(html) => setDescription(html)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create Vacancy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
