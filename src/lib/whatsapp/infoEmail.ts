import fs from "fs";
import path from "path";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { sendEmail, recordEmailHistory } from "@/lib/email";

export interface SendWhatsAppInfoEmailParams {
  phone: string;
  name?: string;
  email: string;
  leadId?: number;
}

export const DEFAULT_INFO_EMAIL_SUBJECT = "Process-Australia Work Visa";

export const DEFAULT_INFO_EMAIL_HTML = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#222;max-width:760px;margin:0;padding:0;">

<p style="margin:0 0 16px 0;">Dear {{CandidateName}},</p>

<p style="margin:0 0 16px 0;">
<strong>Greetings from TMS – The Migration School!</strong>
</p>

<p style="margin:0 0 16px 0;">
Thank you for your interest in the <strong>Australia Subclass 482 Skills in Demand Work Visa Program</strong>.
</p>

<p style="margin:0 0 20px 0;">
The Subclass 482 visa is an <strong>employer-sponsored work visa</strong> that allows skilled professionals to live and work in Australia with an approved employer. Depending on your eligibility and future Australian Government policies, it may also provide a pathway towards Permanent Residency.
</p>

<p style="margin:24px 0 12px 0;">
<u><strong>Understand the Complete Process</strong></u>
</p>

<p style="margin:0 0 14px 0;">
Please watch our complete process video to understand the recruitment, employer selection, sponsorship and visa process:
</p>

<p style="margin:0 0 10px 0;">
<a href="https://tmsvisa.com/australia-work-visa-process/" style="color:#0d6efd;font-weight:bold;text-decoration:underline;font-size:15px;" target="_blank">WATCH THE COMPLETE AUSTRALIA WORK VISA PROCESS</a>
</p>

<p style="margin:0 0 20px 0;">
<a href="https://tmsvisa.com/australia-work-visa-process/" style="color:#0d6efd;text-decoration:underline;" target="_blank">https://tmsvisa.com/australia-work-visa-process/</a>
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<u><strong>Check Your Occupation</strong></u>
</p>

<p style="margin:0 0 12px 0;">
We have attached the <strong>Australia Eligible Occupation List (691 Occupations)</strong> covering industries such as:
</p>

<p style="margin:0 0 14px 0;">
<strong>IT | Engineering | Healthcare | Education | Hospitality | Construction & Trades | Agriculture | Finance | Transport & Logistics</strong>
</p>

<p style="margin:0 0 20px 0;">
Please check whether your occupation is included.
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 16px 0;">
<u><strong>Our Process</strong></u>
</p>

<p style="margin:0 0 16px 0;">
<strong>1. Submit Your CV</strong><br>
Send us your latest CV so that our team can conduct a personalised assessment based on your occupation and relevant job vacancies.
</p>

<p style="margin:0 0 8px 0;">
<strong>2. Initial Professional Fee – AUD 300</strong><br>
If your profile is suitable, we issue an invoice for <strong>AUD 300</strong>, covering:
</p>

<ul style="margin:0 0 16px 0;padding-left:24px;line-height:1.7;">
<li style="margin-bottom:4px;">Australian-standard CV preparation & optimisation</li>
<li style="margin-bottom:4px;">Free Weekend PTE & interview preparation sessions</li>
<li style="margin-bottom:4px;">Complete documentation process after receiving a job offer, including work permit and visa application submission</li>
</ul>

<p style="margin:0 0 16px 0;">
<strong>3. Employer Marketing & Interviews</strong><br>
Our Australian recruitment team presents your profile to suitable employers and arranges interviews.
</p>

<p style="margin:0 0 16px 0;">
<strong>4. Employer Selection & Sponsorship</strong><br>
Once selected, the employer proceeds with the required sponsorship and nomination process.
</p>

<p style="margin:0 0 16px 0;">
<strong>5. Visa Application</strong><br>
After nomination approval, our office assists with your Subclass 482 visa application. Applicable <strong>Government Visa Application Charges</strong> are payable separately to the Department of Home Affairs and would be the <strong>employer's responsibility</strong>.
</p>

<p style="margin:0 0 20px 0;">
<strong>6. Visa Grant</strong><br>
After your visa is granted, the remaining <strong>AUD 700</strong> professional service fee is payable.
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<u><strong>Expected Salary</strong></u>
</p>

<p style="margin:0 0 20px 0;">
The current minimum annual salary threshold stated for the program is <strong>AUD 76,500</strong>, with the actual salary depending on your occupation, experience, qualifications, employer and location.
</p>

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
<td style="padding:6px 0;font-weight:bold;color:#111;">AUD 300</td>
</tr>
<tr>
<td style="padding:6px 0;color:#222;">After Visa Grant</td>
<td style="padding:6px 0;font-weight:bold;color:#111;">AUD 700</td>
</tr>
<tr>
<td style="padding:8px 0;font-weight:bold;color:#111;">Total</td>
<td style="padding:8px 0;font-weight:bold;color:#111;">AUD 1,000</td>
</tr>
</tbody>
</table>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

