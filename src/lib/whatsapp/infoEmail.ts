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

export const DEFAULT_INFO_EMAIL_SUBJECT = "Australia Subclass 482 Skills in Demand Work Visa Program | TMS Visa";

export const DEFAULT_INFO_EMAIL_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8;color:#333;max-width:800px;margin:0 auto;">

<p>Dear {{CandidateName}},</p>

<p>
Greetings from <strong>TMS – The Migration School!</strong>
</p>

<p>
Thank you for your interest in the <strong>Australia Subclass 482 Skills in Demand Work Visa Program.</strong>
</p>

<p>
The Subclass 482 visa is an employer-sponsored work visa that allows skilled professionals to live and work in Australia with an approved Australian employer. This pathway provides an excellent opportunity for qualified candidates to build their careers in Australia and, depending on future Australian Government policies and your eligibility, may also provide a pathway towards Permanent Residency.
</p>

<p>
To help you understand the program, we have attached the following documents with this email:
</p>

<ul>
<li><strong>Australia Eligible Occupation List (691 Occupations)</strong></li>
<li><strong>PTE Eligibility & Assessment Guide</strong></li>
</ul>

<p>
The occupation list contains the occupations currently eligible under the Australia employer-sponsored work visa program across various industries, including:
</p>

<ul>
<li>Information Technology</li>
<li>Engineering</li>
<li>Healthcare & Medical</li>
<li>Education</li>
<li>Hospitality</li>
<li>Construction & Trades</li>
<li>Agriculture</li>
<li>Business & Finance</li>
<li>Transport & Logistics</li>
<li>And many more.</li>
</ul>

<p>
Please check whether your occupation appears in the attached occupation list.
</p>

<hr style="margin:30px 0;">

<h2 style="color:#0b5ed7;">Our Complete Process</h2>

<h3>Step 1 – Send Us Your CV</h3>

<p>
Email us your latest CV/Resume.
</p>

<p>
Our recruitment team will review your profile to determine whether your occupation and experience are suitable for the Australian employer-sponsored visa program.
</p>

<h3>Step 2 – Initial Professional Service Fee</h3>

<p>
Once your profile is found suitable, we will issue an invoice for an initial professional service fee of <strong>AUD 300</strong>.
</p>

<p>This includes:</p>

<ul>
<li>Preparation of a professional Australian-standard CV.</li>
<li>Resume optimisation according to Australian employer expectations.</li>
<li>Detailed profile assessment.</li>
<li>Minor customisation of your CV according to the requirements of different employers throughout the recruitment process.</li>
<li>Weekend PTE preparation sessions.</li>
<li>Interview preparation sessions.</li>
</ul>

<h3>Step 3 – Employer Marketing</h3>

<p>
After your professional CV is prepared, our Australian recruitment team begins conducting interviews with our existing employer partners while simultaneously marketing your profile to additional suitable Australian employers.
</p>

<p>
We continue presenting your profile and arranging interviews until you receive a genuine employment offer.
</p>

<h3>Step 4 – Interview Process</h3>

<p>
We schedule interviews with employers relevant to your occupation and experience.
</p>

<p>
If required, our team will also guide you with interview preparation to maximise your chances of selection.
</p>

<h3>Step 5 – Employer Sponsorship & Nomination</h3>

<p>
Once you are selected by an employer:
</p>

<ul>
<li>The employer prepares and lodges your sponsorship application.</li>
<li>The employer prepares and lodges your nomination application.</li>
<li>Our Australian team coordinates the complete employer nomination process.</li>
<li>Once the employer nomination is approved, we proceed with your visa application.</li>
</ul>

<h3>Step 6 – Visa Application</h3>

<p>
Our India office prepares and lodges your Subclass 482 visa application.
</p>

<p>
At this stage, you will only be required to pay the applicable Australian Government Visa Application Charges directly to the Department of Home Affairs.
</p>

<h3>Step 7 – Visa Approval</h3>

<p>
Once your Subclass 482 visa is granted:
</p>

