"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting" | "business_development" | "billing";
};

type EmailStage =
  | "info"
  | "agreement"
  | "invoice"
  | "payment_confirmation"
  | "case_manager";

const STAGES: { key: EmailStage; label: string; mailbox: string; color: string }[] = [
  { key: "info", label: "Information", mailbox: "info@tmsvisa.com", color: "#6366f1" },
  { key: "agreement", label: "Agreement", mailbox: "compliance@tmsvisa.com", color: "#8b5cf6" },
  { key: "invoice", label: "Invoice", mailbox: "sales@tmsvisa.com", color: "#f59e0b" },
  { key: "payment_confirmation", label: "Payment Confirmation", mailbox: "sales@tmsvisa.com", color: "#10b981" },
  { key: "case_manager", label: "Case Manager Intro", mailbox: "sumit.recruiter@tmsvisa.com", color: "#3b82f6" },
];

const STAGE_LABELS: Record<EmailStage, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.label])
) as Record<EmailStage, string>;


type LeadWorkflow = {
  leadId: number;
  currentStage: EmailStage | null;
  workflowName: string | null;
  followupCount: number;
  nextFollowupAt: string | null;
  lastEmailAt: string | null;
  isCompleted: boolean;
};

type Lead = {
  id: number;
  name: string | null;
  email: string | null;
  phone?: string;
  status: string;
  assignedToName?: string;
};


type EmailHistory = {
  _id: string;
  stage: EmailStage;
  mailbox: string;
  templateName: string;
  subject: string;
  bodyPreview: string;
  status: "sent" | "failed" | "simulated";
  isFollowup: boolean;
  followupNumber: number;
  cancelled: boolean;
  sentAt: string;
  sentByName: string;
  invoiceId?: string;
  body?: string;
};

type TemplateAttachment = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type Template = {
  _id: string;
  name: string;
  stage: EmailStage;
  mailbox: string;
  subject: string;
  html: string;
  isFollowup: boolean;
  parentTemplateId?: string;
  program?: string;
  attachments?: TemplateAttachment[];
};

type Mailbox = {
  _id: string;
  email: string;
  displayName: string;
  purpose: string;
  isActive: boolean;
};

type Invoice = {
  _id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paymentLink: string;
  dueDate?: string;
  status: "pending" | "paid";
  createdAt: string;
};

type Tab = "workflows" | "mailboxes" | "templates";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getStageInfo(key: EmailStage | null) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

function getNextStage(current: EmailStage | null): EmailStage | null {
  if (!current) return "info";
  const idx = STAGES.findIndex((s) => s.key === current);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1].key;
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

function EmailPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("workflows");

  // Lead Workflows list
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadWorkflows, setLeadWorkflows] = useState<Record<number, LeadWorkflow>>({});
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Selected lead panel
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<LeadWorkflow | null>(null);
  const [emailHistory, setEmailHistory] = useState<EmailHistory[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [selectedHistoryEmail, setSelectedHistoryEmail] = useState<EmailHistory | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);

  // Send email state
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [advancingStage, setAdvancingStage] = useState(false);

  // Invoice form
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState("AUD");
  const [invoicePaymentLink, setInvoicePaymentLink] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceRemarks, setInvoiceRemarks] = useState("");
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Mailbox form
  const [showMailboxForm, setShowMailboxForm] = useState(false);
  const [mbEmail, setMbEmail] = useState("");
  const [mbDisplayName, setMbDisplayName] = useState("");
  const [mbPurpose, setMbPurpose] = useState("");
  const [savingMailbox, setSavingMailbox] = useState(false);

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showFollowupTemplateForm, setShowFollowupTemplateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplStage, setTplStage] = useState<EmailStage>("info");
  const [tplMailbox, setTplMailbox] = useState("info@tmsvisa.com");
  const [tplSubject, setTplSubject] = useState("");
  const [tplHtml, setTplHtml] = useState("");
  const [tplProgram, setTplProgram] = useState("");
  const [tplParentTemplateId, setTplParentTemplateId] = useState("");
  const [tplAttachments, setTplAttachments] = useState<TemplateAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ─── Auth ───
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

  // ─── Load from URL param ───
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam && leads.length > 0) {
      const found = leads.find((l) => l.id === parseInt(leadParam));
      if (found) openLeadPanel(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, leads]);

  // ─── Fetch leads list with workflow data ───
  const fetchLeadWorkflows = useCallback(async () => {
    setLeadsLoading(true);
    try {
      // Get all leads the admin has access to
      const res = await fetch("/api/leads/list?limit=200");
      const data = await res.json();
      const allLeads: Lead[] = data.leads || [];
      setLeads(allLeads);

      // Fetch workflow state for each lead that has one
      const workflowRes = await fetch("/api/email/workflows-list");
      if (workflowRes.ok) {
        const wfData = await workflowRes.json();
        const wfMap: Record<number, LeadWorkflow> = {};
        (wfData.workflows || []).forEach((wf: LeadWorkflow) => {
          wfMap[wf.leadId] = wf;
        });
        setLeadWorkflows(wfMap);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load leads");
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/email/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchMailboxes = useCallback(async () => {
    try {
      const res = await fetch("/api/email/mailboxes");
      const data = await res.json();
      setMailboxes(data.mailboxes || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchLeadWorkflows();
    fetchTemplates();
    fetchMailboxes();
  }, [user, fetchLeadWorkflows, fetchTemplates, fetchMailboxes]);

  // ─── Open lead panel ───
  const openLeadPanel = async (lead: Lead) => {
    setSelectedLead(lead);
    setPanelLoading(true);
    try {
      const res = await fetch(`/api/email/lead/${lead.id}`);
      const data = await res.json();
      setSelectedWorkflow(data.workflow || null);
      setEmailHistory(data.history || []);
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load workflow data");
    } finally {
      setPanelLoading(false);
    }
  };

  const closePanel = () => {
    setSelectedLead(null);
    setSelectedWorkflow(null);
    setEmailHistory([]);
    setInvoices([]);
    setShowInvoiceForm(false);
  };

  // ─── Send Email ───
  const handleSendEmail = async () => {
    if (!selectedLead) return;
    const stage = selectedWorkflow?.currentStage || "info";

    if (!selectedTemplate) {
      toast.error("Please select a template");
      return;
    }

    setSendingEmail(true);
    try {
      const res = await fetch(`/api/email/lead/${selectedLead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          templateId: selectedTemplate,
          workflowName: selectedWorkflow?.workflowName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        await openLeadPanel(selectedLead); // Refresh to show failure in history
        throw new Error(data.error || "Failed");
      }

      toast.success(data.simulated ? "Email queued (SMTP not configured)" : "Email sent successfully!");
      setSelectedTemplate("");
      await openLeadPanel(selectedLead);
      fetchLeadWorkflows();
    } catch (err) {
      toast.error(String(err));
      if (selectedLead) await openLeadPanel(selectedLead);
    } finally {
      setSendingEmail(false);
    }
  };

  // ─── Advance Stage ───
  const handleAdvanceStage = async () => {
    if (!selectedLead) return;
    const nextStage = getNextStage(selectedWorkflow?.currentStage || null);
    if (!nextStage) return toast.error("Already at the final stage");

    setAdvancingStage(true);
    try {
      const res = await fetch(`/api/email/lead/${selectedLead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance_stage",
          targetStage: nextStage,
          workflowName: selectedWorkflow?.workflowName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      const nextInfo = getStageInfo(nextStage);
      toast.success(`Moved to ${nextInfo.label}`);
      await openLeadPanel(selectedLead);
      fetchLeadWorkflows();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdvancingStage(false);
    }
  };

  // ─── Create Invoice & Send ───
  const handleCreateInvoice = async () => {
    if (!selectedLead) return;
    if (!invoiceAmount || !invoicePaymentLink) {
      toast.error("Amount and Payment Link are required");
      return;
    }

    setCreatingInvoice(true);
    try {
      // Create invoice
      const invRes = await fetch(`/api/email/lead/${selectedLead.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: invoiceAmount,
          currency: invoiceCurrency,
          paymentLink: invoicePaymentLink,
          dueDate: invoiceDueDate || null,
          remarks: invoiceRemarks || null,
          program: selectedWorkflow?.workflowName || null,
        }),
      });
      const invData = await invRes.json();
      if (!invRes.ok) throw new Error(invData.error || "Failed to create invoice");

      const invoice = invData.invoice;

      // Send invoice email
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Invoice — ${invoice.invoiceNumber}</h2>
          <p>Dear ${selectedLead.name},</p>
          <p>Please find your invoice details below:</p>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f8f9fa;">
              <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Invoice Number</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${invoice.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Amount Due</td>
              <td style="padding: 12px; border: 1px solid #dee2e6; font-size: 18px; color: #e63946;"><strong>${invoice.currency} ${invoice.amount}</strong></td>
            </tr>
            ${invoice.dueDate ? `<tr style="background: #f8f9fa;"><td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Due Date</td><td style="padding: 12px; border: 1px solid #dee2e6;">${new Date(invoice.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</td></tr>` : ""}
          </table>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invoice.paymentLink}" style="background: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">Pay Now — ${invoice.currency} ${invoice.amount}</a>
          </div>
          <p style="color: #666; font-size: 14px;">After successful payment, kindly reply to this email with the payment receipt.</p>
          <p>Regards,<br/><strong>TMS Visa Team</strong><br/>sales@tmsvisa.com</p>
        </div>
      `;

      const emailRes = await fetch(`/api/email/lead/${selectedLead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "invoice",
          customSubject: `Invoice ${invoice.invoiceNumber} — ${selectedLead.name}`,
          customHtml: emailHtml,
          workflowName: selectedWorkflow?.workflowName || "",
          invoiceId: invoice._id,
        }),
      });

      const emailData = await emailRes.json();
      if (!emailRes.ok) throw new Error(emailData.error || "Failed to send email");

      toast.success(emailData.simulated ? "Invoice created & queued (SMTP not configured)" : "Invoice sent successfully!");
      setShowInvoiceForm(false);
      setInvoiceAmount("");
      setInvoicePaymentLink("");
      setInvoiceDueDate("");
      setInvoiceRemarks("");
      await openLeadPanel(selectedLead);
      fetchLeadWorkflows();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCreatingInvoice(false);
    }
  };

  // ─── Mark Payment Received ───
  const handlePaymentReceived = async () => {
    if (!selectedLead || invoices.length === 0) return;

    const pendingInvoice = invoices.find((inv) => inv.status === "pending");
    if (!pendingInvoice) return toast.error("No pending invoice found");

    setAdvancingStage(true);
    try {
      // Mark invoice paid
      await fetch(`/api/email/lead/${selectedLead.id}/invoice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: pendingInvoice._id, status: "paid" }),
      });

      // Advance to payment_confirmation (auto-sends email)
      const res = await fetch(`/api/email/lead/${selectedLead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance_stage",
          targetStage: "payment_confirmation",
          workflowName: selectedWorkflow?.workflowName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      toast.success("Payment confirmed! Confirmation email sent.");
      await openLeadPanel(selectedLead);
      fetchLeadWorkflows();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdvancingStage(false);
    }
  };

  // ─── Save Mailbox ───
  const handleSaveMailbox = async () => {
    if (!mbEmail || !mbDisplayName || !mbPurpose) {
      toast.error("All fields required");
      return;
    }
    setSavingMailbox(true);
    try {
      const res = await fetch("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mbEmail, displayName: mbDisplayName, purpose: mbPurpose }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      toast.success("Mailbox added!");
      setShowMailboxForm(false);
      setMbEmail("");
      setMbDisplayName("");
      setMbPurpose("");
      fetchMailboxes();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingMailbox(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploadingAttachment(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/email/templates/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      
      setTplAttachments(prev => [...prev, data]);
      toast.success("Attachment added");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploadingAttachment(false);
      e.target.value = ""; // reset file input
    }
  };

  const removeAttachment = (fileId: string) => {
    setTplAttachments(prev => prev.filter(a => a.fileId !== fileId));
  };

  // ─── Save Template ───
  const handleSaveTemplate = async () => {
    if (!tplName || !tplSubject || !tplHtml) {
      toast.error("Name, subject, and body are required");
      return;
    }
    if (showFollowupTemplateForm && !tplParentTemplateId) {
      toast.error("Parent Template is required for follow-up templates");
      return;
    }
    setSavingTemplate(true);
    try {
      const method = editingTemplateId ? "PUT" : "POST";
      const bodyPayload: any = {
        name: tplName,
        stage: tplStage,
        mailbox: tplMailbox,
        subject: tplSubject,
        html: tplHtml,
        program: tplProgram || null,
        attachments: tplAttachments,
        isFollowup: showFollowupTemplateForm,
      };
      if (showFollowupTemplateForm) {
        bodyPayload.parentTemplateId = tplParentTemplateId;
      }
      if (editingTemplateId) {
        bodyPayload._id = editingTemplateId;
      }

      const res = await fetch("/api/email/templates", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      toast.success(editingTemplateId ? "Template updated!" : "Template saved!");
      setShowTemplateForm(false);
      setShowFollowupTemplateForm(false);
      setEditingTemplateId(null);
      setTplName("");
      setTplSubject("");
      setTplHtml("");
      setTplProgram("");
      setTplParentTemplateId("");
      setTplAttachments([]);
      fetchTemplates();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingTemplate(false);
    }
  };

  // ─── Delete Mailbox ───
  const handleDeleteMailbox = async (id: string) => {
    if (!confirm("Delete this mailbox?")) return;
    try {
      await fetch(`/api/email/mailboxes?id=${id}`, { method: "DELETE" });
      toast.success("Deleted");
      fetchMailboxes();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ─── Edit Template ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditTemplate = (t: any) => {
    setEditingTemplateId(t._id);
    setTplName(t.name);
    setTplStage(t.stage as EmailStage);
    setTplMailbox(t.mailbox);
    setTplSubject(t.subject);
    setTplHtml(t.html);
    setTplProgram(t.program || "");
    setTplAttachments(t.attachments || []);
    if (t.isFollowup) {
      setTplParentTemplateId(t.parentTemplateId || "");
      setShowFollowupTemplateForm(true);
      setShowTemplateForm(false);
    } else {
      setShowTemplateForm(true);
      setShowFollowupTemplateForm(false);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ─── Delete Template ───
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await fetch(`/api/email/templates?id=${id}`, { method: "DELETE" });
      toast.success("Deleted");
      fetchTemplates();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ─── Filtered leads ───
  const filteredLeads = leads.filter((l) => {
    const q = searchQuery.toLowerCase();
    return (
      (l.name ?? "").toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q)
    );
  });


  const leadsWithWorkflow = filteredLeads.filter((l) => leadWorkflows[l.id]);
  const leadsWithoutWorkflow = filteredLeads.filter((l) => !leadWorkflows[l.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // ─── Get stage-specific templates ───
  const currentStage = selectedWorkflow?.currentStage || "info";
  const stageTemplates = templates.filter(
    (t) => t.stage === currentStage && !t.isFollowup
  );
  const nextStage = getNextStage(currentStage);
  const nextStageInfo = nextStage ? getStageInfo(nextStage) : null;
  const pendingInvoice = invoices.find((inv) => inv.status === "pending");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header + tab navigation in one balanced row */}
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Email Workflow Engine</h1>
            <p className="text-slate-400 text-sm">Manage email campaigns, workflows, and follow-ups for all leads</p>
          </div>

          <div className="flex gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 sm:self-end">
            {([
              { key: "workflows", label: "Lead Workflows", icon: "⚡" },
              { key: "mailboxes", label: "Mailboxes", icon: "📬" },
              { key: "templates", label: "Templates", icon: "📝" },
            ] as { key: Tab; label: string; icon: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); closePanel(); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════ */}
        {/* TAB: Lead Workflows */}
        {/* ═══════════════════════════════════════ */}
        {activeTab === "workflows" && (
          <div className="flex gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>
            {/* Left: Lead List */}
            <div className={`${selectedLead ? "w-80 shrink-0" : "flex-1"} transition-all duration-300`}>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search leads by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
              </div>

              {leadsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Active workflows */}
                  {leadsWithWorkflow.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">Active Workflows ({leadsWithWorkflow.length})</p>
                      <div className={selectedLead ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2"}>
                        {leadsWithWorkflow.map((lead) => {
                          const wf = leadWorkflows[lead.id];
                          const stageInfo = getStageInfo(wf.currentStage);
                          const isSelected = selectedLead?.id === lead.id;
                          return (
                            <button
                              key={lead.id}
                              onClick={() => openLeadPanel(lead)}
                              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                                isSelected
                                  ? "border-indigo-500 bg-indigo-950/50 shadow-lg shadow-indigo-500/20"
                                  : "border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-white text-sm truncate">{lead.name}</p>
                                  <p className="text-xs text-slate-500 truncate">{lead.email || lead.phone || "No email on file"}</p>
                                </div>
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                                  style={{ background: `${stageInfo.color}20`, color: stageInfo.color, border: `1px solid ${stageInfo.color}40` }}
                                >
                                  {stageInfo.label.split(" ")[0]}
                                </span>
                              </div>
                              {wf.workflowName && (
                                <p className="text-xs text-indigo-400 mt-1 truncate">🌏 {wf.workflowName}</p>
                              )}
                              {wf.nextFollowupAt && !wf.isCompleted && (
                                <p className="text-xs text-amber-400 mt-1">
                                  📅 Follow-up: {formatDate(wf.nextFollowupAt)}
                                </p>
                              )}
                              {wf.isCompleted && (
                                <p className="text-xs text-emerald-400 mt-1">✅ Completed</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Leads without workflow */}
                  {leadsWithoutWorkflow.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1 mt-4">Start Workflow ({leadsWithoutWorkflow.length})</p>
                      <div className={selectedLead ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2"}>
                        {leadsWithoutWorkflow.slice(0, selectedLead ? 15 : 60).map((lead) => {
                          const isSelected = selectedLead?.id === lead.id;
                          return (
                            <button
                              key={lead.id}
                              onClick={() => openLeadPanel(lead)}
                              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                                isSelected
                                  ? "border-indigo-500 bg-indigo-950/50"
                                  : "border-slate-800/50 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/40"
                              }`}
                            >
                              <p className="font-medium text-slate-300 text-sm truncate">{lead.name}</p>
                              <p className="text-xs text-slate-600 truncate">{lead.email || lead.phone || "No email on file"}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {filteredLeads.length === 0 && (
                    <div className="text-center py-16 text-slate-600">
                      <p className="text-4xl mb-3">📭</p>
                      <p>No leads found</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Lead Workflow Panel */}
            {selectedLead && (
              <div className="flex-1 min-w-0">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
                  {/* Panel Header */}
                  <div className="p-5 border-b border-slate-800" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-white">{selectedLead.name}</h2>
                        <p className="text-sm text-slate-400">{selectedLead.email}</p>
                        {selectedLead.phone && <p className="text-sm text-slate-500">{selectedLead.phone}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/dashboard/leads/${selectedLead.id}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-800 hover:border-indigo-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          View Lead →
                        </a>
                        <button
                          onClick={closePanel}
                          className="text-slate-500 hover:text-white transition-colors p-1.5"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Workflow info */}
                    <div className="flex flex-wrap gap-3 mt-4">
                      {selectedWorkflow?.currentStage && (
                        <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-lg">
                          <span className="text-xs text-slate-400">Stage:</span>
                          <span className="text-xs font-semibold text-white">{STAGE_LABELS[selectedWorkflow.currentStage]}</span>
                        </div>
                      )}
                      {selectedWorkflow?.workflowName && (
                        <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-lg">
                          <span className="text-xs text-slate-400">Program:</span>
                          <span className="text-xs font-semibold text-indigo-400">{selectedWorkflow.workflowName}</span>
                        </div>
                      )}
                      {selectedWorkflow?.nextFollowupAt && !selectedWorkflow.isCompleted && (
                        <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-800/40 px-3 py-1.5 rounded-lg">
                          <span className="text-xs text-amber-400">Next Follow-up: {formatDate(selectedWorkflow.nextFollowupAt)}</span>
                        </div>
                      )}
                      {selectedWorkflow?.isCompleted && (
                        <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-800/40 px-3 py-1.5 rounded-lg">
                          <span className="text-xs text-emerald-400">✅ Workflow Completed</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {panelLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="p-5">
                      {/* Stage Progress Stepper */}
                      <div className="mb-6">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Workflow Progress</h3>
                        <div className="flex items-center gap-0">
                          {STAGES.map((stage, idx) => {
                            const currentIdx = STAGES.findIndex((s) => s.key === selectedWorkflow?.currentStage);
                            const isDone = currentIdx >= 0 && idx < currentIdx;
                            const isCurrent = stage.key === selectedWorkflow?.currentStage;
                            const isFuture = currentIdx === -1 || idx > currentIdx;

                            return (
                              <div key={stage.key} className="flex items-center flex-1">
                                <div className="flex flex-col items-center shrink-0">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300"
                                    style={{
                                      background: isDone
                                        ? "#10b981"
                                        : isCurrent
                                        ? stage.color
                                        : "#1e293b",
                                      border: `2px solid ${isDone ? "#10b981" : isCurrent ? stage.color : "#334155"}`,
                                      boxShadow: isCurrent ? `0 0 12px ${stage.color}60` : "none",
                                    }}
                                  >
                                    {isDone ? "✓" : <span className="text-white text-xs">{idx + 1}</span>}
                                  </div>
                                  <p className={`text-xs mt-1 text-center max-w-16 leading-tight ${isCurrent ? "text-white font-medium" : isFuture ? "text-slate-600" : "text-slate-400"}`}>
                                    {stage.label.split(" ")[0]}
                                  </p>
                                </div>
                                {idx < STAGES.length - 1 && (
                                  <div className="flex-1 h-0.5 mx-1 -mt-2.5" style={{ background: isDone ? "#10b981" : "#1e293b" }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {/* Left: Action Panel */}
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                            {!selectedWorkflow?.currentStage ? "Start Workflow" : `Stage: ${STAGE_LABELS[currentStage]}`}
                          </h3>

                          {/* STAGE 1: Info */}
                          {(currentStage === "info" || !selectedWorkflow?.currentStage) && (
                            <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                                <p className="text-sm font-medium text-indigo-300">Send Information Email</p>
                              </div>
                              <p className="text-xs text-slate-500">From: info@tmsvisa.com</p>

                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Select Program Template</label>
                                <select
                                  value={selectedTemplate}
                                  onChange={(e) => setSelectedTemplate(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="">Select template...</option>
                                  {stageTemplates.map((t) => (
                                    <option key={t._id} value={t._id}>{t.name}</option>
                                  ))}
                                  {stageTemplates.length === 0 && (
                                    <option disabled>No templates — add in Templates tab</option>
                                  )}
                                </select>
                              </div>

                              <button
                                onClick={handleSendEmail}
                                disabled={sendingEmail || !selectedTemplate}
                                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                              >
                                {sendingEmail ? "Sending..." : "Send Info Email"}
                              </button>
                            </div>
                          )}

                          {/* STAGE 2: Agreement */}
                          {currentStage === "agreement" && (
                            <div className="bg-purple-950/30 border border-purple-900/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-purple-400" />
                                <p className="text-sm font-medium text-purple-300">Send Agreement</p>
                              </div>
                              <p className="text-xs text-slate-500">From: compliance@tmsvisa.com</p>

                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Agreement Template</label>
                                <select
                                  value={selectedTemplate}
                                  onChange={(e) => setSelectedTemplate(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                >
                                  <option value="">Select template...</option>
                                  {stageTemplates.map((t) => (
                                    <option key={t._id} value={t._id}>{t.name}</option>
                                  ))}
                                  {stageTemplates.length === 0 && <option disabled>No templates</option>}
                                </select>
                              </div>

                              {stageTemplates.length === 0 && (
                                <button
                                  onClick={() => {
                                    setTplStage("agreement");
                                    setTplMailbox("compliance@tmsvisa.com");
                                    setTplName("");
                                    setTplSubject("");
                                    setTplHtml("");
                                    setTplProgram("");
                                    setTplAttachments([]);
                                    setShowTemplateForm(true);
                                    setActiveTab("templates");
                                  }}
                                  className="w-full py-2 px-3 rounded-lg text-xs text-purple-300 border border-purple-800/50 hover:border-purple-600 hover:bg-purple-950/30 transition-colors text-center"
                                >
                                  + Create Agreement Template
                                </button>
                              )}

                              <button
                                onClick={handleSendEmail}
                                disabled={sendingEmail || !selectedTemplate}
                                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, #7c3aed, #9333ea)" }}
                              >
                                {sendingEmail ? "Sending..." : "Send Agreement Email"}
                              </button>
                            </div>
                          )}

                          {/* STAGE 3: Invoice */}
                          {currentStage === "invoice" && (
                            <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                <p className="text-sm font-medium text-amber-300">Generate & Send Invoice</p>
                              </div>
                              <p className="text-xs text-slate-500">From: sales@tmsvisa.com</p>

                              {pendingInvoice && (
                                <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3 text-sm">
                                  <p className="text-amber-300 font-medium">{pendingInvoice.invoiceNumber}</p>
                                  <p className="text-amber-200">{pendingInvoice.currency} {pendingInvoice.amount}</p>
                                  <a href={pendingInvoice.paymentLink} target="_blank" className="text-blue-400 text-xs hover:underline truncate block">{pendingInvoice.paymentLink}</a>
                                </div>
                              )}

                              {!showInvoiceForm ? (
                                <button
                                  onClick={() => setShowInvoiceForm(true)}
                                  className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-200"
                                  style={{ background: "linear-gradient(135deg, #d97706, #b45309)" }}
                                >
                                  + Create Invoice
                                </button>
                              ) : (
                                <div className="space-y-3 border border-amber-900/30 rounded-lg p-3 bg-amber-950/20">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs text-slate-400 mb-1 block">Amount *</label>
                                      <input
                                        type="number"
                                        placeholder="e.g. 300"
                                        value={invoiceAmount}
                                        onChange={(e) => setInvoiceAmount(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-400 mb-1 block">Currency</label>
                                      <select
                                        value={invoiceCurrency}
                                        onChange={(e) => setInvoiceCurrency(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                      >
                                        <option>AUD</option>
                                        <option>USD</option>
                                        <option>CAD</option>
                                        <option>EUR</option>
                                        <option>GBP</option>
                                        <option>INR</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Payment Link * <span className="text-amber-500">(unique per invoice)</span></label>
                                    <input
                                      type="url"
                                      placeholder="https://pay.example.com/..."
                                      value={invoicePaymentLink}
                                      onChange={(e) => setInvoicePaymentLink(e.target.value)}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                                    <input
                                      type="date"
                                      value={invoiceDueDate}
                                      onChange={(e) => setInvoiceDueDate(e.target.value)}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Remarks</label>
                                    <input
                                      type="text"
                                      placeholder="Optional notes..."
                                      value={invoiceRemarks}
                                      onChange={(e) => setInvoiceRemarks(e.target.value)}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setShowInvoiceForm(false)}
                                      className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-slate-400 border border-slate-700 hover:border-slate-500 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleCreateInvoice}
                                      disabled={creatingInvoice}
                                      className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                      style={{ background: "linear-gradient(135deg, #d97706, #b45309)" }}
                                    >
                                      {creatingInvoice ? "Sending..." : "Send Invoice"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* STAGE 4: Payment Confirmation */}
                          {currentStage === "payment_confirmation" && (
                            <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                <p className="text-sm font-medium text-emerald-300">Payment Confirmation</p>
                              </div>
                              <p className="text-xs text-slate-500">From: sales@tmsvisa.com</p>

                              {pendingInvoice ? (
                                <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Invoice:</span>
                                    <span className="text-emerald-300 font-medium">{pendingInvoice.invoiceNumber}</span>
                                  </div>
                                  <div className="flex justify-between text-sm mt-1">
                                    <span className="text-slate-400">Amount:</span>
                                    <span className="text-white font-bold">{pendingInvoice.currency} {pendingInvoice.amount}</span>
                                  </div>
                                  <div className="flex justify-between text-sm mt-1">
                                    <span className="text-slate-400">Status:</span>
                                    <span className="text-amber-400">⏳ Pending</span>
                                  </div>
                                  <button
                                    onClick={handlePaymentReceived}
                                    disabled={advancingStage}
                                    className="w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 transition-colors"
                                  >
                                    {advancingStage ? "Processing..." : "✓ Mark as Paid"}
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">Awaiting payment...</p>
                              )}

                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Payment Template</label>
                                <select
                                  value={selectedTemplate}
                                  onChange={(e) => setSelectedTemplate(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                >
                                  <option value="">Select template...</option>
                                  {stageTemplates.map((t) => (
                                    <option key={t._id} value={t._id}>{t.name}</option>
                                  ))}
                                  {stageTemplates.length === 0 && <option disabled>No templates</option>}
                                </select>
                              </div>

                              {stageTemplates.length === 0 && (
                                <button
                                  onClick={() => {
                                    setTplStage("payment_confirmation");
                                    setTplMailbox("sales@tmsvisa.com");
                                    setTplName("");
                                    setTplSubject("");
                                    setTplHtml("");
                                    setTplProgram("");
                                    setTplAttachments([]);
                                    setShowTemplateForm(true);
                                    setActiveTab("templates");
                                  }}
                                  className="w-full py-2 px-3 rounded-lg text-xs text-emerald-300 border border-emerald-800/50 hover:border-emerald-600 hover:bg-emerald-950/30 transition-colors text-center"
                                >
                                  + Create Payment Template
                                </button>
                              )}

                              <button
                                onClick={handleSendEmail}
                                disabled={sendingEmail || !selectedTemplate}
                                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
                              >
                                {sendingEmail ? "Sending..." : "Send Payment Confirmation"}
                              </button>
                            </div>
                          )}

                          {/* STAGE 5: Case Manager */}
                          {currentStage === "case_manager" && (
                            <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-blue-400" />
                                <p className="text-sm font-medium text-blue-300">Case Manager Introduction</p>
                              </div>
                              <p className="text-xs text-slate-500">From: sumit.recruiter@tmsvisa.com</p>

                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Intro Template (optional)</label>
                                <select
                                  value={selectedTemplate}
                                  onChange={(e) => setSelectedTemplate(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                >
                                  <option value="">Use default intro email</option>
                                  {stageTemplates.map((t) => (
                                    <option key={t._id} value={t._id}>{t.name}</option>
                                  ))}
                                </select>
                              </div>

                              {stageTemplates.length === 0 && (
                                <button
                                  onClick={() => {
                                    setTplStage("case_manager");
                                    setTplMailbox("sumit.recruiter@tmsvisa.com");
                                    setTplName("");
                                    setTplSubject("");
                                    setTplHtml("");
                                    setTplProgram("");
                                    setTplAttachments([]);
                                    setShowTemplateForm(true);
                                    setActiveTab("templates");
                                  }}
                                  className="w-full py-2 px-3 rounded-lg text-xs text-blue-300 border border-blue-800/50 hover:border-blue-600 hover:bg-blue-950/30 transition-colors text-center"
                                >
                                  + Create Case Manager Intro Template
                                </button>
                              )}

                              <button
                                onClick={handleSendEmail}
                                disabled={sendingEmail}
                                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
                              >
                                {sendingEmail ? "Sending..." : "Send Case Manager Intro"}
                              </button>
                            </div>
                          )}


                          {/* Move Stage Button */}
                          {nextStageInfo && selectedWorkflow?.currentStage && !selectedWorkflow.isCompleted && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                              <p className="text-xs text-slate-500 mb-2">Client ready to proceed?</p>
                              <button
                                onClick={handleAdvanceStage}
                                disabled={advancingStage}
                                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:border-indigo-600 hover:text-indigo-300 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {advancingStage ? "..." : (
                                  <>
                                    Move to <span style={{ color: nextStageInfo.color }}>{nextStageInfo.label}</span> →
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Right: Email History */}
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Email History</h3>

                          {emailHistory.length === 0 ? (
                            <div className="text-center py-10 text-slate-600">
                              <p className="text-3xl mb-2">📭</p>
                              <p className="text-sm">No emails sent yet</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                              {emailHistory.map((h) => {
                                const stageInfo = getStageInfo(h.stage);
                                return (
                                  <div
                                    key={h._id}
                                    onClick={() => setSelectedHistoryEmail(h)}
                                    className={`p-3 rounded-lg border transition-all cursor-pointer hover:border-slate-500 hover:bg-slate-900/60 ${
                                      h.cancelled
                                        ? "border-slate-800/50 bg-slate-900/20 opacity-50"
                                        : "border-slate-800 bg-slate-900/40"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span
                                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                                            style={{ background: `${stageInfo.color}20`, color: stageInfo.color }}
                                          >
                                            {stageInfo.label}
                                          </span>
                                          {h.isFollowup && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400">
                                              Follow-up #{h.followupNumber}
                                            </span>
                                          )}
                                          {h.cancelled && (
                                            <span className="text-xs text-slate-600">cancelled</span>
                                          )}
                                        </div>
                                        <p className="text-xs text-slate-300 mt-1 font-medium truncate">{h.templateName}</p>
                                        <p className="text-xs text-slate-500 truncate">{h.mailbox}</p>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-xs text-slate-500">{formatDateTime(h.sentAt)}</p>
                                        <span className={`text-xs ${h.status === "sent" ? "text-emerald-400" : h.status === "simulated" ? "text-amber-400" : "text-red-400"}`}>
                                          {h.status === "simulated" ? "⚠ queued" : h.status === "sent" ? "✓ sent" : "✗ failed"}
                                        </span>
                                        <p className="text-xs text-slate-600">by {h.sentByName}</p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* TAB: Mailboxes */}
        {/* ═══════════════════════════════════════ */}
        {activeTab === "mailboxes" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Mailboxes</h2>
              <button
                onClick={() => setShowMailboxForm(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                + Add Mailbox
              </button>
            </div>

            {showMailboxForm && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 mb-4">
                <h3 className="text-sm font-semibold text-white mb-4">New Mailbox</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Email Address *</label>
                    <input type="email" placeholder="info@tmsvisa.com" value={mbEmail} onChange={(e) => setMbEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Display Name *</label>
                    <input type="text" placeholder="TMS Visa — Info" value={mbDisplayName} onChange={(e) => setMbDisplayName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Purpose *</label>
                    <input type="text" placeholder="Information emails" value={mbPurpose} onChange={(e) => setMbPurpose(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowMailboxForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-700 hover:border-slate-500">Cancel</button>
                  <button onClick={handleSaveMailbox} disabled={savingMailbox} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    {savingMailbox ? "Saving..." : "Save Mailbox"}
                  </button>
                </div>
              </div>
            )}

            {/* Default mailboxes info */}
            <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4 mb-4">
              <p className="text-xs text-indigo-400 font-medium mb-2">Default System Mailboxes (configured via SMTP env vars)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { email: "info@tmsvisa.com", purpose: "Information Emails", stage: "Stage 1" },
                  { email: "compliance@tmsvisa.com", purpose: "Agreement Emails", stage: "Stage 2" },
                  { email: "sales@tmsvisa.com", purpose: "Invoice & Payment", stage: "Stage 3 & 4" },
                  { email: "sumit.recruiter@tmsvisa.com", purpose: "Case Manager Intro", stage: "Stage 5" },
                ].map((mb) => (
                  <div key={mb.email} className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                    <p className="text-xs font-medium text-white truncate">{mb.email}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{mb.purpose}</p>
                    <span className="text-xs text-indigo-400">{mb.stage}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {mailboxes.length === 0 ? (
                <div className="text-center py-16 text-slate-600">
                  <p className="text-4xl mb-3">📭</p>
                  <p>No custom mailboxes added yet</p>
                </div>
              ) : (
                mailboxes.map((mb) => (
                  <div key={mb._id} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{mb.email}</p>
                      <p className="text-sm text-slate-400">{mb.displayName}</p>
                      <p className="text-xs text-slate-500">{mb.purpose}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${mb.isActive ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
                        {mb.isActive ? "Active" : "Inactive"}
                      </span>
                      <button onClick={() => handleDeleteMailbox(mb._id)} className="text-red-500 hover:text-red-400 text-xs">Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* TAB: Templates */}
        {/* ═══════════════════════════════════════ */}
        {activeTab === "templates" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Email Templates</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowTemplateForm(true);
                    setShowFollowupTemplateForm(false);
                    setEditingTemplateId(null);
                    setTplName("");
                    setTplSubject("");
                    setTplHtml("");
                    setTplProgram("");
                    setTplAttachments([]);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                >
                  + Add Template
                </button>
                <button
                  onClick={() => {
                    setShowFollowupTemplateForm(true);
                    setShowTemplateForm(false);
                    setEditingTemplateId(null);
                    setTplStage("info");
                    setTplMailbox("info@tmsvisa.com");
                    setTplName("");
                    setTplSubject("");
                    setTplHtml("");
                    setTplParentTemplateId("");
                    setTplAttachments([]);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white border border-indigo-500 hover:bg-indigo-900/30 transition-colors"
                >
                  + Add Follow Ups Templates
                </button>
              </div>
            </div>

            {showTemplateForm && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 mb-4">
                <h3 className="text-sm font-semibold text-white mb-4">New Template</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Template Name *</label>
                    <input type="text" placeholder="Australia 482 Info Email" value={tplName} onChange={(e) => setTplName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Program / Visa Type</label>
                    <input type="text" placeholder="Australia 482" value={tplProgram} onChange={(e) => setTplProgram(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Stage *</label>
                    <select value={tplStage} onChange={(e) => {
                      setTplStage(e.target.value as EmailStage);
                      setTplMailbox(STAGES.find(s => s.key === e.target.value)?.mailbox || "info@tmsvisa.com");
                    }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Mailbox *</label>
                    <input type="text" value={tplMailbox} onChange={(e) => setTplMailbox(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs text-slate-400 mb-1 block">Subject *</label>
                  <input type="text" placeholder="Your {{Program}} Visa Application — Next Steps" value={tplSubject} onChange={(e) => setTplSubject(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="mb-3">
                  <label className="text-xs text-slate-400 mb-1 block">
                    Body (HTML) * — Variables: <code className="text-indigo-400 text-xs">{"{{CandidateName}}"}</code>, <code className="text-indigo-400 text-xs">{"{{Program}}"}</code>, <code className="text-indigo-400 text-xs">{"{{PaymentLink}}"}</code>, <code className="text-indigo-400 text-xs">{"{{InvoiceAmount}}"}</code>
                  </label>
                  <textarea rows={8} placeholder="<p>Dear {{CandidateName}},</p><p>...</p>" value={tplHtml} onChange={(e) => setTplHtml(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 resize-y" />
                </div>
                {/* Attachments Section */}
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-2 block">Attachments</label>
                  <div className="flex flex-col gap-2">
                    {tplAttachments.map((att) => (
                      <div key={att.fileId} className="flex items-center justify-between bg-slate-800 p-2 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-300 truncate max-w-[200px]">{att.fileName}</span>
                        <button onClick={() => removeAttachment(att.fileId)} className="text-red-400 hover:text-red-300 text-xs px-2">Remove</button>
                      </div>
                    ))}
                    <div className="relative mt-1">
                      <input type="file" onChange={handleUploadAttachment} disabled={uploadingAttachment} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                      <div className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 transition-colors bg-slate-900/30">
                        {uploadingAttachment ? "Uploading..." : "+ Add Attachment"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setShowTemplateForm(false);
                    setEditingTemplateId(null);
                    setTplName("");
                    setTplSubject("");
                    setTplHtml("");
                    setTplProgram("");
                    setTplAttachments([]);
                  }} className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-700 hover:border-slate-500">Cancel</button>
                  <button onClick={handleSaveTemplate} disabled={savingTemplate} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    {savingTemplate ? "Saving..." : "Save Template"}
                  </button>
                </div>
              </div>
            )}

            {showFollowupTemplateForm && (
              <div className="bg-indigo-950/40 border border-indigo-900/50 rounded-xl p-5 mb-4">
                <h3 className="text-sm font-semibold text-white mb-4">New Follow-up Template</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Template Name *</label>
                    <input type="text" placeholder="e.g. 482 - Follow-up" value={tplName} onChange={(e) => setTplName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Parent Template (Information) *</label>
                    <select value={tplParentTemplateId} onChange={(e) => {
                      const newId = e.target.value;
                      setTplParentTemplateId(newId);
                      const parentTpl = templates.find(t => t._id === newId);
                      if (parentTpl) {
                        setTplSubject(parentTpl.subject);
                      }
                    }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      <option value="" onClick={() => {
                        setTplParentTemplateId("");
                        setTplSubject("");
                      }}>Select a template...</option>
                      {templates.filter(t => t.stage === "info" && !t.isFollowup).map(t => (
                        <option key={t._id} value={t._id} onClick={() => {
                          setTplParentTemplateId(t._id);
                          setTplSubject(t.subject);
                        }}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                </div>
                <div className="mb-3">
                  <label className="text-xs text-slate-400 mb-1 block">Subject *</label>
                  <input type="text" value={tplSubject} onChange={(e) => setTplSubject(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    Body (HTML) *
                    <span className="text-indigo-400">Available vars: {'{{CandidateName}}'}, {'{{Program}}'}</span>
                  </label>
                  <textarea value={tplHtml} placeholder="<p>Dear {{CandidateName}},</p><p>...</p>" onChange={(e) => setTplHtml(e.target.value)} rows={6}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
                <div className="mb-6">
                  <label className="text-xs text-slate-400 mb-2 block">Attachments</label>
                  <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                    {tplAttachments.map((att) => (
                      <div key={att.fileId} className="flex items-center justify-between bg-slate-800 p-2 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-300 truncate max-w-[200px]">{att.fileName}</span>
                        <button onClick={() => removeAttachment(att.fileId)} className="text-red-400 hover:text-red-300 text-xs px-2">Remove</button>
                      </div>
                    ))}
                    <div className="relative mt-1">
                      <input type="file" onChange={handleUploadAttachment} disabled={uploadingAttachment} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                      <div className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 transition-colors bg-slate-900/30">
                        {uploadingAttachment ? "Uploading..." : "+ Add Attachment"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setShowFollowupTemplateForm(false);
                    setEditingTemplateId(null);
                    setTplName("");
                    setTplSubject("");
                    setTplHtml("");
                    setTplProgram("");
                    setTplParentTemplateId("");
                    setTplAttachments([]);
                  }} className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-700 hover:border-slate-500">Cancel</button>
                  <button onClick={handleSaveTemplate} disabled={savingTemplate} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    {savingTemplate ? "Saving..." : "Save Follow-up Template"}
                  </button>
                </div>
              </div>
            )}

            {/* Templates grouped by stage */}
            {STAGES.map((stage) => {
              const stageTpls = templates.filter((t) => t.stage === stage.key);
              if (stageTpls.length === 0) return null;
              return (
                <div key={stage.key} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                    <h3 className="text-sm font-semibold text-slate-300">{stage.label}</h3>
                    <span className="text-xs text-slate-600">({stage.mailbox})</span>
                  </div>
                  <div className="grid gap-2">
                    {stageTpls.map((t) => (
                      <div key={t._id} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white text-sm">{t.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{t.subject}</p>
                          {t.isFollowup && (
                            <p className="text-xs text-emerald-400 mt-1 font-semibold">
                              Linked to: {templates.find(pt => pt._id === t.parentTemplateId)?.name || "Unknown"}
                            </p>
                          )}
                          {t.program && <p className="text-xs text-indigo-400 mt-0.5">🔹 {t.program}</p>}
                        </div>
                        <div className="flex gap-3 shrink-0 items-center">
                          <button onClick={() => handleEditTemplate(t)} className="text-indigo-400 hover:text-indigo-300 text-xs font-medium">Edit</button>
                          <button onClick={() => handleDeleteTemplate(t._id)} className="text-red-500 hover:text-red-400 text-xs font-medium">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {templates.length === 0 && !showTemplateForm && (
              <div className="text-center py-16 text-slate-600">
                <p className="text-4xl mb-3">📝</p>
                <p>No templates yet. Click &quot;+ Add Template&quot; to get started.</p>
              </div>
            )}
          </div>
        )}

        {selectedHistoryEmail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-4">
                  <h3 className="font-semibold text-white text-base truncate">
                    {selectedHistoryEmail.subject}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sent on {formatDateTime(selectedHistoryEmail.sentAt)} by {selectedHistoryEmail.sentByName}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedHistoryEmail(null)} 
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1 bg-white text-black min-h-[300px]">
                {selectedHistoryEmail.body ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedHistoryEmail.body }} />
                ) : (
                  <div className="text-slate-500 italic p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <p className="text-sm font-medium text-slate-700 mb-1">No email body saved</p>
                    <p className="text-xs text-slate-400">This is a legacy record. The full body is only saved for newly sent emails.</p>
                    <div className="mt-4 p-3 bg-white border border-slate-200 rounded text-left not-italic font-normal text-xs text-slate-600 max-h-[150px] overflow-y-auto">
                      <strong>Preview:</strong> {selectedHistoryEmail.bodyPreview}...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function EmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <EmailPageInner />
    </Suspense>
  );
}
