import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// Inclusive-start / exclusive-end window for a single IST calendar day.
function dayWindow(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

interface LeadDoc {
  id: number;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  jobApplied?: string;
  status: string;
  assignedTo: number | null;
  assignedToName?: string;
  assignedBy?: number | null;
  assignedByName?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  caseManagerAssignedAt?: Date | string | null;
  salesDocument?: {
    fileId: string;
    fileName: string;
    uploadedAt: Date | string;
  };
}

// Read-only lead feed for Case Managers. A case manager only ever sees the
// leads that were handed to them after conversion to "sales" — they cannot
// create, edit, or reassign anything from here. Admins can also view this
// feed (across every case manager) for oversight.
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "case_manager" && payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.max(parseInt(searchParams.get("limit") || "10"), 1);
    const search = searchParams.get("search") || "";
    const country = searchParams.get("country") || "";
    const assignedTo = searchParams.get("assignedTo") || "";
    const assignedBy = searchParams.get("assignedBy") || "";
    const date = searchParams.get("date") || "";

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { assignedToRole: "case_manager" };

    if (payload.role === "case_manager") {
      filter.assignedTo = payload.id;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (country) {
      filter.country = { $regex: country, $options: "i" };
    }

    // Only admins get to pick an arbitrary case manager — for a case manager
    // this is already pinned to their own id above.
    if (assignedTo && payload.role === "admin") {
      const assignedToId = parseInt(assignedTo);
      if (!isNaN(assignedToId)) {
        filter.assignedTo = assignedToId;
      }
    }

    if (assignedBy) {
      const assignedById = parseInt(assignedBy);
      if (!isNaN(assignedById)) {
        filter.assignedBy = assignedById;
      }
    }

    const allMatchingLeadsRaw = (await db
      .collection("leads")
      .find(filter)
      .project({
        id: 1,
        name: 1,
        email: 1,
        phone: 1,
        country: 1,
        jobApplied: 1,
        status: 1,
        assignedTo: 1,
        assignedToName: 1,
        assignedBy: 1,
        assignedByName: 1,
        createdAt: 1,
        updatedAt: 1,
        caseManagerAssignedAt: 1,
        salesDocument: 1,
        occupations: 1,
      })
      .toArray()) as unknown as LeadDoc[];

    // If date parameter is present, filter using JS date parsing with fallbacks.
    // Checks caseManagerAssignedAt, then updatedAt, then createdAt.
    // Handles both ISO strings and BSON Date objects across legacy and new records.
    let allMatchingLeads = allMatchingLeadsRaw;
    if (date) {
      const { start, end } = dayWindow(date);
      allMatchingLeads = allMatchingLeadsRaw.filter((lead) => {
        const rawDate = lead.caseManagerAssignedAt || lead.createdAt;
        if (!rawDate) return false;
        const d = new Date(rawDate);
        return !isNaN(d.getTime()) && d >= start && d < end;
      });
    }

    const leadIds = allMatchingLeads.map((l) => l.id);

    // Fetch employers for all matching leads to check follow-up due status
    const employers = leadIds.length > 0
      ? await db.collection("case_marketing_employers").find({ leadId: { $in: leadIds } }).toArray()
      : [];

    const { getFollowupInfo } = await import("@/lib/caseMarketing");

    // Group employers by leadId and calculate due followups
    const dueFollowupsByLeadId = new Map<number, Array<{ employerId: number; companyName: string; stage: number }>>();

    for (const emp of employers) {
      if (!emp.emailSent) continue;
      const info = getFollowupInfo(emp.emailSentAt, emp.status, emp.lastFollowupAt, emp.followupCount || 0);
      if (info && !info.closed && info.isDueOrOverdue) {
        if (!dueFollowupsByLeadId.has(emp.leadId)) {
          dueFollowupsByLeadId.set(emp.leadId, []);
        }
        dueFollowupsByLeadId.get(emp.leadId)!.push({
          employerId: emp.id,
          companyName: emp.companyName,
          stage: info.stage,
        });
      }
    }

    // Attach follow-up info to leads
    const enrichedLeads = allMatchingLeads.map((lead) => {
      const dueList = dueFollowupsByLeadId.get(lead.id) || [];
      return {
        ...lead,
        hasFollowupDue: dueList.length > 0,
        dueFollowups: dueList,
      };
    });

    // Sort leads: leads with follow-up due float to top, then sorted by updatedAt
    enrichedLeads.sort((a, b) => {
      if (a.hasFollowupDue && !b.hasFollowupDue) return -1;
      if (!a.hasFollowupDue && b.hasFollowupDue) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const total = enrichedLeads.length;
    const paginatedLeads = enrichedLeads.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      leads: paginatedLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}