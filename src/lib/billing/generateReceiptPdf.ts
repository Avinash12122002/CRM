// Client-only utility — generates the Payment Receipt PDF, downloaded when
// a payment (partial or final) is recorded from Billing History.
//
// Requires "jspdf".

export type BillingReceipt = {
  id: number;
  invoiceNumber: string;
  clientName: string;
  passportNumber: string;
  description: string;
  amount: number;
  paidAmount?: number;
  org: string;
  paidAt?: string | Date | null;
  createdAt: string | Date;
};

type RichSegment = { text: string; bold?: boolean };

function formatINR(amount: number) {
  return `${amount.toLocaleString("en-IN")}/-`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderRichText(
  doc: any,
  segments: RichSegment[],
  startX: number,
  startY: number,
  maxWidth: number,
  fontSize = 10.5,
  lineHeight = 15
): number {
  let x = startX;
  let y = startY;

  doc.setFontSize(fontSize);
  const spaceWidth = doc.getTextWidth(" ");

  segments.forEach((segment) => {
    const words = segment.text.split(" ").filter((w) => w.length > 0);
    doc.setFont("helvetica", segment.bold ? "bold" : "normal");

    words.forEach((word) => {
      const wordWidth = doc.getTextWidth(word);
      if (x + wordWidth > startX + maxWidth && x > startX) {
        x = startX;
        y += lineHeight;
      }
      doc.text(word, x, y);
      x += wordWidth + spaceWidth;
    });
  });

  return y + lineHeight;
}

export async function generateReceiptPdf(bill: BillingReceipt) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 56;
  const tableWidth = pageWidth - marginX * 2;
  let y = 55;

  const receiptNo = `TMS-RCPT-${String(bill.id).padStart(4, "0")}`;
  const receiptDate = new Date(bill.paidAt || bill.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const paidAmount = bill.paidAmount ?? bill.amount;
  const remainingAmount = Math.max(bill.amount - paidAmount, 0);
  const isFullyPaid = remainingAmount <= 0.01;
  const statusLabel = isFullyPaid ? "PAID IN FULL" : "PARTIAL PAYMENT";
  const statusColor: [number, number, number] = isFullyPaid ? [22, 140, 70] : [190, 130, 10];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(bill.org.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += 22;

  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.text("OFFICIAL PAYMENT RECEIPT", pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 18;

  // Status stamp, centered under the title
  const stampWidth = 150;
  const stampX = pageWidth / 2 - stampWidth / 2;
  doc.setDrawColor(...statusColor);
  doc.setLineWidth(1.5);
  doc.rect(stampX, y, stampWidth, 22);
  doc.setLineWidth(1);
  doc.setTextColor(...statusColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(statusLabel, pageWidth / 2, y + 15, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 34;

  doc.setDrawColor(180, 180, 180);
  doc.line(marginX, y, marginX + tableWidth, y);
  y += 26;

  const labelColWidth = 170;

  function row(label: string, value: string, height = 26, shaded = true) {
    if (shaded) {
      doc.setFillColor(240, 240, 240);
      doc.rect(marginX, y, labelColWidth, height, "F");
    }
    doc.setDrawColor(180, 180, 180);
    doc.rect(marginX, y, labelColWidth, height);
    doc.rect(marginX + labelColWidth, y, tableWidth - labelColWidth, height);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(label, marginX + 8, y + height / 2 + 3);

    doc.setFont("helvetica", "normal");
    doc.text(value, marginX + labelColWidth + 8, y + height / 2 + 3, {
      maxWidth: tableWidth - labelColWidth - 16,
    });

    y += height;
  }

  const halfWidth = tableWidth / 2;
  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, y, halfWidth, 26, "F");
  doc.rect(marginX + halfWidth, y, halfWidth, 26, "F");
  doc.rect(marginX, y, halfWidth, 26);
  doc.rect(marginX + halfWidth, y, halfWidth, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Receipt No.", marginX + 8, y + 16);
  doc.text("Receipt Date", marginX + halfWidth + 8, y + 16);
  y += 26;
  doc.rect(marginX, y, halfWidth, 24);
  doc.rect(marginX + halfWidth, y, halfWidth, 24);
  doc.setFont("helvetica", "normal");
  doc.text(receiptNo, marginX + 8, y + 16);
  doc.text(receiptDate, marginX + halfWidth + 8, y + 16);
  y += 24;
  y += 20;

  row("Client Name", bill.clientName.toUpperCase());
  row("Passport Number", bill.passportNumber.toUpperCase());

  y += 20;

  const descColWidth = tableWidth - 140;
  function headerCell(text: string, x: number, w: number) {
    doc.setFillColor(224, 235, 250);
    doc.rect(x, y, w, 24, "F");
    doc.setDrawColor(180, 180, 180);
    doc.rect(x, y, w, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(text, x + 8, y + 16);
  }
  headerCell("Particulars", marginX, descColWidth);
  headerCell("Amount (INR)", marginX + descColWidth, 140);
  y += 24;

  function dataRow(label: string, value: string, shaded = false) {
    if (shaded) {
      doc.setFillColor(240, 240, 240);
      doc.rect(marginX, y, descColWidth, 24, "F");
      doc.rect(marginX + descColWidth, y, 140, 24, "F");
    }
    doc.setDrawColor(180, 180, 180);
    doc.rect(marginX, y, descColWidth, 24);
    doc.rect(marginX + descColWidth, y, 140, 24);
    doc.setFont("helvetica", shaded ? "bold" : "normal");
    doc.setFontSize(10);
    doc.text(label, marginX + 8, y + 16, { maxWidth: descColWidth - 16 });
    doc.text(value, marginX + descColWidth + 8, y + 16);
    y += 24;
  }

  dataRow(bill.description, formatINR(bill.amount));
  dataRow("Amount Received", formatINR(paidAmount));
  dataRow("Outstanding Balance", isFullyPaid ? "0.00" : formatINR(remainingAmount), true);

  y += 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Receipt Confirmation", marginX, y);
  y += 18;

  const confirmationSegments: RichSegment[] = isFullyPaid
    ? [
        { text: "Received with thanks an amount of INR" },
        { text: formatINR(paidAmount), bold: true },
        { text: "from" },
        { text: bill.clientName.toUpperCase(), bold: true },
        { text: `towards ${bill.description}.` },
      ]
    : [
        { text: "Received with thanks a partial payment of INR" },
        { text: formatINR(paidAmount), bold: true },
        { text: "from" },
        { text: bill.clientName.toUpperCase(), bold: true },
        { text: `towards ${bill.description}, out of a total of INR` },
        { text: formatINR(bill.amount), bold: true },
        { text: ". A balance of INR" },
        { text: formatINR(remainingAmount), bold: true },
        { text: "remains due." },
      ];
  y = renderRichText(doc, confirmationSegments, marginX, y, tableWidth);

  y += 40;

  doc.save(`Receipt-${receiptNo}-${bill.clientName.replace(/\s+/g, "_")}.pdf`);
}