<p style="margin:0 0 12px 0;">
<strong>Next Step</strong>
</p>

<p style="margin:0 0 10px 0;">
<strong>Kindly reply to this email with your latest CV.</strong>
</p>

<p style="margin:0 0 16px 0;">
Our review team will give you a call once they will review your CV for next steps.
</p>

<p style="margin:0 0 10px 0;">
<strong>Please watch the complete process video again:</strong>
</p>

<p style="margin:0 0 24px 0;">
<a href="https://tmsvisa.com/australia-work-visa-process/" style="color:#0d6efd;font-weight:bold;text-decoration:underline;font-size:15px;" target="_blank">WATCH VIDEO – AUSTRALIA WORK VISA PROCESS</a>
</p>

<p style="margin:0 0 16px 0;">
Best Regards,
</p>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- TMS VISA BRANDED EMAIL SIGNATURE — pure HTML, zero attachments -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;margin-top:24px;border-top:2px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <tr>
    <td style="padding-top:18px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr valign="top">

          <!-- LEFT: TMS VISA Logo Block -->
          <td style="width:200px;padding-right:20px;padding-bottom:12px;">
            <!-- Logo: TMS text mark styled to match branding -->
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <div style="display:inline-block;background:#0d2a52;padding:6px 12px 4px 10px;border-radius:4px 4px 0 0;">
                    <span style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:2px;line-height:1;">TMS</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background:#f0a500;padding:3px 12px 3px 10px;border-radius:0 0 4px 0;display:inline-block;">
                    <span style="font-size:9px;font-weight:700;color:#0d2a52;letter-spacing:2.5px;text-transform:uppercase;">VISA</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding-top:3px;">
                  <span style="font-size:9px;font-weight:600;color:#0d2a52;letter-spacing:1px;text-transform:uppercase;">THE MIGRATION SCHOOL</span>
                </td>
              </tr>
            </table>
            <!-- Tagline -->
            <p style="margin:14px 0 0 0;font-size:10px;font-style:italic;color:#0d2a52;line-height:1.4;">
              <em>Your Global Journey<br/>Our Mission</em>
            </p>
          </td>

          <!-- DIVIDER -->
          <td style="width:1px;background:#dde3ec;padding:0;">&nbsp;</td>

          <!-- RIGHT: Contact Details -->
          <td style="padding-left:20px;padding-bottom:12px;">

            <!-- Name + Title -->
            <p style="margin:0 0 2px 0;font-size:16px;font-weight:700;color:#0d2a52;line-height:1.2;">Visa Consulting Team</p>
            <p style="margin:0 0 10px 0;font-size:12px;font-weight:600;color:#444;">TMS &ndash; The Migration School</p>

            <!-- Contact links row -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
              <tr>
                <td style="padding-right:16px;">
                  <a href="mailto:info@tmsvisa.com" style="font-size:12px;color:#0d2a52;text-decoration:none;">
                    &#9993;&nbsp;<span style="text-decoration:underline;">info@tmsvisa.com</span>
                  </a>
                </td>
                <td>
                  <a href="https://tmsvisa.com" target="_blank" style="font-size:12px;color:#0d2a52;text-decoration:none;">
                    &#127760;&nbsp;<span style="text-decoration:underline;">www.tmsvisa.com</span>
                  </a>
                </td>
              </tr>
            </table>

            <!-- Australia Address -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:7px;">
              <tr valign="top">
                <td style="padding-right:6px;font-size:14px;">&#127462;&#127482;</td>
                <td>
                  <span style="font-size:11px;font-weight:700;color:#0d2a52;">154 Paisley Street, Orange, NSW 2800, Australia</span><br/>
                  <span style="font-size:10px;color:#666;">Migration Pty Ltd. ABN: 75 148 213 076</span>
                </td>
              </tr>
            </table>

            <!-- India Address -->
            <table cellpadding="0" cellspacing="0" border="0">
              <tr valign="top">
                <td style="padding-right:6px;font-size:14px;">&#127470;&#127475;</td>
                <td>
                  <span style="font-size:11px;font-weight:700;color:#0d2a52;">Delhi NCR, India</span><br/>
                  <span style="font-size:10px;color:#666;">Groworld Vijtour Pvt. Ltd. (Trade name: The Migration School)</span><br/>
                  <span style="font-size:10px;color:#666;">CIN: U63098HR2024PTC122827</span>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BOTTOM COLOR BAR: gold + navy (matches the screenshot bar) -->
  <tr>
    <td style="padding-top:14px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="background:#f0a500;height:5px;width:30%;font-size:0;">&nbsp;</td>
          <td style="background:#0d2a52;height:5px;width:70%;font-size:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

