import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
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

    const leadId = parseInt(params.id);

    const { db } = await connectToDatabase();

    // Get lead with full history and user data
    const leads = await db
      .collection("leads")
      .aggregate([
        { $match: { id: leadId } },
        {
          $lookup: {
            from: "users",
            localField: "assignedTo",
            foreignField: "id",
            as: "assignedUser",
          },
        },
        {
          $unwind: {
            path: "$assignedUser",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "id",
            as: "creator",
          },
        },
        {
          $unwind: {
            path: "$creator",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            id: 1,
            name: 1,
            email: 1,
            phone: 1,
            company: 1,
            state: 1,
            city: 1,
            age: 1,
            passportType: 1,
            leadSource: 1,
            jobApplied: 1,
            status: 1,
            dueDate: 1,
            assignedTo: 1,
            assignedToName: "$assignedUser.name",
            assignedToEmail: "$assignedUser.email",
            assignedToUsername: "$assignedUser.username",
            assignedToRole: "$assignedUser.role",
            assignedBy: 1,
            assignedByName: 1,
            assignedByRole: 1,
            participants: 1,
            createdBy: 1,
            createdByName: "$creator.name",
            createdAt: 1,
            updatedAt: 1,
            history: 1,
            meetingDetails: 1,
            meetingStatus: 1,
            meetingCompletedAt: 1,
            meetingCancelledAt: 1,
            notes: 1,
          },
        },
      ])
      .toArray();

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    const lead = leads[0];

    // Check if employee can access this lead
    // Check if employee/meeting can access this lead

    if (
      (payload.role === "employee" || payload.role === "meeting") &&
      lead.assignedTo !== payload.id
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ lead });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
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

    const leadId = parseInt(params.id);
    const body = await req.json();
    const { note } = body;

    if (!note?.trim()) {
      return NextResponse.json(
        { message: "Note is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({ id: leadId });
    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Check permissions
    if (
      (payload.role === "employee" || payload.role === "meeting") &&
      lead.assignedTo !== payload.id
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const historyEntry = {
      action: "note_added",
      performedBy: payload.id,
      performedByName: payload.name,
      timestamp: now,
      details: note.trim(),
    };

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          updatedAt: now,
        },
        $push: {
          history: historyEntry,

          notes: {
            text: note.trim(),
            createdAt: now,
            createdBy: payload.id,
            createdByName: payload.name,
          },
        },
      },
    );

    return NextResponse.json({ message: "Note added successfully" });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
