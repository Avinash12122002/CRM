import nodemailer from "nodemailer";
import { connectToDatabase } from "./mongodb";
import { ObjectId } from "mongodb";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type EmailStage =
  | "info"
  | "agreement"
  | "invoice"
  | "payment_confirmation"
  | "case_manager";

export const STAGE_ORDER: EmailStage[] = [
  "info",
  "agreement",
  "invoice",
  "payment_confirmation",
  "case_manager",
];

export const STAGE_LABELS: Record<EmailStage, string> = {
  info: "Information",
  agreement: "Agreement",
  invoice: "Invoice",
  payment_confirmation: "Payment Confirmation",
  case_manager: "Case Manager Intro",
};

export const STAGE_MAILBOXES: Record<EmailStage, string> = {
  info: "info@tmsvisa.com",
  agreement: "compliance@tmsvisa.com",
  invoice: "sales@tmsvisa.com",
  payment_confirmation: "sales@tmsvisa.com",
  case_manager: "sumit.recruiter@tmsvisa.com",
};

// ─────────────────────────────────────────────
// SMTP Transport (per-mailbox credentials)
// ─────────────────────────────────────────────
//
// Each tmsvisa.com mailbox has its own Hostinger SMTP login.
// Set SMTP_PASS_INFO / SMTP_PASS_COMPLIANCE / SMTP_PASS_SALES / SMTP_PASS_CASE
// in your .env file.  The SMTP_HOST / SMTP_PORT / SMTP_SECURE are shared
// because all mailboxes live on the same Hostinger server.

function getMailboxCredentials(mailbox: string): { user: string; pass: string } {
  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  void host; // used in createTransport below

  // Map each stage mailbox to its own env var pair
  const credMap: Record<string, { userEnv: string; passEnv: string }> = {
    "info@tmsvisa.com": {
      userEnv: "SMTP_USER_INFO",
      passEnv: "SMTP_PASS_INFO",
    },
    "compliance@tmsvisa.com": {
      userEnv: "SMTP_USER_COMPLIANCE",
      passEnv: "SMTP_PASS_COMPLIANCE",
    },
    "sales@tmsvisa.com": {
      userEnv: "SMTP_USER_SALES",
      passEnv: "SMTP_PASS_SALES",
    },
    "sumit.recruiter@tmsvisa.com": {
      userEnv: "SMTP_USER_CASE",
      passEnv: "SMTP_PASS_CASE",
    },
  };

  const entry = credMap[mailbox];
  if (entry) {
    const user = process.env[entry.userEnv] || mailbox;
    const pass = process.env[entry.passEnv] || "";
    if (pass) return { user, pass };
  }

  // Fallback: use the global SMTP_USER / SMTP_PASS
  return {
    user: process.env.SMTP_USER || mailbox,
    pass: process.env.SMTP_PASS || "",
  };
}

export function createTransport(mailboxEmail: string) {
  const creds = getMailboxCredentials(mailboxEmail);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: creds.user,
      pass: creds.pass,
    },
  });
}

// ─────────────────────────────────────────────
// Template Variable Replacement
// ─────────────────────────────────────────────

export function replaceTemplateVars(
  template: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vars: Record<string, any>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
  });
}

// ─────────────────────────────────────────────
// Send Email
// ─────────────────────────────────────────────