</div>`;

/**
 * Loads the official email attachments.
 * Only the Australia Eligible Occupation List PDF is attached.
 * The footer is a pure HTML text signature — no image, no CID, no attachment.
 */
export async function getOfficialInfoAttachments(): Promise<
  { filename: string; content: Buffer; contentType: string }[]
> {
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  // Occupation List PDF — the only attachment
  const occPaths = [
    path.join(process.cwd(), "public", "attachments", "Australia_Eligible_Occupation_List_691.pdf"),
    path.join(process.cwd(), "public", "attachment", "Australia_Eligible_Occupation_List_691.pdf"),
  ];
  for (const occPath of occPaths) {
    if (fs.existsSync(occPath)) {
      try {
        attachments.push({
          filename: "Australia Eligible Occupation List (691 Occupations).pdf",
          content: fs.readFileSync(occPath),
          contentType: "application/pdf",
        });
        break;
      } catch (e) {
        console.warn("[WhatsApp Info Email] Could not read local occupation list:", e);
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
        filename: { $regex: /Australia_Work_Occupations|Occupation/i },
      });
      if (occFile) {
        const stream = bucket.openDownloadStream(occFile._id as ObjectId);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        attachments.push({
          filename: "Australia Eligible Occupation List (691 Occupations).pdf",
          content: Buffer.concat(chunks),
          contentType: "application/pdf",
        });
      }
    } catch (gridFsErr) {
      console.warn("[WhatsApp Info Email] GridFS occupation list fallback error:", gridFsErr);
    }
  }

  return attachments;
}

/**
 * Sends an automated info email to candidate upon email submission in WhatsApp.
 */
export async function sendWhatsAppInfoEmail(params: SendWhatsAppInfoEmailParams) {
  const { phone, name, email, leadId } = params;
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  // Sanitize candidate name: reject emails, single chars, all-digits, or known placeholders
  const isValidName = (n?: string) =>
    !!n &&
    n.length > 1 &&
    !n.includes("@") &&
    !/^\d+$/.test(n) &&
    n.toLowerCase() !== "candidate" &&
    n.toLowerCase() !== "applicant" &&
    !n.toLowerCase().includes("test");
  const candidateName = isValidName(name) ? name! : "Applicant";

  try {
    const { db } = await connectToDatabase();

    // Use official subject and template text
    let subject = DEFAULT_INFO_EMAIL_SUBJECT;
    let html = DEFAULT_INFO_EMAIL_HTML;

    subject = subject.replace(/\{\{CandidateName\}\}/g, candidateName);
    subject = subject.replace(/\{\{Email\}\}/g, email);
    subject = subject.replace(/\{\{Phone\}\}/g, `+${cleanPhone}`);

    html = html.replace(/\{\{CandidateName\}\}/g, candidateName);
    html = html.replace(/\{\{Email\}\}/g, email);
    html = html.replace(/\{\{Phone\}\}/g, `+${cleanPhone}`);

    // Load official attachments (Occupation List PDF + CID inline footer image)
    const attachments = await getOfficialInfoAttachments();

    // Send from info@tmsvisa.com
    const result = await sendEmail({
      from: "info@tmsvisa.com",
      fromName: "TMS",
      to: email,
      subject,
      html,
      attachments,
    });

    const now = new Date();
    const isSuccess = Boolean(result.success && !result.failed);

    // Look up leadId if missing to ensure email history is properly recorded
    let effectiveLeadId = leadId;
    if (!effectiveLeadId) {
      try {
        const leadDoc = await db.collection("leads").findOne({
          $or: [
            { phone: cleanPhone },
            { phone: `+${cleanPhone}` },
            { phone: { $regex: `${cleanPhone.slice(-10)}$` } },
            { email: email.toLowerCase() },
          ],
        });
        if (leadDoc) effectiveLeadId = leadDoc.id;
      } catch (findErr) {
        console.warn("[WhatsApp Info Email] Error finding lead for history record:", findErr);
      }
    }

    // Record in email_history unconditionally
    try {
      await recordEmailHistory({
        leadId: effectiveLeadId || 0,
        leadName: candidateName,
        stage: "info",
        mailbox: "info@tmsvisa.com",
        templateName: "Process-Australia Work Visa",
        subject,
        bodyPreview: "Process-Australia Work Visa - Program details and eligible occupation list.",
        status: isSuccess ? "sent" : "failed",
        isFollowup: false,
        followupNumber: 0,
        isPendingFollowup: false,
        cancelled: false,
        sentAt: now,
        sentBy: 0,
        sentByName: "WhatsApp Bot (Automated)",
        body: html,
        to: email,
        error: result.error,
      });
    } catch (histErr) {
      console.warn("[WhatsApp Info Email] Could not record email history:", histErr);
    }

    if (!isSuccess) {
      console.error(`[WhatsApp Info Email] ✗ Delivery failed to ${email}:`, result.error);
      return {
        success: false,
        error: result.error || "Failed to dispatch email via SMTP",
        result,
      };
    }

    // Update whatsapp_sessions ONLY on confirmed success
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          infoEmailSentAt: now,
          email,
          updatedAt: now,
        },
      }
    );

    return {
      success: true,
      result,
      attachmentsCount: attachments.length,
      attachmentNames: attachments.map((a) => a.filename),
    };
  } catch (err) {
    console.error(`[WhatsApp Info Email] Error sending to ${email}:`, err);
    return { success: false, error: String(err) };
  }
}
