import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Readable } from "stream";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getGridFSBucket } from "@/lib/gridfs";

// Converting a lead's status to "sales" requires a signed document (PDF) to
// be uploaded at the same time. On success the lead is automatically handed
// off to a Case Manager (least-loaded case_manager user is picked) instead
// of being returned to Admin the way other terminal statuses are. Every step
// is recorded in the lead's history so the full chain of custody can be
// audited later.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const caseManagerIdRaw = formData.get("caseManagerId") as string | null;

    if (!file) {
      return NextResponse.json(
        { message: "A signed document (PDF) is required to mark a lead as Sales" },
        { status: 400 },
      );
    }

    const isPdf =
      file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { message: "Only PDF files are accepted" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: leadId });
    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (
      (payload.role === "telecaller" || payload.role === "employee" || payload.role === "meeting") &&
      lead.assignedTo !== payload.id
    ) {
      return NextResponse.json(
        { message: "You can only update status of leads assigned to you" },
        { status: 403 },
      );
    }

    if (lead.isAgent) {
      return NextResponse.json(
        { message: "This lead is marked as Agent — unmark it before converting to Sales" },
        { status: 400 },
      );
    }

    const caseManagers = await db
      .collection("users")
      .find({ role: "case_manager" })
      .project({ id: 1, name: 1 })
      .toArray();

    if (!caseManagers.length) {
      return NextResponse.json(
        { message: "No Case Manager is set up yet. Please add a Case Manager user first." },
        { status: 400 },
      );
    }

    let caseManager;

    if (caseManagerIdRaw) {
      // Admin explicitly picked a Case Manager from the dropdown.
      const caseManagerId = parseInt(caseManagerIdRaw);
      caseManager = caseManagers.find((cm) => cm.id === caseManagerId);
      if (!caseManager) {
        return NextResponse.json(
          { message: "Selected Case Manager not found" },
          { status: 400 },
        );
      }
    } else {
      // Fallback: auto-pick the least-loaded case manager (fewest leads
      // currently sitting with them) if none was explicitly selected.
      const loadCounts = await db
        .collection("leads")
        .aggregate([
          { $match: { assignedToRole: "case_manager" } },
          { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
        ])
        .toArray();

      const loadMap = new Map<number, number>(
        loadCounts.map((c) => [c._id, c.count as number]),
      );

      caseManager = caseManagers[0];
      let lowestLoad = loadMap.get(caseManager.id) || 0;
      for (const cm of caseManagers) {
        const load = loadMap.get(cm.id) || 0;
        if (load < lowestLoad) {
          caseManager = cm;
          lowestLoad = load;
        }
      }
    }

    // Upload the PDF to GridFS, tagged with the lead it belongs to.
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const bucket = await getGridFSBucket();

    const uploadStream = bucket.openUploadStream(file.name, {
      contentType: "application/pdf",
      metadata: {
        leadId,
        type: "sales-document",
        uploadedBy: payload.id,
        uploadedByName: payload.name,
      },
    });

    await new Promise<void>((resolve, reject) => {
      Readable.from(buffer)
        .pipe(uploadStream)
        .on("error", reject)
        .on("finish", () => resolve());
    });

    const fileId = uploadStream.id.toString();
    const now = new Date();
    const oldStatus = lead.status;

    // Sales = Meeting Completed (same behaviour as the regular status route)
    await db.collection("meetingSlots").updateMany(
      { leadId, status: "scheduled" },
      { $set: { status: "completed", updatedAt: now } },
    );

    let meetingStatusUpdate: Record<string, unknown> = {};
    if (lead.meetingDetails) {
      meetingStatusUpdate = {
        meetingStatus: "completed",
        "meetingDetails.status": "completed",
        meetingCompletedAt: now,
      };
    }

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          status: "sales",
          callbackDate: null,
          callbackSeen: false,

          assignedTo: caseManager.id,
          assignedToName: caseManager.name,
          assignedToRole: "case_manager",
          caseManagerAssignedAt: now,

          assignedBy: payload.id,
          assignedByName: payload.name,
          assignedByRole: payload.role,

          salesDocument: {
            fileId,
            fileName: file.name,
            uploadedAt: now,
            uploadedBy: payload.id,
            uploadedByName: payload.name,
          },

          updatedAt: now,
          ...meetingStatusUpdate,
        },
        $push: {
          history: {
            $each: [
              {
                action: "status_updated",
                performedBy: payload.id,
                performedByName: payload.name,
                timestamp: now,
                details: `Status changed from "${oldStatus}" to "sales"`,
                oldStatus,
                newStatus: "sales",
              },
              {
                action: "document_uploaded",
                performedBy: payload.id,
                performedByName: payload.name,
                timestamp: now,
                details: `Uploaded signed document "${file.name}"`,
              },
              {
                action: "assigned",
                performedBy: payload.id,
                performedByName: payload.name,
                timestamp: now,
                details: caseManagerIdRaw
                  ? `Lead assigned to Case Manager ${caseManager.name}`
                  : `Lead auto-assigned to Case Manager ${caseManager.name}`,
                newAssignee: caseManager.id,
                newAssigneeName: caseManager.name,
              },
            ],
          },
        },
        $addToSet: { visibleTo: caseManager.id },
      },
    );

    return NextResponse.json({
      message: "Lead marked as Sales and assigned to Case Manager",
      caseManager: { id: caseManager.id, name: caseManager.name },
    });
  } catch (err) {
    console.error("CONVERT TO SALES ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
