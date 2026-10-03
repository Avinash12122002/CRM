import fs from "fs";
import path from "path";
import { connectToDatabase } from "@/lib/mongodb";
import { sendEmail, recordEmailHistory } from "@/lib/email";

export interface SendWhatsAppIrelandInfoEmailParams {
  phone: string;
  name?: string;
  email: string;
  leadId?: number;
}

export const DEFAULT_IRELAND_INFO_EMAIL_SUBJECT = "Ireland Work Visa Program (Critical Skills & General Employment) | TMS Visa";

export const DEFAULT_IRELAND_INFO_EMAIL_HTML = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#222;max-width:760px;margin:0;padding:0;">

<p style="margin:0 0 16px 0;">Dear {{CandidateName}},</p>

<p style="margin:0 0 16px 0;">
<strong>Greetings from TMS – The Migration School!</strong>
</p>

<p style="margin:0 0 16px 0;">
Thank you for your interest in the <strong>Ireland Employer Sponsored Work Visa Program (Critical Skills &amp; General Employment).</strong>
</p>

<p style="margin:0 0 20px 0;">
The Ireland Work Permit program allows skilled professionals from around the world to secure direct employment with approved Irish employers. This pathway provides an exceptional opportunity to build an international career in Europe and transition to <strong>Permanent Residency (Stamp 4)</strong> after 2 years.
</p>

<p style="margin:0 0 10px 0;">
<a href="https://tmsvisa.com/ireland-work-visa-process" style="color:#059669;font-weight:bold;text-decoration:underline;font-size:15px;" target="_blank">WATCH THE COMPLETE IRELAND WORK VISA PROCESS</a>
</p>

<p style="margin:0 0 20px 0;">
<a href="https://tmsvisa.com/ireland-work-visa-process" style="color:#059669;text-decoration:underline;" target="_blank">https://tmsvisa.com/ireland-work-visa-process</a>
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<u><strong>Our Complete Step-by-Step Process (3–5 Months Total)</strong></u>
</p>

<p style="margin:0 0 16px 0;">
<strong>Step 1 – Send Us Your CV &amp; Free Eligibility Assessment</strong><br>
Submit your latest CV/Resume for a comprehensive qualification check against the official Irish Critical Skills Occupations List (CSOL) and General Employment Permit (GEP) lists. Candidates must have a minimum of 2 years of relevant work experience in their field.
</p>

<p style="margin:0 0 8px 0;">
<strong>Step 2 – Initial Professional Service Fee (€300)</strong><br>
Once your profile is found eligible, we issue an agreement and invoice for an initial professional service fee of <strong>€300</strong>.
</p>

<ul style="margin:0 0 16px 0;padding-left:24px;line-height:1.7;">
  <li style="margin-bottom:4px;">Preparation of a professional European / Irish-standard CV.</li>
  <li style="margin-bottom:4px;">Profile optimization according to Irish employer expectations.</li>
  <li style="margin-bottom:4px;">Dedicated TMS Recruitment Case Manager.</li>
  <li style="margin-bottom:4px;">Free weekly English communication coaching sessions (no PTE or IELTS exam required for Ireland work visa).</li>
  <li style="margin-bottom:4px;">Comprehensive interview coaching &amp; TMS books your interviews with Irish employers.</li>
</ul>

<p style="margin:0 0 16px 0;">
<strong>Step 3 – Employer Matching &amp; Interviews</strong><br>
Our recruitment team markets your profile to approved Irish employers and arranges virtual interviews until you secure a genuine job offer.
</p>

<p style="margin:0 0 16px 0;">
<strong>Step 4 – Work Permit Filing (DETE)</strong><br>
Your sponsoring Irish employer lodges your work permit application with the Department of Enterprise, Trade and Employment (DETE).
<strong>The employer covers the €1,000 work permit fee, €60 visa processing fee, government approvals, and flight tickets to Ireland!</strong>
</p>

<p style="margin:0 0 20px 0;">
<strong>Step 5 – Visa Finalization &amp; Travel (€700)</strong><br>
You submit biometrics at your local VFS centre. Your remaining professional service fee of <strong>€700</strong> is payable <strong>ONLY AFTER your visa is officially approved and flight tickets are in hand!</strong><br>
<strong>100% Money-Back Guarantee:</strong> If your visa is rejected for any reason, TMS refunds all your payments in full immediately — no questions asked.
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<u><strong>Key Program Highlights</strong></u>
</p>