<ul>
<li>You pay the remaining <strong>AUD 700</strong> towards our professional service charges.</li>
<li>The employer then proceeds with your travel arrangements and issues your flight ticket, subject to the employer's employment agreement and company policy.</li>
</ul>

<hr style="margin:30px 0;">

<h2 style="color:#0b5ed7;">Expected Salary in Australia</h2>

<p>
Under the current Australian Government requirements for the Subclass 482 Skills in Demand Work Visa, sponsoring employers are generally required to pay employees at least the applicable minimum salary threshold.
</p>

<p style="font-size:18px;font-weight:bold;color:#198754;">
AUD 76,500 Per Year (Minimum Salary Threshold)
</p>

<p>
Successful candidates under this program can generally expect a salary of AUD 76,500 per annum or higher depending upon:
</p>

<ul>
<li>Your occupation</li>
<li>Your qualifications</li>
<li>Your relevant work experience</li>
<li>The employer's salary structure</li>
<li>The location of employment within Australia</li>
</ul>

<p>
The exact salary package, including allowances, overtime, bonuses, accommodation and other employment benefits (if applicable), will be discussed directly with the employer during your interview or after your successful selection.
</p>

<hr style="margin:30px 0;">

<h2 style="color:#0b5ed7;">Professional Service Charges</h2>

<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr style="background:#0b5ed7;color:white;">
<th style="padding:10px;border:1px solid #ddd;text-align:left;">Stage</th>
<th style="padding:10px;border:1px solid #ddd;">Amount</th>
</tr>

<tr>
<td style="padding:10px;border:1px solid #ddd;">Initial Professional Service Fee</td>
<td style="padding:10px;border:1px solid #ddd;">AUD 300</td>
</tr>

<tr>
<td style="padding:10px;border:1px solid #ddd;">After Visa Grant</td>
<td style="padding:10px;border:1px solid #ddd;">AUD 700</td>
</tr>

<tr style="font-weight:bold;background:#f5f5f5;">
<td style="padding:10px;border:1px solid #ddd;">Total Professional Service Charges</td>
<td style="padding:10px;border:1px solid #ddd;">AUD 1,000 Only</td>
</tr>

</table>

<hr style="margin:30px 0;">

<h2 style="color:#0b5ed7;">Next Step</h2>

<p>
If your occupation appears in the attached occupation list and you meet the English language requirements—or if you are willing to take the required English language test after receiving an employment offer—simply reply to this email with your latest CV.
</p>

<p>
Our team will assess your profile and guide you through the next steps towards securing an employer-sponsored opportunity in Australia.
</p>

<p>
We look forward to assisting you in building a successful career in Australia.
</p>

<br>

<p>
Warm Regards,
</p>

<p>
<strong>Visa Consulting Team</strong><br>
<strong>TMS – The Migration School</strong>
</p>

<hr>

<p style="font-size:13px;color:#666;line-height:1.6;">
📧 <strong>info@tmsvisa.com</strong><br>
🌐 <a href="https://www.tmsvisa.com" style="color:#0b5ed7;text-decoration:none;">www.tmsvisa.com</a><br><br>

🇦🇺 <strong>Australia Office</strong><br>
154 Peisley Street,<br>
Orange NSW 2800, Australia<br>
Migration Pty Ltd.<br>
ABN: 75 148 213 076<br><br>

🇮🇳 <strong>India Office</strong><br>
Delhi NCR, India<br>
Groworld Vijatour Pvt. Ltd.<br>
(Trade Name: The Migration School)<br>
CIN: U62099HR2024PTC122827
</p>

