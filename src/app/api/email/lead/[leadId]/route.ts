import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getGridFSBucket } from "@/lib/gridfs";
import { ObjectId } from "mongodb";
import {
  sendEmail,
  recordEmailHistory,
  advanceLeadStage,
  scheduleNextFollowup,
  replaceTemplateVars,
  STAGE_MAILBOXES,
  STAGE_LABELS,
  STAGE_ORDER,
  type EmailStage,
} from "@/lib/email";

async function getAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

// GET /api/email/lead/[leadId] - Full workflow state + email history
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId } = await params;
    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: parseInt(leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const workflow = await db.collection("lead_workflows").findOne({ leadId: parseInt(leadId) });

    const history = await db
      .collection("email_history")
      .find({ leadId: parseInt(leadId) })
      .sort({ sentAt: -1 })
      .toArray();

    const invoices = await db
      .collection("invoices")
      .find({ leadId: parseInt(leadId) })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ lead, workflow: workflow || null, history, invoices });
  } catch (err) {
    console.error("[GET /api/email/lead]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// POST /api/email/lead/[leadId] - Send an email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId } = await params;
    const body = await req.json();
    const { stage, templateId, customSubject, customHtml, workflowName, invoiceId } = body;

    if (!stage) return NextResponse.json({ error: "stage is required" }, { status: 400 });

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: parseInt(leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const mailbox = STAGE_MAILBOXES[stage as EmailStage];
    let subject = customSubject || `${STAGE_LABELS[stage as EmailStage]} — ${lead.name}`;
    let html = customHtml || "";

    // Load and process template if provided
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let template: any = null;
    if (templateId) {
      let templateObjectId;
      try {
        templateObjectId = new ObjectId(templateId);
      } catch {
        return NextResponse.json({ error: "Invalid templateId" }, { status: 400 });
      }

      template = await db
        .collection("email_templates")
        .findOne({ _id: templateObjectId });

      if (template) {
        // Get invoice data if available
        let invoiceData = {};
        if (invoiceId) {
          try {
            const inv = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
            if (inv) {
              invoiceData = {
                InvoiceNumber: inv.invoiceNumber,
                InvoiceAmount: `${inv.currency || "AUD"} ${inv.amount}`,
                PaymentLink: inv.paymentLink || "",
                DueDate: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-AU") : "",
              };
            }
          } catch {
            // invoice not found, continue without it
          }
        }

        const vars = {
          CandidateName: lead.name || "",
          Program: workflowName || lead.program || "",
          CompanyName: "TMS Visa",
          ...invoiceData,
        };

        subject = replaceTemplateVars(template.subject, vars);
        html = replaceTemplateVars(template.html, vars);
      }
    }

    if (!html) {
      html = `<p>Dear ${lead.name || "Candidate"},</p><p>Please see the information regarding your visa application.</p><p>Regards,<br/>TMS Visa Team</p>`;
    }

    // Guard: block send if lead has no email
    if (!lead.email || lead.email.trim() === "") {
      return NextResponse.json(
        { error: "This lead has no email address. Please add an email to their profile first." },
        { status: 400 }
      );
    }

    // Process attachments if template has any
    const emailAttachments: { filename: string; content: Buffer; contentType: string }[] = [];
    if (template && template.attachments && template.attachments.length > 0) {
      try {
        const bucket = await getGridFSBucket();
        for (const att of template.attachments) {
          const fileStream = bucket.openDownloadStream(new ObjectId(att.fileId));
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(Buffer.from(chunk));
          }
          const content = Buffer.concat(chunks);
          emailAttachments.push({
            filename: att.fileName,
            content,
            contentType: att.mimeType,
          });
        }
      } catch (attErr) {
        console.error("Failed to fetch attachments:", attErr);
        // Continue without attachments if it fails, or maybe throw error?
      }
    }

    // Send the email
    const sendResult = await sendEmail({
      from: mailbox,
      fromName: "TMS Visa",
      to: lead.email,
      subject,
      html,
      attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    });

    // Determine status to record
    const emailStatus = sendResult.failed
      ? "failed"
      : sendResult.simulated
      ? "simulated"
      : "sent";

    // Only advance workflow and schedule follow-up if NOT a hard failure
    if (!sendResult.failed) {
      await advanceLeadStage(parseInt(leadId), stage as EmailStage, workflowName, templateId || null);
      if (stage === "info") {
        await scheduleNextFollowup(parseInt(leadId));
      }
    }

    // Record in history
    let templateDoc = null;
    if (templateId) {
      try {
        templateDoc = await db.collection("email_templates").findOne({ _id: new ObjectId(templateId) });
      } catch { /* ignore */ }
    }

    await recordEmailHistory({
      leadId: parseInt(leadId),
      leadName: lead.name || "",
      stage: stage as EmailStage,
      mailbox,
      templateId: templateId || undefined,
      templateName: templateDoc?.name || "Custom Email",
      subject,
      bodyPreview: html.replace(/<[^>]*>/g, "").slice(0, 200),
      status: emailStatus,
      isFollowup: false,
      followupNumber: 0,
      isPendingFollowup: false,
      cancelled: false,
      sentAt: new Date(),
      sentBy: user.id,
      sentByName: user.name,
      body: html,
      invoiceId: invoiceId || undefined,
    });

    if (sendResult.failed) {
      return NextResponse.json(
        { error: sendResult.error || "Email delivery failed", failed: true },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, simulated: sendResult.simulated });
  } catch (err) {
    console.error("[POST /api/email/lead]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// PUT /api/email/lead/[leadId] - Stage actions (advance, payment received, etc.)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId } = await params;
    const body = await req.json();
    const { action, targetStage, workflowName } = body;

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: parseInt(leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (action === "advance_stage") {
      if (!targetStage) return NextResponse.json({ error: "targetStage required" }, { status: 400 });

      await advanceLeadStage(parseInt(leadId), targetStage as EmailStage, workflowName, null);

      // Auto-send for certain stages
      const autoSendStages: EmailStage[] = ["payment_confirmation", "case_manager", "agreement"];
      if (autoSendStages.includes(targetStage as EmailStage)) {
        const mailbox = STAGE_MAILBOXES[targetStage as EmailStage];
        const stageLabel = STAGE_LABELS[targetStage as EmailStage];

        let html = "";
        if (targetStage === "payment_confirmation") {
          const invoice = await db
            .collection("invoices")
            .findOne({ leadId: parseInt(leadId) }, { sort: { createdAt: -1 } });

          html = `
            <p>Dear ${lead.name || "Candidate"},</p>
            <p>We are pleased to confirm that we have received your payment${invoice ? ` of <strong>${invoice.currency || "AUD"} ${invoice.amount}</strong>` : ""}.</p>
            <p>Your application is now being processed. Our team will be in touch shortly with further details.</p>
            <p>Regards,<br/>TMS Visa Team<br/>sales@tmsvisa.com</p>
          `;
        } else if (targetStage === "case_manager") {
          html = `
            <p>Dear ${lead.name || "Candidate"},</p>
            <p>I am Sumit Kumar, and I have been assigned as your dedicated Case Manager for your visa application.</p>
            <p>I will be your primary point of contact throughout the process. Please feel free to reach out to me with any questions or concerns.</p>
            <p>We look forward to working with you!</p>
            <p>Warm regards,<br/>Sumit Kumar<br/>Case Manager — TMS Visa<br/>sumit.recruiter@tmsvisa.com</p>
          `;
        }

        const subject = `${stageLabel} — ${lead.name || "Candidate"}`;
        const sendResult = await sendEmail({
          from: mailbox,
          fromName: "TMS Visa",
          to: lead.email,
          subject,
          html,
        });

        await recordEmailHistory({
          leadId: parseInt(leadId),
          leadName: lead.name || "",
          stage: targetStage as EmailStage,
          mailbox,
          templateName: stageLabel,
          subject,
          bodyPreview: html.replace(/<[^>]*>/g, "").slice(0, 200),
          status: sendResult.simulated ? "simulated" : "sent",
          isFollowup: false,
          followupNumber: 0,
          isPendingFollowup: false,
          cancelled: false,
          sentAt: new Date(),
          sentBy: user.id,
          sentByName: user.name,
          body: html,
        });

        if (targetStage === "info") {
          await scheduleNextFollowup(parseInt(leadId));
        }
      }

      // Mark as completed if last stage
      if (targetStage === STAGE_ORDER[STAGE_ORDER.length - 1]) {
        await db.collection("lead_workflows").updateOne(
          { leadId: parseInt(leadId) },
          { $set: { isCompleted: true, nextFollowupAt: null } }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === "cancel_followups") {
      await db.collection("email_history").updateMany(
        { leadId: parseInt(leadId), isPendingFollowup: true },
        { $set: { cancelled: true, cancelledAt: new Date() } }
      );
      await db.collection("lead_workflows").updateOne(
        { leadId: parseInt(leadId) },
        { $set: { nextFollowupAt: null, updatedAt: new Date() } }
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[PUT /api/email/lead]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
