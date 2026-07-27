// Client-only utility — generates and downloads a PDF receipt that matches
// the existing "PROFESSIONAL INVOICE" template (client/passport/address
// table, description/amount table, payment details, scan & pay QR banner).
//
// Requires the "jspdf" package: npm install jspdf
//
// Only ever call this from inside a browser event handler (e.g. after a
// successful POST to /api/billing/create) — it uses fetch()/Image() to load
// the QR banner from /public and jsPDF's document APIs, both browser-only.

export type BillingInvoice = {
  invoiceNumber: string;
  clientName: string;
  passportNumber: string;
  address: string;
  description: string;
  amount: number;
  org: string;
  accountNumber: string;
  bank: string;
  ifsc: string;
  upiId: string;
  createdAt: string | Date;
};

async function loadImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatINR(amount: number) {
  return `Rs.${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateInvoicePdf(bill: BillingInvoice) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 56;
  const tableWidth = pageWidth - marginX * 2;
  let y = 70;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PROFESSIONAL INVOICE", pageWidth / 2, y, { align: "center" });
  y += 40;

  const billDate = new Date(bill.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

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

  row("Client Name", bill.clientName.toUpperCase());
  row("Passport Number", bill.passportNumber.toUpperCase());
  row("Address", bill.address, 32);
  row("Invoice Date", billDate);
  row("Invoice Number", bill.invoiceNumber);

  y += 20;

  // Description / Amount table
  const descColWidth = tableWidth - 140;
  doc.setFillColor(224, 235, 250);
  doc.rect(marginX, y, descColWidth, 24, "F");
  doc.rect(marginX + descColWidth, y, 140, 24, "F");
  doc.setDrawColor(180, 180, 180);
  doc.rect(marginX, y, descColWidth, 24);
  doc.rect(marginX + descColWidth, y, 140, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", marginX + 8, y + 16);
  doc.text("Amount", marginX + descColWidth + 8, y + 16);
  y += 24;

  doc.rect(marginX, y, descColWidth, 24);
  doc.rect(marginX + descColWidth, y, 140, 24);
  doc.setFont("helvetica", "normal");
  doc.text(bill.description, marginX + 8, y + 16, { maxWidth: descColWidth - 16 });
  doc.text(formatINR(bill.amount), marginX + descColWidth + 8, y + 16);
  y += 24;

  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, y, descColWidth, 24, "F");
  doc.rect(marginX + descColWidth, y, 140, 24, "F");
  doc.rect(marginX, y, descColWidth, 24);
  doc.rect(marginX + descColWidth, y, 140, 24);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", marginX + 8, y + 16);
  doc.text(formatINR(bill.amount), marginX + descColWidth + 8, y + 16);
  y += 24;

  y += 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Payment Details", marginX, y);
  y += 16;

  row("Organization", bill.org, 22);
  row("Account Number", bill.accountNumber, 22);
  row("Bank", bill.bank, 22);
  row("IFSC", bill.ifsc, 22);
  row("UPI ID", bill.upiId, 22);

  y += 30;

  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(12);
  doc.text("Scan & Pay (QR Code)", marginX, y);
  y += 14;

  try {
    const dataUrl = await loadImageAsDataUrl("/billing/scan-pay1.png");
    const imgWidth = 320;
    const imgHeight = 180;
    doc.addImage(dataUrl, "PNG", marginX, y, imgWidth, imgHeight);
  } catch (err) {
    console.error("Failed to embed QR banner in invoice PDF:", err);
  }

  doc.save(`Invoice-${bill.invoiceNumber}-${bill.clientName.replace(/\s+/g, "_")}.pdf`);
}