<ul style="margin:0 0 16px 0;padding-left:24px;line-height:1.7;">
  <li style="margin-bottom:4px;"><strong>3-Way Eligibility System:</strong> Roles on CSOL qualify for Critical Skills (CSEP – 3–4 months, Stamp 4 in 2 years). Roles not on CSOL or IOL qualify for General Employment Permits (GEP – 4–5 months).</li>
  <li style="margin-bottom:4px;"><strong>Direct PR Pathway:</strong> Eligible for Stamp 4 Permanent Residency after 2 years of work under Critical Skills.</li>
  <li style="margin-bottom:4px;"><strong>Minimum Experience:</strong> At least 2 years of verified work experience in your occupation.</li>
  <li style="margin-bottom:4px;"><strong>No English Exam Mandate:</strong> Ireland does not require PTE or IELTS. TMS provides free weekly English coaching to help you impress employers.</li>
  <li style="margin-bottom:4px;"><strong>Employer Covers Core Costs:</strong> Sponsoring employer covers €1,000 permit fee, €60 visa fee, and flight tickets to Dublin!</li>
  <li style="margin-bottom:4px;"><strong>Family Rights:</strong> Spouse receives unrestricted full-time work rights in Ireland; children access Irish public education.</li>
  <li style="margin-bottom:4px;"><strong>100% Money-Back Guarantee:</strong> Transparent 1-year agreement protecting your investment with a full refund if rejected.</li>
</ul>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<u><strong>Professional Service Charges</strong></u>
</p>

<table style="width:100%;max-width:380px;border-collapse:collapse;margin:12px 0 20px 0;font-size:15px;line-height:1.6;">
<thead>
<tr>
<th style="text-align:left;padding:6px 0;font-weight:bold;color:#111;width:60%;">Stage</th>
<th style="text-align:left;padding:6px 0;font-weight:bold;color:#111;width:40%;">Amount</th>
</tr>
</thead>
<tbody>
<tr>
<td style="padding:6px 0;color:#222;">Initial Fee</td>
<td style="padding:6px 0;font-weight:bold;color:#111;">€300</td>
</tr>
<tr>
<td style="padding:6px 0;color:#222;">After Visa Grant</td>
<td style="padding:6px 0;font-weight:bold;color:#111;">€700</td>
</tr>
<tr>
<td style="padding:8px 0;font-weight:bold;color:#111;">Total</td>
<td style="padding:8px 0;font-weight:bold;color:#111;">€1,000</td>
</tr>
</tbody>
</table>

<p style="margin:0 0 16px 0;">
📎 Please find attached the official <strong>Ireland Critical Skills Occupations List (PDF)</strong> detailing the high-demand eligible professions under Irish immigration regulations.
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<strong>Next Step</strong>
</p>

<p style="margin:0 0 10px 0;">
<strong>Kindly reply to this email with your latest CV.</strong>
</p>

<p style="margin:0 0 16px 0;">
Our review team will give you a call once they review your CV for next steps.
</p>

<p style="margin:0 0 24px 0;">
<strong>Please watch the complete process video again:</strong><br>
<a href="https://tmsvisa.com/ireland-work-visa-process" style="color:#059669;font-weight:bold;text-decoration:underline;font-size:15px;" target="_blank">WATCH VIDEO – IRELAND WORK VISA PROCESS</a>
</p>

<p style="margin:0 0 16px 0;">
Best Regards,
</p>

<div style="margin-top:20px;">
  <img src="cid:info-email-footer" alt="TMS – The Migration School" style="max-width:100%;width:680px;height:auto;display:block;border:0;" />
</div>

