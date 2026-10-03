import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

async function getAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `INV-${year}-${rand}`;
}

// GET /api/email/lead/[leadId]/invoice
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId } = await params;
    const { db } = await connectToDatabase();

    const invoices = await db
      .collection("invoices")
      .find({ leadId: parseInt(leadId) })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ invoices });
  } catch (err) {
    console.error("[GET /api/email/lead/invoice]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// POST /api/email/lead/[leadId]/invoice
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId } = await params;
    const body = await req.json();
    const { amount, currency, paymentLink, dueDate, remarks, program } = body;

    if (!amount || !paymentLink) {
      return NextResponse.json(
        { error: "amount and paymentLink are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: parseInt(leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    // Generate unique invoice number
    let invoiceNumber = generateInvoiceNumber();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.collection("invoices").findOne({ invoiceNumber });
      if (!existing) break;
      invoiceNumber = generateInvoiceNumber();
      attempts++;
    }

    const doc = {
      _id: new ObjectId(),
      leadId: parseInt(leadId),
      leadName: lead.name || "",
      invoiceNumber,
      amount: parseFloat(String(amount)),
      currency: currency || "AUD",
      paymentLink,
      dueDate: dueDate ? new Date(dueDate) : null,
      remarks: remarks || null,
      program: program || null,
      status: "pending" as const,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("invoices").insertOne(doc);
    return NextResponse.json({ invoice: doc }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/email/lead/invoice]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// PUT /api/email/lead/[leadId]/invoice - Update invoice status
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    void params;
    const body = await req.json();
    const { invoiceId, status, paymentReceivedAt } = body;

    if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

    const { db } = await connectToDatabase();
    await db.collection("invoices").updateOne(
      { _id: new ObjectId(invoiceId) },
      {
        $set: {
          status: status || "paid",
          paymentReceivedAt: paymentReceivedAt ? new Date(paymentReceivedAt) : new Date(),
          updatedAt: new Date(),
          updatedBy: user.id,
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUT /api/email/lead/invoice]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
