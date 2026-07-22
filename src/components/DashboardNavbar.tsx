"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { useEffect, useState } from "react";

type DashboardNavbarProps = {
  user: {
    id: number;
    name: string;
    email?: string;
    role: "admin" | "employee" | "meeting" | "business_development";
  };
};

export default function DashboardNavbar({ user }: DashboardNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadUnreadCount();

    const interval = setInterval(() => {
      loadUnreadCount();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const loadUnreadCount = async () => {
    try {
      const res = await fetch("/api/chat/unread");
      const data = await res.json();
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error(err);
    }
  };

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

  const navLinkClass = (active: boolean) =>
    `block px-4 py-3 text-sm font-medium border-l-2 transition-colors ${
      active
        ? "border-foreground text-foreground bg-zinc-50 dark:bg-zinc-800"
        : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
    }`;

  return (
    <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-linear-to-br rounded-lg flex items-center justify-center">
                  <Image src="/logo.png" alt="Logo" width={24} height={24} />
                </div>
              </div>
            </div>

            {/* Desktop nav links */}
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
              {user.role !== "business_development" && (
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
              )}
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

              {user.role === "meeting" && (
                <Link
                  href="/dashboard/meetings"
                  className={`${
                    isActive("/dashboard/meetings")
                      ? "border-b-2 border-foreground"
                      : "border-transparent hover:border-zinc-300 border-b-2"
                  } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive("/dashboard/meetings")
                      ? ""
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Meetings
                </Link>
              )}
              {(user.role === "employee" || user.role === "meeting") && (
                <Link
                  href="/dashboard/data-entry"
                  className={`${
                    isActive("/dashboard/data-entry")
                      ? "border-b-2 border-foreground"
                      : "border-transparent hover:border-zinc-300 border-b-2"
                  } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive("/dashboard/data-entry")
                      ? ""
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Data Entry
                </Link>
              )}
              {user.role === "business_development" && (
                <Link
                  href="/dashboard/bd-pipeline"
                  className={`${
                    isActive("/dashboard/bd-pipeline") ||
                    pathname.startsWith("/dashboard/bd-pipeline/")
                      ? "border-b-2 border-foreground"
                      : "border-transparent hover:border-zinc-300 border-b-2"
                  } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive("/dashboard/bd-pipeline") ||
                    pathname.startsWith("/dashboard/bd-pipeline/")
                      ? ""
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  BD Pipeline
                </Link>
              )}
              {user.role === "admin" && (
                <Link
                  href="/dashboard/bd-analytics"
                  className={`${
                    isActive("/dashboard/bd-analytics")
                      ? "border-b-2 border-foreground"
                      : "border-transparent hover:border-zinc-300 border-b-2"
                  } inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive("/dashboard/bd-analytics")
                      ? ""
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  BD Analytics
                </Link>
              )}
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

          {/* Right side: notification + user + sign out + hamburger */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-zinc-600 dark:text-zinc-400">
              {user.name} <span className="text-xs">({user.role})</span>
            </span>
            <button
              onClick={handleSignOut}
              className="hidden sm:block rounded bg-foreground px-4 py-2 text-sm text-background hover:opacity-90"
            >
              Sign out
            </button>

            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="sm:hidden p-2 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                /* X icon */
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                /* Hamburger icon with optional unread dot */
                <span className="relative">
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
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          {/* User info */}
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {user.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
              {user.role}
            </p>
          </div>

          {/* Nav links */}
          <div className="py-1">
            <Link href="/dashboard" className={navLinkClass(isActive("/dashboard"))}>
              Dashboard
            </Link>
            {user.role !== "business_development" && (
              <Link href="/dashboard/leads" className={navLinkClass(isActive("/dashboard/leads"))}>
                Leads
              </Link>
            )}
            <Link href="/dashboard/activity" className={navLinkClass(isActive("/dashboard/activity"))}>
              Activity
            </Link>
            <Link
              href="/dashboard/vacancies"
              className={navLinkClass(
                isActive("/dashboard/vacancies") ||
                  pathname.startsWith("/dashboard/vacancies/")
              )}
            >
              Vacancies
            </Link>

            {user.role === "meeting" && (
              <Link
                href="/dashboard/meetings"
                className={navLinkClass(isActive("/dashboard/meetings"))}
              >
                Meetings
              </Link>
            )}
            {(user.role === "employee" || user.role === "meeting") && (
              <Link
                href="/dashboard/data-entry"
                className={navLinkClass(isActive("/dashboard/data-entry"))}
              >
                Data Entry
              </Link>
            )}
            {user.role === "business_development" && (
              <Link
                href="/dashboard/bd-pipeline"
                className={navLinkClass(
                  isActive("/dashboard/bd-pipeline") ||
                    pathname.startsWith("/dashboard/bd-pipeline/")
                )}
              >
                BD Pipeline
              </Link>
            )}
            {user.role === "admin" && (
              <Link
                href="/dashboard/bd-analytics"
                className={navLinkClass(isActive("/dashboard/bd-analytics"))}
              >
                BD Analytics
              </Link>
            )}
            {user.role === "admin" && (
              <Link
                href="/dashboard/users"
                className={navLinkClass(isActive("/dashboard/users"))}
              >
                Users
              </Link>
            )}

            <Link
              href="/dashboard/chat"
              className={`${navLinkClass(
                isActive("/dashboard/chat") ||
                  pathname.startsWith("/dashboard/chat/")
              )} flex items-center justify-between pr-4`}
            >
              <span>Chat</span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs min-w-[18px] h-[18px] rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Link>
          </div>

          {/* Sign out */}
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={handleSignOut}
              className="w-full rounded bg-foreground px-4 py-2 text-sm text-background hover:opacity-90"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}