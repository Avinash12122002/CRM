"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";

const LexicalEditor = dynamic(() => import("@/components/LexicalEditor"), {
  ssr: false,
});

type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting";
};

type Vacancy = {
  vacancyId: number;
  jobTitle: string;
  description: string;
  status: "active" | "inactive";
  createdBy: number;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
};

export default function VacancyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      fetchVacancy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setUser(data);
    } catch (error) {
      console.error("Error fetching user:", error);
      router.push("/");
    }
  };

  const fetchVacancy = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vacancies/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setVacancy(data);
        setDescription(data.description || "<p></p>");
      } else {
        toast.error("Vacancy not found");
        router.push("/dashboard/vacancies");
      }
    } catch (error) {
      console.error("Error fetching vacancy:", error);
      toast.error("Failed to load vacancy");
      router.push("/dashboard/vacancies");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (vacancy) {
      setDescription(vacancy.description || "<p></p>");
    }
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!description.trim() || description === "<p></p>" || description === "<p><br></p>"
) {
      toast.error("Please enter a description");
      return;
    }

    setUpdating(true);
    const loadingToast = toast.loading("Updating vacancy...");

    try {
      const res = await fetch(`/api/vacancies/${params.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        toast.success("Vacancy updated successfully");
        setIsEditing(false);
        fetchVacancy();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update vacancy");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Error updating vacancy:", error);
      toast.error("Failed to update vacancy");
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!vacancy) return;

    const newStatus = vacancy.status === "active" ? "inactive" : "active";
    const loadingToast = toast.loading("Updating status...");

    try {
      const res = await fetch(`/api/vacancies/${params.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        toast.success("Status updated successfully");
        fetchVacancy();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update status");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this vacancy?")) return;

    const loadingToast = toast.loading("Deleting vacancy...");

    try {
      const res = await fetch(`/api/vacancies/${params.id}`, {
        method: "DELETE",
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        toast.success("Vacancy deleted successfully");
        router.push("/dashboard/vacancies");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete vacancy");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Error deleting vacancy:", error);
      toast.error("Failed to delete vacancy");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!vacancy) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/dashboard/vacancies")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition"
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
            Back to Vacancies
          </button>
        </div>

        {/* Main Content */}
        <div className="bg-white shadow-lg rounded-xl p-8 mb-6 border border-gray-100">
          {/* Title Section */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">
                  {vacancy.jobTitle}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Vacancy #{vacancy.vacancyId}
                </p>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    vacancy.status === "active"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {vacancy.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            {user.role === "admin" && !isEditing && (
              <div className="flex gap-2">
                <button
                  onClick={handleEdit}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={handleStatusToggle}
                  className={`px-4 py-2 rounded-lg transition font-medium ${
                    vacancy.status === "active"
                      ? "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      : "bg-green-50 text-green-600 hover:bg-green-100"
                  }`}
                >
                  {vacancy.status === "active" ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex flex-wrap gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span>
                  Posted by: <strong>{vacancy.creatorName}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>Created: {formatDate(vacancy.createdAt)}</span>
              </div>
              {vacancy.updatedAt !== vacancy.createdAt && (
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Updated: {formatDate(vacancy.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Description
            </h2>
            {isEditing ? (
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <LexicalEditor
                  initialContent={description}
                  onChange={(html) => setDescription(html)}
                />
              </div>
            ) : (
              <div
                className="prose max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: vacancy.description }}
              />
            )}
          </div>

          {/* Edit Actions */}
          {isEditing && (
            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={handleCancelEdit}
                disabled={updating}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updating}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
