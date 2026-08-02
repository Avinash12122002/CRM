"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";

type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "business_development" | "billing";
};

type FunnelItem = {
  stage: string;
  label: string;
  count: number;
};

type StageEmailStat = {
  _id: string;
  total: number;
  followups: number;
};

type MailboxStat = {
  _id: string;
  total: number;
};

type RecentEmail = {
  _id: string;
  leadName: string;
  stage: string;
  mailbox: string;
  templateName: string;
  subject: string;
  status: string;
  isFollowup: boolean;
  sentAt: string;
  sentByName: string;
};

type InvoiceStat = {
  _id: string;
  count: number;
  totalAmount: number;
};


type Analytics = {
  funnelData: FunnelItem[];
  emailsByStage: StageEmailStat[];
  emailsByMailbox: MailboxStat[];
  recentEmails: RecentEmail[];
  invoiceStats: InvoiceStat[];
  totalLeadsWithWorkflow: number;
  completedWorkflows: number;
  followupsTodayCount: number;
  emailsTodayCount: number;
};

const STAGE_COLORS: Record<string, string> = {
  info: "#6366f1",
  agreement: "#8b5cf6",
  invoice: "#f59e0b",
  payment_confirmation: "#10b981",
  case_manager: "#3b82f6",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function StatCard({ label, value, subtitle, color }: { label: string; value: number | string; subtitle?: string; color?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: color || "#fff" }}>{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function EmailAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.id || data.role !== "admin") {
          router.push("/dashboard");
          return;
        }
        setUser(data);
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setAnalyticsLoading(true);
    fetch("/api/email/analytics")
      .then((r) => r.json())
      .then((data) => setAnalytics(data))
      .catch(console.error)
      .finally(() => setAnalyticsLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const maxFunnelCount = Math.max(...(analytics?.funnelData.map((f) => f.count) || [1]), 1);

  // Invoice totals
  const pendingInvoice = analytics?.invoiceStats.find((s) => s._id === "pending");
  const paidInvoice = analytics?.invoiceStats.find((s) => s._id === "paid");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Email Analytics</h1>
            <p className="text-slate-400 text-sm">Campaign performance & workflow conversion insights</p>
          </div>
          <button
            onClick={() => {
              setAnalyticsLoading(true);
              fetch("/api/email/analytics")
                .then((r) => r.json())
                .then((data) => setAnalytics(data))
                .catch(console.error)
                .finally(() => setAnalyticsLoading(false));
            }}
            className="px-3 py-2 rounded-lg text-sm text-slate-400 border border-slate-700 hover:border-slate-500 transition-colors flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${analyticsLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {analyticsLoading && !analytics ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : analytics ? (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Active Workflows"
                value={analytics.totalLeadsWithWorkflow}
                subtitle="Leads with email workflow"
                color="#6366f1"
              />
              <StatCard
                label="Completed"
                value={analytics.completedWorkflows}
                subtitle="Full pipeline done"
                color="#10b981"
              />
              <StatCard
                label="Emails Today"
                value={analytics.emailsTodayCount}
                subtitle="Sent today"
                color="#f59e0b"
              />
              <StatCard
                label="Follow-ups Today"
                value={analytics.followupsTodayCount}
                subtitle="Auto-sent today"
                color="#8b5cf6"
              />
            </div>

            {/* Invoice KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4">
                <p className="text-xs text-amber-500 uppercase tracking-wide">Pending Invoices</p>
                <p className="text-3xl font-bold text-amber-400 mt-1">{pendingInvoice?.count || 0}</p>
                <p className="text-sm text-amber-300 mt-1">
                  Total: AUD {(pendingInvoice?.totalAmount || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-4">
                <p className="text-xs text-emerald-500 uppercase tracking-wide">Paid Invoices</p>
                <p className="text-3xl font-bold text-emerald-400 mt-1">{paidInvoice?.count || 0}</p>
                <p className="text-sm text-emerald-300 mt-1">
                  Collected: AUD {(paidInvoice?.totalAmount || 0).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Stage Funnel */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Stage Funnel</h2>
                <div className="space-y-3">
                  {analytics.funnelData.map((item) => {
                    const pct = maxFunnelCount > 0 ? (item.count / maxFunnelCount) * 100 : 0;
                    const color = STAGE_COLORS[item.stage] || "#6366f1";
                    return (
                      <div key={item.stage}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">{item.label}</span>
                          <span className="text-sm font-bold text-white">{item.count}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {analytics.funnelData.length > 0 && analytics.funnelData[0].count > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <p className="text-xs text-slate-500">
                      Completion Rate:{" "}
                      <span className="text-emerald-400 font-semibold">
                        {Math.round((analytics.completedWorkflows / analytics.totalLeadsWithWorkflow) * 100) || 0}%
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Mailbox Performance */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Mailbox Performance</h2>
                <div className="space-y-3">
                  {analytics.emailsByMailbox.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-8">No emails sent yet</p>
                  ) : (
                    analytics.emailsByMailbox.map((mb, i) => {
                      const total = analytics.emailsByMailbox.reduce((sum, m) => sum + m.total, 0);
                      const pct = total > 0 ? Math.round((mb.total / total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-300 truncate">{mb._id}</p>
                            <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-bold text-white shrink-0">{mb.total}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Recent Activity */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Recent Email Activity</h2>
                {analytics.recentEmails.length === 0 ? (
                  <p className="text-slate-600 text-sm text-center py-8">No emails sent yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {analytics.recentEmails.map((email) => {
                      const color = STAGE_COLORS[email.stage] || "#6366f1";
                      return (
                        <div key={email._id} className="flex items-start gap-3 p-2 hover:bg-slate-800/30 rounded-lg transition-colors">
                          <div
                            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                            style={{ background: color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-white truncate">{email.leadName}</p>
                              <p className="text-xs text-slate-600 shrink-0">{formatDate(email.sentAt)}</p>
                            </div>
                            <p className="text-xs text-slate-400 truncate">{email.templateName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-600 truncate">{email.mailbox}</span>
                              {email.isFollowup && (
                                <span className="text-xs text-amber-600">follow-up</span>
                              )}
                              <span className={`text-xs ${email.status === "sent" ? "text-emerald-500" : email.status === "simulated" ? "text-amber-500" : "text-red-500"}`}>
                                {email.status === "simulated" ? "queued" : email.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </>
        ) : (
          <div className="text-center py-32 text-slate-600">
            <p className="text-4xl mb-3">📊</p>
            <p>Failed to load analytics</p>
          </div>
        )}
      </div>
    </div>
  );
}