</div>`;

/**
 * Loads the official Ireland email attachments:
 * - Ireland Critical Skills Occupations List PDF (downloadable attachment)
 * - info email footer.png as an inline CID signature (rendered inside the email body)
 */
export async function getOfficialIrelandInfoAttachments(): Promise<
  { filename: string; content: Buffer; contentType: string; cid?: string; contentDisposition?: "attachment" | "inline" }[]
> {
  const attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
    cid?: string;
    contentDisposition?: "attachment" | "inline";
  }[] = [];

  // 1. Ireland Occupation List PDF — the downloadable attachment
  const occPaths = [
    path.join(process.cwd(), "public", "attachments", "Ireland_Critical_Skills_Occupations_List.pdf"),
    path.join(process.cwd(), "public", "attachment", "Ireland_Critical_Skills_Occupations_List.pdf"),
  ];
  for (const occPath of occPaths) {
    if (fs.existsSync(occPath)) {
      try {
        attachments.push({
          filename: "Ireland Critical Skills Occupations List.pdf",
          content: fs.readFileSync(occPath),
          contentType: "application/pdf",
        });
        break;
      } catch (e) {
        console.warn("[WhatsApp Ireland Info Email] Could not read local occupation list:", e);
      }
    }
  }

  // Fallback to MongoDB GridFS if local file not found
  if (attachments.length === 0) {
    try {
      const { connectToDatabase } = await import("@/lib/mongodb");
      const { getGridFSBucket } = await import("@/lib/gridfs");
      const { db } = await connectToDatabase();
      const bucket = await getGridFSBucket();

      const occFile = await db.collection("chatFiles.files").findOne({
        filename: { $regex: /Ireland.*Critical.*Skills|Ireland.*Occupations/i },
      });
      if (occFile) {
        const stream = bucket.openDownloadStream(occFile._id as any);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        attachments.push({
          filename: "Ireland Critical Skills Occupations List.pdf",
          content: Buffer.concat(chunks),
          contentType: "application/pdf",
        });
      }
    } catch (gridFsErr) {
      console.warn("[WhatsApp Ireland Info Email] GridFS occupation list fallback error:", gridFsErr);
    }
  }

  // 2. Footer image — inline CID signature (same image used by Australia emails)
  const footerPaths = [
    path.join(process.cwd(), "public", "attachments", "info email footer.png"),
    path.join(process.cwd(), "public", "attachment", "info email footer.png"),
  ];
  for (const footerPath of footerPaths) {
    if (fs.existsSync(footerPath)) {
      try {
        attachments.push({
          filename: "info-email-footer.png",
          content: fs.readFileSync(footerPath),
          contentType: "image/png",
          cid: "info-email-footer",
          contentDisposition: "inline",
        });
        break;
      } catch (fErr) {
        console.warn("[WhatsApp Ireland Info Email] Could not read info email footer image:", fErr);
      }
    }
  }

  return attachments;
}

export async function sendWhatsAppIrelandInfoEmail(
  params: SendWhatsAppIrelandInfoEmailParams
): Promise<{ success: boolean; error?: string }> {
  const { phone, name, email, leadId } = params;
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");

  if (!email || !email.includes("@")) {
    return { success: false, error: "Invalid email address" };
  }

  const isValidName = (n?: string) =>
    !!n &&
    n.trim().length > 2 &&
    !n.includes("@") &&
    !/^\d+$/.test(n.trim()) &&
    n.trim().toLowerCase() !== "candidate" &&
    n.trim().toLowerCase() !== "applicant" &&
    n.trim().toLowerCase() !== "at" &&
    !n.toLowerCase().includes("test");

  const candidateName = isValidName(name) ? name!.trim() : "Applicant";

  const htmlContent = DEFAULT_IRELAND_INFO_EMAIL_HTML.replace(
    /\{\{CandidateName\}\}/g,
    candidateName
  );

  try {
    const attachments = await getOfficialIrelandInfoAttachments();

    const emailResult = await sendEmail({
      from: "info@tmsvisa.com",
      fromName: "The Migration School (TMS Visa)",
      to: email,
      subject: DEFAULT_IRELAND_INFO_EMAIL_SUBJECT,
      html: htmlContent,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    const isSuccess = Boolean(emailResult.success && !emailResult.failed);
    const now = new Date();

    try {
      await recordEmailHistory({
        leadId: leadId || 0,
        leadName: candidateName,
        stage: "info",
        mailbox: "info@tmsvisa.com",
        templateName: "Ireland Employer Sponsored Work Visa Information Pack",
        subject: DEFAULT_IRELAND_INFO_EMAIL_SUBJECT,
        bodyPreview: "Ireland Work Visa Program Guide with Critical Skills Occupations List attachment.",
        status: isSuccess ? "sent" : "failed",
        isFollowup: false,
        followupNumber: 0,
        isPendingFollowup: false,
        cancelled: false,
        sentAt: now,
        sentBy: 0,
        sentByName: "WhatsApp Ireland Bot (Automated)",
        body: htmlContent,
        to: email,
        error: emailResult.error,
      });
    } catch (histErr) {
      console.warn("[WhatsApp Ireland Info Email] Could not record email history:", histErr);
    }

    if (!isSuccess) {
      return { success: false, error: emailResult.error || "Email delivery failed" };
    }

    const { db } = await connectToDatabase();
    const last10 = cleanPhone.slice(-10);
    const waPhoneFilter = {
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        ...(last10.length === 10 ? [{ phone: { $regex: `${last10}$` } }] : []),
      ],
    };
    await db.collection("whatsapp_ireland_sessions").updateOne(
      waPhoneFilter,
      {
        $set: {
          email,
          infoEmailSentAt: now,
          updatedAt: now,
        },
      }
    );

    return { success: true };
  } catch (err) {
    console.error("[sendWhatsAppIrelandInfoEmail Error]", err);
    return { success: false, error: String(err) };
  }
}