export interface SendEmailOptions {
  from: string;     // Stage-specific mailbox — e.g. compliance@tmsvisa.com
  fromName?: string;
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export async function sendEmail(options: SendEmailOptions) {
  // Guard: no recipient email address
  if (!options.to || options.to.trim() === "") {
    console.warn("[Email] Cannot send — lead has no email address.");
    return { success: false, simulated: false, failed: true, error: "Lead has no email address on file." };
  }

  // Resolve credentials for this specific mailbox
  const creds = getMailboxCredentials(options.from);
  const smtpHost = process.env.SMTP_HOST;

  // Simulate if SMTP not configured at all
  const isPlaceholder = !smtpHost || !creds.pass || creds.pass === "your_smtp_password_here";

  if (isPlaceholder) {
    console.log(`[Email] SMTP not configured for ${options.from} — simulating send to ${options.to}`);
    return { success: true, simulated: true, failed: false };
  }

  // Each mailbox authenticates with its own Hostinger credentials.
  // Because creds.user === options.from, Hostinger accepts the From header.
  try {
    const transporter = createTransport(options.from);
    await transporter.sendMail({
      from: options.fromName
        ? `"${options.fromName}" <${creds.user}>`
        : creds.user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });
    console.log(`[Email] ✓ Sent  from=${creds.user}  to=${options.to}  subject="${options.subject}"`);
    return { success: true, simulated: false, failed: false };
  } catch (err) {
    // Real SMTP failure — show as "failed" in email history (not "simulated")
    console.error(`[Email] ✗ SMTP failure for ${options.from}:`, err);
    return { success: false, simulated: false, failed: true, error: String(err) };
  }
}

// ─────────────────────────────────────────────
// Lead Workflow Helpers
// ─────────────────────────────────────────────

export async function getLeadWorkflow(leadId: number) {
  const { db } = await connectToDatabase();
  return db.collection("lead_workflows").findOne({ leadId });
}

export async function createOrGetLeadWorkflow(leadId: number) {
  const { db } = await connectToDatabase();
  const existing = await db.collection("lead_workflows").findOne({ leadId });
  if (existing) return existing;

  const doc = {
    leadId,
    currentStage: null as EmailStage | null,
    workflowId: null,
    workflowName: null,
    followupCount: 0,
    nextFollowupAt: null,
    lastEmailAt: null,
    stageStartedAt: null,
    isCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("lead_workflows").insertOne(doc);
  return doc;
}

export async function advanceLeadStage(
  leadId: number,
  newStage: EmailStage,
  workflowName?: string | null,
  initialTemplateId?: string | null
) {
  const { db } = await connectToDatabase();

  const followupDays = 3;
  const nextFollowupAt = new Date();
  nextFollowupAt.setDate(nextFollowupAt.getDate() + followupDays);

  // Cancel any pending followups for previous stage
  await db.collection("email_history").updateMany(
    { leadId, isPendingFollowup: true, cancelled: { $ne: true } },
    { $set: { cancelled: true, cancelledAt: new Date() } }
  );

  await db.collection("lead_workflows").updateOne(
    { leadId },
    {
      $set: {
        currentStage: newStage,
        workflowName: workflowName || null,
        initialTemplateId: initialTemplateId || null,
        followupCount: 0,
        nextFollowupAt: newStage === "info" ? nextFollowupAt : null,
        stageStartedAt: new Date(),
        updatedAt: new Date(),
      },
      $setOnInsert: { leadId, createdAt: new Date() },
    },
    { upsert: true }
  );
}

export async function scheduleNextFollowup(leadId: number) {
  const { db } = await connectToDatabase();
  
  const wf = await db.collection("lead_workflows").findOne({ leadId });
  if (!wf || wf.currentStage !== "info") return;

  const count = wf.followupCount || 0;
  let daysFromNow = 0;
  
  if (count === 0) daysFromNow = 3;
  else if (count === 1) daysFromNow = 7;
  else if (count === 2) daysFromNow = 14;
  else if (count === 3) daysFromNow = 30;
  else {
    // Stop after 4th followup
    await db.collection("lead_workflows").updateOne(
      { leadId },
      { $set: { nextFollowupAt: null, updatedAt: new Date() } }
    );
    return;
  }

  const nextFollowupAt = new Date();
  nextFollowupAt.setDate(nextFollowupAt.getDate() + daysFromNow);

  await db.collection("lead_workflows").updateOne(
    { leadId },
    {
      $set: { nextFollowupAt, updatedAt: new Date() },
      $inc: { followupCount: 1 },
    }
  );
}

// ─────────────────────────────────────────────
// Record Email in History
// ─────────────────────────────────────────────

export interface EmailHistoryRecord {
  leadId: number;
  leadName: string;
  stage: EmailStage;
  mailbox: string;
  templateId?: string;
  templateName: string;
  subject: string;
  bodyPreview: string;
  status: "sent" | "failed" | "simulated";
  isFollowup: boolean;
  followupNumber: number;
  isPendingFollowup: boolean;
  cancelled: boolean;
  sentAt: Date;
  sentBy: number;
  sentByName: string;
  invoiceId?: string;
}

export async function recordEmailHistory(record: EmailHistoryRecord) {
  const { db } = await connectToDatabase();
  const result = await db.collection("email_history").insertOne({
    ...record,
    _id: new ObjectId(),
    createdAt: new Date(),
  });
  return result;
}

// ─────────────────────────────────────────────
// Cron: Process Due Follow-ups
// ─────────────────────────────────────────────

export async function processDueFollowups() {
  const { db } = await connectToDatabase();
  const now = new Date();

  // Find all lead workflows with a due follow-up
  const dueWorkflows = await db
    .collection("lead_workflows")
    .find({
      nextFollowupAt: { $lte: now },
      currentStage: "info", // Only process followups for information stage
      isCompleted: false,
    })
    .toArray();

  const results = [];

  for (const wf of dueWorkflows) {
    try {
      // Get the lead info
      const lead = await db.collection("leads").findOne({ id: wf.leadId });
      if (!lead) continue;

      const stage = wf.currentStage as EmailStage;
      const mailbox = STAGE_MAILBOXES[stage];
      const followupNum = wf.followupCount || 1; // Since scheduleNextFollowup increments immediately after send, this will be 1, 2, 3, 4
      const stageLabel = STAGE_LABELS[stage];

      let subject = `Follow-up ${followupNum}: ${stageLabel} — ${lead.name}`;
      let html = `
        <p>Dear ${lead.name},</p>
        <p>This is a follow-up regarding your <strong>${stageLabel}</strong>.</p>
        <p>Please let us know if you have any questions or are ready to proceed.</p>
        <p>Regards,<br/>TMS Visa Team</p>
      `;
      let emailAttachments: { filename: string; content: Buffer; contentType: string }[] | undefined;

      // Look for a custom follow-up template linked to the initial template
      if (wf.initialTemplateId) {
        const customTemplate = await db.collection("email_templates").findOne({
          isFollowup: true,
          parentTemplateId: wf.initialTemplateId
        });

        if (customTemplate) {
          const vars = {
            CandidateName: lead.name || "",
            Program: wf.workflowName || lead.program || "",
            CompanyName: "TMS Visa",
          };

          // Replace variables and prepend followup number to subject
          subject = `Follow-up ${followupNum}: ${customTemplate.subject}`;
          html = customTemplate.html;
          for (const [key, value] of Object.entries(vars)) {
            const regex = new RegExp(`{{${key}}}`, "g");
            subject = subject.replace(regex, String(value));
            html = html.replace(regex, String(value));
          }

          // Process attachments
          if (customTemplate.attachments && customTemplate.attachments.length > 0) {
            emailAttachments = [];
            try {
              const { getGridFSBucket } = await import("@/lib/gridfs");
              const bucket = await getGridFSBucket();
              for (const att of customTemplate.attachments) {
                const fileStream = bucket.openDownloadStream(new ObjectId(att.fileId));
                const chunks: Buffer[] = [];
                for await (const chunk of fileStream) {
                  chunks.push(Buffer.from(chunk));
                }
                emailAttachments.push({
                  filename: att.fileName,
                  content: Buffer.concat(chunks),
                  contentType: att.mimeType,
                });
              }
            } catch (err) {
              console.error("Failed to fetch follow-up attachments:", err);
            }
          }
        }
      }

      const sendResult = await sendEmail({
        from: mailbox,
        fromName: "TMS Visa",
        to: lead.email,
        subject,
        html,
        attachments: emailAttachments,
      });

      // Record in history
      await recordEmailHistory({
        leadId: wf.leadId,
        leadName: lead.name,
        stage,
        mailbox,
        templateName: `Auto Follow-up ${followupNum}`,
        subject,
        bodyPreview: `Follow-up ${followupNum} for ${stageLabel}`,
        status: sendResult.failed ? "failed" : sendResult.simulated ? "simulated" : "sent",
        isFollowup: true,
        followupNumber: followupNum,
        isPendingFollowup: false,
        cancelled: false,
        sentAt: new Date(),
        sentBy: 0,
        sentByName: "System",
      });

      // Schedule next follow-up
      await scheduleNextFollowup(wf.leadId);

      results.push({ leadId: wf.leadId, success: true, followupNum });
    } catch (err) {
      results.push({ leadId: wf.leadId, success: false, error: String(err) });
    }
  }

  return results;
}
