"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";

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
    | "case_manager";
}

interface TodoTask {
  type: "followup" | "interested" | "interview" | "need_cv" | "need_info";
  leadId: number;
  candidateName: string;
  phase: number;
  phaseLabel: string;
  title: string;
  detail: string;
  dueDate?: string | null;
  overdue?: boolean;
}

const TYPE_META: Record<
  TodoTask["type"],
  { label: string; badgeClass: string }
> = {
  followup: {
    label: "Follow-up Due",
    badgeClass: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  interested: {
    label: "Interested",
    badgeClass: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  interview: {
    label: "Interview",
    badgeClass: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  need_cv: {
    label: "Need CV",
    badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  need_info: {
    label: "Need Info",
    badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
};

export default function TodoPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TodoTask["type"] | "all">("all");

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
      if (data.role !== "case_manager") {
        router.push("/dashboard");
        return;
      }
      setUser({ id: data.id, name: data.name, email: data.email, role: data.role });
      fetchTasks();
    } catch (err) {
      console.error(err);
      router.push("/");
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/case-marketing/todo");
      const data = await res.json();
      if (res.ok) setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const visibleTasks = tasks.filter((t) => filter === "all" || t.type === filter);
  const counts = {
    all: tasks.length,
    followup: tasks.filter((t) => t.type === "followup").length,
    interested: tasks.filter((t) => t.type === "interested").length,
    interview: tasks.filter((t) => t.type === "interview").length,
    need_cv: tasks.filter((t) => t.type === "need_cv").length,
    need_info: tasks.filter((t) => t.type === "need_info").length,
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8 px-4">
          <p className="text-gray-600 dark:text-gray-400 py-6">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">To-Do</h1>
        <p className="text-sm text-gray-500 mb-6">
          Every pending CV Marketing action across your assigned candidates, in one place.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {(["all", "followup", "interested", "interview", "need_cv", "need_info"] as const).map(
            (key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  filter === key
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {key === "all" ? "All" : TYPE_META[key].label} ({counts[key]})
              </button>
            ),
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          {loading ? (
            <p className="text-sm text-gray-500 p-6">Loading tasks...</p>
          ) : visibleTasks.length === 0 ? (
            <p className="text-sm text-gray-500 p-6">Nothing pending here — you&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {visibleTasks.map((task, idx) => (
                <li
                  key={idx}
                  onClick={() => router.push(`/dashboard/case-leads/${task.leadId}`)}
                  className="p-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${TYPE_META[task.type].badgeClass}`}
                      >
                        {TYPE_META[task.type].label}
                      </span>
                      {task.overdue && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-red-600 text-white">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {task.candidateName} — {task.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{task.detail}</p>
                  </div>
                  {task.dueDate && (
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(task.dueDate).toLocaleDateString("en-IN")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
