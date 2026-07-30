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

import fs from "fs";
import path from "path";

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
    const { stage, templateId, customSubject, customHtml, workflowName, invoiceId, agrName, agrPhone, agrEmail, agrCountry } = body;

    if (!stage) return NextResponse.json({ error: "stage is required" }, { status: 400 });

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: parseInt(leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const mailbox = STAGE_MAILBOXES[stage as EmailStage];

    const targetName = agrName || lead.name || "";
    const targetEmail = agrEmail || lead.email || "";
    const targetPhone = agrPhone || lead.phone || "";
    const targetCountry = agrCountry || lead.country || "";

    let subject = customSubject || `${STAGE_LABELS[stage as EmailStage]} — ${targetName}`;
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
          CandidateName: targetName,
          candidatename: targetName,
          name: targetName,
          Name: targetName,
          Phone: targetPhone,
          phone: targetPhone,
          Email: targetEmail,
          email: targetEmail,
          Country: targetCountry,
          country: targetCountry,
          Program: workflowName || lead.program || "",
          program: workflowName || lead.program || "",
          CompanyName: "TMS Visa",
          ...invoiceData,
        };

        subject = replaceTemplateVars(template.subject, vars);
        html = replaceTemplateVars(template.html, vars);
      }
    }

    if (!html) {
      html = `<p>Dear ${targetName || "Candidate"},</p><p>Please see the information regarding your visa application.</p><p>Regards,<br/>TMS Visa Team</p>`;
    }

    // Guard: block send if target email is missing
    if (!targetEmail || targetEmail.trim() === "") {
      return NextResponse.json(
        { error: "No email address provided for the recipient." },
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

    if (stage === "agreement") {
      try {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "mm", format: "a4" });

        const todayDate = new Date().toLocaleDateString("en-GB");

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = 20;
        const marginRight = 20;
        const contentWidth = pageWidth - marginLeft - marginRight;
        const bottomMargin = 20;

        const HEADING_COLOR: [number, number, number] = [21, 96, 130]; // #156082 (matches template)
        const TEXT_COLOR: [number, number, number] = [30, 30, 30];

        let y = 12;

        const ensureSpace = (need: number) => {
          if (y + need > pageHeight - bottomMargin) {
            doc.addPage();
            y = 20;
          }
        };

        const addParagraph = (
          text: string,
          opts: {
            size?: number;
            bold?: boolean;
            align?: "left" | "center";
            color?: [number, number, number];
            spacingAfter?: number;
          } = {}
        ) => {
          const {
            size = 10,
            bold = false,
            align = "left",
            color = TEXT_COLOR,
            spacingAfter = 3,
          } = opts;
          doc.setFont("helvetica", bold ? "bold" : "normal");
          doc.setFontSize(size);
          doc.setTextColor(color[0], color[1], color[2]);
          const lines = doc.splitTextToSize(text, contentWidth);
          for (const line of lines) {
            ensureSpace(5);
            if (align === "center") {
              doc.text(line, pageWidth / 2, y, { align: "center" });
            } else {
              doc.text(line, marginLeft, y);
            }
            y += 5;
          }
          y += spacingAfter;
        };

        const addHeading = (number: string, title: string) => {
          ensureSpace(10);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(...HEADING_COLOR);
          doc.text(number ? `${number}. ${title}` : title, marginLeft, y);
          y += 7;
          doc.setTextColor(...TEXT_COLOR);
        };

        const addSubheading = (title: string) => {
          ensureSpace(8);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(...HEADING_COLOR);
          doc.text(title, marginLeft, y);
          y += 6;
          doc.setTextColor(...TEXT_COLOR);
        };

        const addBullets = (items: string[]) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...TEXT_COLOR);
          const indent = 6;
          for (const item of items) {
            const lines = doc.splitTextToSize(item, contentWidth - indent);
            lines.forEach((line: string, idx: number) => {
              ensureSpace(5);
              if (idx === 0) doc.text("\u2022", marginLeft, y);
              doc.text(line, marginLeft + indent, y);
              y += 5;
            });
          }
          y += 2;
        };

       // ---------- Header: logo + title ----------
        y = 12; // reduced top margin (reuses the y declared above, not a new variable)
        let logoLoaded = false;
        try {
          const logoPath = path.join(process.cwd(), "public", "tms-logo.png");
          const logoBase64 = fs.readFileSync(logoPath).toString("base64");
          doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", marginLeft, y, 20, 19);
          logoLoaded = true;
        } catch {
          // logo not found on disk, continue without it
        }
        y = 20; // fixed position for title, regardless of whether logo loaded

        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(...HEADING_COLOR);
        const title = "PROFESSIONAL SERVICES AGREEMENT";
        doc.text(title, pageWidth / 2, y, { align: "center" });
        const titleWidth = doc.getTextWidth(title);
        doc.setDrawColor(...HEADING_COLOR);
        doc.setLineWidth(0.4);
        doc.line(pageWidth / 2 - titleWidth / 2, y + 1.5, pageWidth / 2 + titleWidth / 2, y + 1.5);
        y += 9;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(80, 80, 80);
        doc.text("Australia Subclass 482 Skills in Demand Visa Programme", pageWidth / 2, y, { align: "center" });
        y += 10;
        doc.setTextColor(...TEXT_COLOR);

        addParagraph(
          `This Professional Services Agreement (\u201cAgreement\u201d) is entered into between: TMS \u2013 The Migration School (Trading name of Groworld Vijatour Pvt Ltd.) (\u201cTMS\u201d, \u201cCompany\u201d, \u201cWe\u201d, \u201cOur\u201d, or \u201cUs\u201d) AND`,
          { spacingAfter: 5 }
        );

        // ---------- Client details box ----------
        ensureSpace(28);
        doc.setDrawColor(210, 210, 210);
        doc.setFillColor(245, 248, 250);
        const boxY = y;
        doc.roundedRect(marginLeft, boxY, contentWidth, 24, 2, 2, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...TEXT_COLOR);
        doc.text(`Client Name: ${targetName}`, marginLeft + 4, boxY + 7);
        doc.text(`Nationality: ${targetCountry}`, marginLeft + contentWidth / 2, boxY + 7);
        doc.text(`Email Address: ${targetEmail}`, marginLeft + 4, boxY + 14);
        doc.text(`Phone Number: ${targetPhone}`, marginLeft + contentWidth / 2, boxY + 14);
        doc.text(`Date: ${todayDate}`, marginLeft + 4, boxY + 21);
        y = boxY + 24 + 8;

        // ---------- 1. Purpose ----------
        addHeading("1", "PURPOSE OF THIS AGREEMENT");
        addParagraph(
          "This Agreement sets out the terms and conditions under which TMS \u2013 The Migration School agrees to provide professional recruitment and related support services to assist the Client in securing employment with an Australian employer willing to sponsor the Client under the Australia Subclass 482 Skills in Demand Visa Programme."
        );
        addParagraph(
          "The Client acknowledges that this Agreement primarily covers recruitment-related services prior to employer selection. Migration services, where legally required, will only commence after the Client secures employment with an eligible Australian employer."
        );

        // ---------- 2. Case Manager ----------
        addHeading("2", "DEDICATED RECRUITMENT CASE MANAGER");
        addParagraph(
          "Upon signing this Agreement and payment of the Initial Professional Service Fee, TMS shall allocate a dedicated Recruitment Case Manager to the Client."
        );
        addParagraph("The Recruitment Case Manager shall remain responsible for the Client throughout the recruitment process until the Client receives:");
        addBullets([
          "An employment offer from an Australian employer;",
          "An official Offer Letter; and",
          "An Employment Contract.",
        ]);
        addParagraph("The Recruitment Case Manager shall coordinate the following:");
        addBullets([
          "Initial profile assessment;",
          "Australian CV preparation;",
          "Resume optimisation;",
          "Employer profile marketing;",
          "Communication with employers;",
          "Interview scheduling;",
          "Interview preparation;",
          "Employer follow-up;",
          "General recruitment assistance until employment is secured.",
        ]);
        addParagraph("For the commencement of this Agreement, the Client's dedicated Recruitment Case Manager shall be:");
        addParagraph("Mr. Sumit Kumar \u2013 Recruitment Expert \u2013 Phone: +91 81682 26462", { bold: true });
        addParagraph("Email: sumit.recruiter@tmsvisa.com", { bold: true, spacingAfter: 5 });
        addParagraph(
          "TMS reserves the right to change the assigned Recruitment Case Manager whenever operationally required. In such event, the Client shall be informed promptly and another qualified Recruitment Case Manager shall be assigned."
        );

        // ---------- 3. MARN ----------
        addHeading("3", "REGISTERED AUSTRALIAN MIGRATION AGENT (MARN)");
        addParagraph("The Client understands that recruitment services and migration services are two separate stages of the overall process.");
        addParagraph("At the commencement of this Agreement, TMS provides recruitment services only.");
        addParagraph("The services of a Registered Australian Migration Agent (MARN Holder) become necessary only after:");
        addBullets([
          "the Client successfully secures employment with an Australian sponsoring employer;",
          "the employer confirms sponsorship;",
          "employer nomination proceeds; and",
          "the visa application stage commences.",
        ]);
        addParagraph("Accordingly, the identity of the Registered Australian Migration Agent cannot be confirmed at the beginning of the recruitment process.");
        addParagraph("The allocation of the Registered Australian Migration Agent shall depend upon:");
        addBullets(["operational availability;", "workload;", "scheduling;", "complexity of the case; and", "internal allocation at that stage."]);
        addParagraph("Once the Client has successfully secured employment, TMS shall formally introduce the allocated Registered Australian Migration Agent and provide:");
        addBullets(["Full Name", "MARN Number", "Contact Details", "Scope of Migration Services"]);
        addParagraph(
          "The Client acknowledges that migration assistance requiring registration under Australian law shall only be provided by a Registered Australian Migration Agent or another legally authorised person as permitted under Australian law."
        );

        // ---------- 4. Scope of services ----------
        addHeading("4", "SCOPE OF PROFESSIONAL SERVICES");
        addParagraph("TMS agrees to provide the following services:");

        addSubheading("Stage 1 \u2013 Profile Assessment");
        addBullets(["Review of CV", "Review of qualifications", "Review of work experience", "Occupation eligibility assessment", "Initial suitability assessment"]);

        addSubheading("Stage 2 \u2013 Australian Resume Preparation");
        addParagraph("TMS shall prepare:");
        addBullets(["Australian Standard Resume", "Resume Optimisation", "Cover Letter (where required)", "Resume customisation for employer requirements"]);

        addSubheading("Stage 3 \u2013 Candidate Preparation");
        addBullets(["Interview guidance", "Employer interview preparation", "General recruitment counselling", "Weekend PTE guidance sessions (where applicable)"]);

        addSubheading("Stage 4 \u2013 Employer Marketing");
        addParagraph("TMS shall:");
        addBullets([
          "Present the Client's profile to existing employer partners;",
          "Market the Client's profile to additional Australian employers;",
          "Continue employer marketing until employment is secured or this Agreement is terminated;",
          "Coordinate employer interviews.",
        ]);

        addSubheading("Stage 5 \u2013 Employer Selection");
        addParagraph("Upon successful employer selection, the Client shall receive:");
        addBullets(["Employment Offer Letter", "Employment Contract"]);

        addSubheading("Stage 6 \u2013 Migration Services");
        addParagraph("After employment has been secured, TMS shall coordinate with the allocated Registered Australian Migration Agent for:");
        addBullets(["Employer Nomination", "Sponsorship documentation", "Visa documentation", "Visa application preparation", "Visa lodgement"]);

        // ---------- 5. Fees (real table) ----------
        addHeading("5", "PROFESSIONAL SERVICE FEES");
        {
          const rows: [string, string][] = [
            ["Stage", "Amount"],
            ["Initial Professional Service Fee", "AUD 300"],
            ["After Visa Grant", "AUD 700"],
            ["Total Professional Service Charges", "AUD 1,000 Only"],
          ];
          const col0 = contentWidth * 0.65;
          const col1 = contentWidth * 0.35;
          const rowHeight = 8;
          ensureSpace(rowHeight * rows.length + 4);
          let tableY = y;
          rows.forEach((row, rIdx) => {
            const isHeader = rIdx === 0;
            const isTotal = rIdx === rows.length - 1;
            if (isHeader) doc.setFillColor(21, 96, 130);
            else if (isTotal) doc.setFillColor(232, 240, 244);
            else doc.setFillColor(255, 255, 255);
            doc.rect(marginLeft, tableY, col0, rowHeight, "F");
            doc.rect(marginLeft + col0, tableY, col1, rowHeight, "F");
            doc.setDrawColor(200, 200, 200);
            doc.rect(marginLeft, tableY, col0, rowHeight);
            doc.rect(marginLeft + col0, tableY, col1, rowHeight);
            doc.setFont("helvetica", isHeader || isTotal ? "bold" : "normal");
            doc.setFontSize(10);
            if (isHeader) doc.setTextColor(255, 255, 255);
            else doc.setTextColor(...TEXT_COLOR);
            doc.text(row[0], marginLeft + 3, tableY + rowHeight / 2 + 1.5);
            doc.text(row[1], marginLeft + col0 + 3, tableY + rowHeight / 2 + 1.5);
            tableY += rowHeight;
          });
          y = tableY + 8;
          doc.setTextColor(...TEXT_COLOR);
        }

        // ---------- 6. Payment terms ----------
        addHeading("6", "PAYMENT TERMS");
        addParagraph("The Initial Professional Service Fee of AUD 300 becomes payable after:");
        addBullets(["Profile approval;", "Acceptance into the programme; and", "Signing of this Agreement."]);
        addParagraph("Professional work shall commence only after receipt of payment.");
        addParagraph("The remaining AUD 700 shall become payable only after the Client's visa has been granted.");

        // ---------- 7. Client responsibilities ----------
        addHeading("7", "CLIENT RESPONSIBILITIES");
        addParagraph("The Client agrees to:");
        addBullets([
          "Provide genuine information.",
          "Submit authentic documents.",
          "Attend scheduled interviews.",
          "Respond promptly to communications.",
          "Maintain a valid passport.",
          "Inform TMS of any material changes.",
        ]);

        // ---------- 8. Employer responsibilities ----------
        addHeading("8", "EMPLOYER RESPONSIBILITIES");
        addParagraph("The sponsoring employer shall independently determine:");
        addBullets(["Selection", "Salary", "Benefits", "Work location", "Working conditions", "Sponsorship"]);
        addParagraph("TMS has no authority over employer decisions.");

        // ---------- 9. Refund policy ----------
        addHeading("9", "REFUND POLICY");
        addParagraph(
          "The Initial Professional Service Fee covers professional services already rendered, including profile assessment, Australian resume preparation, employer marketing, and recruitment activities. Accordingly, once work has commenced, this fee is generally non-refundable."
        );
        addParagraph("The final professional service fee of AUD 700 becomes payable only after the Client's visa has been granted.");
        addParagraph("Our Service expenses are non-refundable.");

        // ---------- 10. Confidentiality ----------
        addHeading("10", "CONFIDENTIALITY");
        addParagraph("TMS shall maintain confidentiality of Client information except where disclosure is necessary for:");
        addBullets(["Employer recruitment", "Visa processing", "Legal compliance"]);

        // ---------- 11. Limitation of liability ----------
        addHeading("11", "LIMITATION OF LIABILITY");
        addParagraph("TMS shall not be responsible for:");
        addBullets([
          "Employer rejection",
          "Visa refusal because of character and medical reports",
          "Changes in Australian laws",
          "Government policy changes",
          "Processing delays",
          "Employer delays",
        ]);

        // ---------- 12. Termination ----------
        addHeading("12", "TERMINATION");
        addParagraph("Either party may terminate this Agreement by written notice.");
        addParagraph("Termination shall not affect payment obligations for services already completed.");

        // ---------- 13. Agreement validity ----------
        addHeading("13", "AGREEMENT VALIDITY");
        addParagraph(
          "This Agreement shall remain valid for a period of one (1) year from the date of commencement, being the date on which this Agreement is signed by both parties and the Initial Professional Service Fee has been received by TMS."
        );
        addParagraph(
          "During the validity period, TMS shall continue to provide the recruitment services outlined in this Agreement, including profile marketing, employer liaison, interview coordination, and recruitment support, subject to the terms and conditions of this Agreement."
        );

        // ---------- 14. Governing law ----------
        addHeading("14", "GOVERNING LAW");
        addParagraph("This Agreement shall be governed by the laws applicable in the jurisdiction where TMS is incorporated.");
        addParagraph(
          "Any migration assistance requiring registration shall be carried out in accordance with Australian Migration Law by a Registered Australian Migration Agent or another legally authorised person."
        );

        // ---------- 15. Client declaration ----------
        addHeading("15", "CLIENT DECLARATION");
        addParagraph("The Client confirms that:");
        addBullets([
          "All information provided is true.",
          "They understand employment cannot be guaranteed.",
          "They understand visa approval cannot be guaranteed.",
          "They have read and understood this Agreement.",
          "They voluntarily engage TMS for recruitment services.",
        ]);

        // ---------- Signatures ----------
        ensureSpace(10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...HEADING_COLOR);
        doc.text("SIGNATURES", marginLeft, y);
        y += 8;
        doc.setTextColor(...TEXT_COLOR);

        addSubheading("CLIENT");
        ensureSpace(22);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Name: ${targetName}`, marginLeft, y);
        y += 7;
        doc.text("Signature: ______________________", marginLeft, y);
        y += 7;
        doc.text("Date: ______________________", marginLeft, y);
        y += 12;

        addSubheading("TMS \u2013 THE MIGRATION SCHOOL");
        ensureSpace(18);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Authorised Representative: Ashish Kumar", marginLeft, y);
        y += 6;
        doc.text("Designation: Compliance Manager", marginLeft, y);
        y += 6;
        doc.text(`Date: ${todayDate}`, marginLeft, y);

        // ---------- Watermark + page numbers (single pass) ----------
        const totalPages = doc.internal.pages.length - 1; // pages[0] is a null placeholder
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);

          // Diagonal watermark
          doc.saveGraphicsState();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc as any).setGState(new (doc as any).GState({ opacity: 0.1 }));
          doc.setFont("helvetica", "bold");
          doc.setFontSize(35);
          doc.setTextColor(21, 96, 130);
          doc.text("THE MIGRATION SCHOOL", pageWidth / 2, pageHeight / 2, {
            align: "center",
            angle: 45,
          });
          doc.restoreGraphicsState();

          // Page number
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
        }

        const pdfArrayBuffer = doc.output("arraybuffer");
        emailAttachments.push({
          filename: `Agreement_${targetName.replace(/\s+/g, "_") || "Document"}.pdf`,
          content: Buffer.from(pdfArrayBuffer),
          contentType: "application/pdf",
        });
      } catch (pdfErr) {
        console.error("Failed to generate agreement PDF:", pdfErr);
      }
    }
    // Send the email
    const sendResult = await sendEmail({
      from: mailbox,
      fromName: "TMS Visa",
      to: targetEmail,
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