</div>`;

/**
 * Loads the 2 official attachments for the Australia 482 Information Pack:
 * 1. Australia Eligible Occupation List (691 Occupations)
 * 2. PTE Eligibility & Assessment Guide
 */
export async function getOfficialInfoAttachments(): Promise<
  { filename: string; content: Buffer; contentType: string }[]
> {
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  // 1. Occupation List (PDF)
  const occLocalPath = path.join(
    process.cwd(),
    "public",
    "attachments",
    "Australia_Eligible_Occupation_List_691.pdf"
  );
  if (fs.existsSync(occLocalPath)) {
    try {
      attachments.push({
        filename: "Australia Eligible Occupation List (691 Occupations).pdf",
        content: fs.readFileSync(occLocalPath),
        contentType: "application/pdf",
      });
    } catch (e) {
      console.warn("[WhatsApp Info Email] Could not read local occupation list:", e);
    }
  }

  // 2. PTE Eligibility & Assessment Guide (PDF preferred, PNG fallback)
  const ptePdfLocalPath = path.join(
    process.cwd(),
    "public",
    "attachments",
    "PTE_Eligibility_Assessment_Guide.pdf"
  );
  const ptePngLocalPath = path.join(
    process.cwd(),
    "public",
    "attachments",
    "PTE_Eligibility_Assessment_Guide.png"
  );

  if (fs.existsSync(ptePdfLocalPath)) {
    try {
      attachments.push({
        filename: "PTE Eligibility & Assessment Guide.pdf",
        content: fs.readFileSync(ptePdfLocalPath),
        contentType: "application/pdf",
      });
    } catch (e) {
      console.warn("[WhatsApp Info Email] Could not read local PTE PDF:", e);
    }
  } else if (fs.existsSync(ptePngLocalPath)) {
    try {
      attachments.push({
        filename: "PTE Eligibility & Assessment Guide.png",
        content: fs.readFileSync(ptePngLocalPath),
        contentType: "image/png",
      });
    } catch (e) {
      console.warn("[WhatsApp Info Email] Could not read local PTE PNG:", e);
    }
  }

  // If local files were not present, fallback to MongoDB GridFS download
  if (attachments.length < 2) {
    try {
      const { connectToDatabase } = await import("@/lib/mongodb");
      const { getGridFSBucket } = await import("@/lib/gridfs");
      const { db } = await connectToDatabase();
      const bucket = await getGridFSBucket();

      if (!attachments.some((a) => a.filename.includes("Occupation"))) {
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
      }

      if (!attachments.some((a) => a.filename.includes("PTE"))) {
        const pteFile = await db.collection("chatFiles.files").findOne({
          filename: { $regex: /EPT|PTE/i },
        });
        if (pteFile) {
          const stream = bucket.openDownloadStream(pteFile._id as ObjectId);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          const mime = (pteFile.contentType as string) || (pteFile.filename.endsWith(".pdf") ? "application/pdf" : "image/png");
          const ext = mime.includes("pdf") ? "pdf" : "png";
          attachments.push({
            filename: `PTE Eligibility & Assessment Guide.${ext}`,
            content: Buffer.concat(chunks),
            contentType: mime,
          });
        }
      }
    } catch (gridFsErr) {
      console.warn("[WhatsApp Info Email] GridFS attachment fallback error:", gridFsErr);
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
  const candidateName = name && !name.toLowerCase().includes("test") ? name : "Candidate";

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

    // Load both official attachments
    const attachments = await getOfficialInfoAttachments();

    // Send from info@tmsvisa.com
    const result = await sendEmail({
      from: "info@tmsvisa.com",
      fromName: "The Migration School (TMS Visa)",
      to: email,
      subject,
      html,
      attachments,
    });

    const now = new Date();

    // Record in email_history
    if (leadId) {
      await recordEmailHistory({
        leadId,
        leadName: candidateName,
        stage: "info",
        mailbox: "info@tmsvisa.com",
        templateName: "Australia Subclass 482 Information Pack",
        subject,
        bodyPreview: "Australia Subclass 482 Skills in Demand Work Visa Program Guide with 2 attachments.",
        status: result.success ? "sent" : "failed",
        isFollowup: false,
        followupNumber: 0,
        isPendingFollowup: false,
        cancelled: false,
        sentAt: now,
        sentBy: 0,
        sentByName: "WhatsApp Bot (Automated)",
        body: html,
      });
    }

    // Update whatsapp_sessions
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          infoEmailSentAt: now,
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
