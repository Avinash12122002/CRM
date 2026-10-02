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

export const DEFAULT_IRELAND_INFO_EMAIL_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8;color:#333;max-width:800px;margin:0 auto;">

<p>Dear {{CandidateName}},</p>

<p>
Greetings from <strong>TMS – The Migration School!</strong>
</p>

<p>
Thank you for your interest in the <strong>Ireland Employer Sponsored Work Visa Program (Critical Skills & General Employment).</strong>
</p>

<p>
The Ireland Work Permit program allows skilled professionals from around the world to secure direct employment with approved Irish employers. This pathway provides an exceptional opportunity to build an international career in Europe and transition to <strong>Permanent Residency (Stamp 4)</strong> after 2 years.
</p>

<hr style="margin:25px 0; border: 0; border-top: 1px solid #e2e8f0;">

<h2 style="color:#059669;">Our Complete Step-by-Step Process (3-5 Months Total)</h2>

<h3>Step 1 – Send Us Your CV & Free Eligibility Assessment</h3>
<p>
Submit your latest CV/Resume for a comprehensive qualification check against the official Irish Critical Skills Occupations List (CSOL) and General Employment Permit (GEP) lists. Candidates must have a minimum of 2 years of relevant work experience in their field.
</p>

<h3>Step 2 – Initial Professional Service Fee (€300)</h3>
<p>
Once your profile is found eligible, we issue an agreement and invoice for an initial professional service fee of <strong>€300</strong>.
</p>
<p>This includes:</p>
<ul>
<li>Preparation of a professional European / Irish-standard CV.</li>
<li>Profile optimization according to Irish employer expectations.</li>
<li>Dedicated TMS Recruitment Case Manager.</li>
<li>Free weekly English communication coaching sessions (to help you impress employers — no PTE or IELTS exam is required for Ireland work visa).</li>
<li>Comprehensive interview coaching & TMS books your interviews with Irish employers.</li>
</ul>

<h3>Step 3 – Employer Matching & Interviews</h3>
<p>
Our recruitment team markets your profile to approved Irish employers and arranges virtual interviews until you secure a genuine job offer.
</p>

<h3>Step 4 – Work Permit Filing (DETE)</h3>
<p>
Your sponsoring Irish employer lodges your work permit application with the Department of Enterprise, Trade and Employment (DETE).
<strong>The employer covers the €1,000 work permit fee, €60 visa processing fee, government approvals, and flight tickets to Ireland!</strong>
</p>

<h3>Step 5 – Visa Finalization & Travel (€700)</h3>
<p>
You submit biometrics at your local VFS centre. Your remaining professional service fee of <strong>€700</strong> is payable <strong>ONLY AFTER your visa is officially approved and flight tickets are in hand!</strong>
</p>
<p>
<strong>100% Money-Back Guarantee:</strong> If your visa is rejected for any reason, TMS refunds all your payments in full immediately — no questions asked.
</p>

<hr style="margin:25px 0; border: 0; border-top: 1px solid #e2e8f0;">

<h3 style="color:#1e293b;">Key Program Highlights</h3>
<ul>
<li><strong>3-Way Eligibility System:</strong> Roles on CSOL qualify for Critical Skills (CSEP - 3-4 months, Stamp 4 in 2 years). Roles not on CSOL or IOL qualify for General Employment Permits (GEP - 4-5 months).</li>
<li><strong>Direct PR Pathway:</strong> Eligible for Stamp 4 Permanent Residency after 2 years of work under Critical Skills.</li>
<li><strong>Minimum Experience:</strong> At least 2 years of verified work experience in your occupation.</li>
<li><strong>No English Exam Mandate:</strong> Ireland does not require PTE or IELTS for this work visa. TMS provides free weekly English communication coaching to help you communicate confidently and impress employers in interviews.</li>
<li><strong>Employer Covers Core Costs:</strong> Sponsoring Irish employer covers €1,000 permit fee, €60 visa fee, and flight tickets to Dublin!</li>
<li><strong>Family Rights:</strong> Spouse receives unrestricted full-time work rights in Ireland; children access Irish public education.</li>
<li><strong>100% Money-Back Guarantee:</strong> Transparent 1-year agreement protecting your investment with a full refund if rejected.</li>
</ul>

<div style="background:#f8fafc; border-left:4px solid #059669; padding:15px; margin:20px 0; border-radius:4px;">
<p style="margin:0; font-weight:600; color:#0f172a;">📎 Attached Document:</p>
<p style="margin:5px 0 0 0; color:#475569;">Please find attached the official <strong>Ireland Critical Skills Occupations List (PDF)</strong> detailing the high-demand eligible professions under Irish immigration regulations.</p>
</div>

<p>
If you have any questions or want to discuss your profile with our Senior Ireland Migration Expert, simply reply to our WhatsApp chat or email us.
</p>

<p style="margin-top:30px;">
Warm regards,<br>
<strong>The Migration School (TMS Visa)</strong><br>
European & Ireland Recruitment Team<br>
Website: <a href="https://www.tmsvisa.com">www.tmsvisa.com</a> | Email: info@tmsvisa.com
</p>
</div>`;

/**
 * Loads the official Ireland Critical Skills Occupations List PDF attachment
 */
export async function getOfficialIrelandInfoAttachments(): Promise<
  { filename: string; content: Buffer; contentType: string }[]
> {
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  const occLocalPath = path.join(
    process.cwd(),
    "public",
    "attachments",
    "Ireland_Critical_Skills_Occupations_List.pdf"
  );

  if (fs.existsSync(occLocalPath)) {
    try {
      attachments.push({
        filename: "Ireland Critical Skills Occupations List.pdf",
        content: fs.readFileSync(occLocalPath),
        contentType: "application/pdf",
      });
    } catch (e) {
      console.warn("[WhatsApp Ireland Info Email] Could not read local occupation list:", e);
    }
  }

  // Fallback to GridFS if local file is missing
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
      console.warn("[WhatsApp Ireland Info Email] GridFS attachment fallback error:", gridFsErr);
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
    await db.collection("whatsapp_ireland_sessions").updateOne(
      { phone: cleanPhone },
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
