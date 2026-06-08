"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import toast from "react-hot-toast";

type DashboardNavbarProps = {
  user: {
    id: number;
    name: string;
    email?: string;
    role: "admin" | "employee" | "meeting";
  };
};

export default function DashboardNavbar({ user }: DashboardNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();

const handleSignOut = async () => {
  const loadingToast = toast.loading("Signing out...");

  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
    });

    toast.dismiss(loadingToast);

    if (res.ok) {
      toast.success("Signed out successfully");
      router.push("/");
    } else {
      toast.error("Failed to sign out");
    }
  } catch (error) {
    toast.dismiss(loadingToast);
    console.error(error);
    toast.error("Failed to sign out");
  }
};

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-linear-to-br rounded-lg flex items-center justify-center">
                  <Image src="/logo.png" alt="Logo" width={24} height={24} />
                </div>
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                href="/dashboard"
                className={`${
                  isActive("/dashboard")
                    ? "border-b-2 border-foreground"
                    : "border-transparent hover:border-zinc-300 border-b-2"
                } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                  isActive("/dashboard")
                    ? ""
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/leads"
                className={`${
                  isActive("/dashboard/leads")
                    ? "border-b-2 border-foreground"
                    : "border-transparent hover:border-zinc-300 border-b-2"
                } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                  isActive("/dashboard/leads")
                    ? ""
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                Leads
              </Link>
              <Link
                href="/dashboard/activity"
                className={`${
                  isActive("/dashboard/activity")
                    ? "border-b-2 border-foreground"
                    : "border-transparent hover:border-zinc-300 border-b-2"
                } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                  isActive("/dashboard/activity")
                    ? ""
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                Activity
              </Link>
              <Link
                href="/dashboard/vacancies"
                className={`${
                  isActive("/dashboard/vacancies") ||
                  pathname.startsWith("/dashboard/vacancies/")
                    ? "border-b-2 border-foreground"
                    : "border-transparent hover:border-zinc-300 border-b-2"
                } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                  isActive("/dashboard/vacancies") ||
                  pathname.startsWith("/dashboard/vacancies/")
                    ? ""
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                Vacancies
              </Link>
              {user.role === "admin" && (
                <Link
                  href="/dashboard/users"
                  className={`${
                    isActive("/dashboard/users")
                      ? "border-b-2 border-foreground"
                      : "border-transparent hover:border-zinc-300 border-b-2"
                  } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive("/dashboard/users")
                      ? ""
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Users
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg
                  className="w-5 h-5 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-zinc-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button> */}
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {user.name} <span className="text-xs">({user.role})</span>
            </span>
            <button
              onClick={handleSignOut}
              className="rounded bg-foreground px-4 py-2 text-sm text-background hover:opacity-90"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
