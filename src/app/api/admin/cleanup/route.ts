import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";

async function getAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  try {
    const admin = await getAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    
    // Calculate date 30 days ago
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    // 1. Auto-delete "Wrong Number" leads older than 1 month
    const wrongNumberLeads = await db.collection("leads").find({
      status: "wrong-number",
      updatedAt: { $lt: oneMonthAgo }
    }).toArray();

    if (wrongNumberLeads.length > 0) {
      const wrongNumberIds = wrongNumberLeads.map(l => l.id);
      
      // Delete leads
      await db.collection("leads").deleteMany({ id: { $in: wrongNumberIds } });
      // Delete associated workflows and history
      await db.collection("lead_workflows").deleteMany({ leadId: { $in: wrongNumberIds } });
      await db.collection("email_history").deleteMany({ leadId: { $in: wrongNumberIds } });
      // Delete invoices
      await db.collection("invoices").deleteMany({ leadId: { $in: wrongNumberIds } });
      
      console.log(`[Cleanup] Auto-deleted ${wrongNumberIds.length} 'Wrong Number' leads.`);
    }

    // 2. Check "Not Interested" leads condition
    const totalNotInterested = await db.collection("leads").countDocuments({
      status: "not-interested"
    });

    const notInterestedOlderThanMonth = await db.collection("leads").countDocuments({
      status: "not-interested",
      updatedAt: { $lt: oneMonthAgo }
    });

    // If total is >= 300 AND ALL of them are older than a month
    const promptNotInterested = totalNotInterested >= 300 && totalNotInterested === notInterestedOlderThanMonth;

    return NextResponse.json({
      success: true,
      promptNotInterested,
      notInterestedCount: totalNotInterested
    });

  } catch (err) {
    console.error("[Cleanup API Error]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    // Fetch all "Not Interested" leads older than 1 month
    const notInterestedLeads = await db.collection("leads").find({
      status: "not-interested",
      updatedAt: { $lt: oneMonthAgo }
    }).toArray();

    if (notInterestedLeads.length === 0) {
      return NextResponse.json({ error: "No leads found matching criteria" }, { status: 404 });
    }

    // Create CSV content
    const headers = ["ID", "Name", "Email", "Phone", "Company", "Status", "Created At", "Updated At", "Assigned To Name"];
    
    const escapeCSV = (str: string | undefined | null) => {
      if (!str) return "";
      const escaped = String(str).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvRows = notInterestedLeads.map(lead => [
      lead.id,
      escapeCSV(lead.name),
      escapeCSV(lead.email),
      escapeCSV(lead.phone),
      escapeCSV(lead.company),
      escapeCSV(lead.status),
      lead.createdAt ? new Date(lead.createdAt).toISOString() : "",
      lead.updatedAt ? new Date(lead.updatedAt).toISOString() : "",
      escapeCSV(lead.assignedToName)
    ].join(","));

    const csvContent = [headers.join(","), ...csvRows].join("\n");

    // Delete them
    const leadIds = notInterestedLeads.map(l => l.id);
    await db.collection("leads").deleteMany({ id: { $in: leadIds } });
    await db.collection("lead_workflows").deleteMany({ leadId: { $in: leadIds } });
    await db.collection("email_history").deleteMany({ leadId: { $in: leadIds } });
    await db.collection("invoices").deleteMany({ leadId: { $in: leadIds } });

    console.log(`[Cleanup] Exported and deleted ${leadIds.length} 'Not Interested' leads.`);

    // Return the CSV content in JSON so the frontend can trigger download
    return NextResponse.json({ success: true, csvData: csvContent, count: leadIds.length });

  } catch (err) {
    console.error("[Cleanup API Error]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
