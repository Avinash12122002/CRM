import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken, getNextId } from "@/lib/auth";

export async function POST(req: NextRequest) {
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

    const body = await req.json();

    const {
      name,
      phone,
      status,
      assignedTo,
      dueDate,
      state,
      city,
      age,
      passportType,
      leadSource,
      jobApplied,
      note,
    } = body;

    if (!phone) {
      return NextResponse.json(
        { message: "Phone is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    // Normalize phone number
const cleanPhone = String(phone).trim();

// Check if phone already exists
const existingLead = await db.collection("leads").findOne({
  phone: cleanPhone,
});

if (existingLead) {
  return NextResponse.json(
    {
      message: "Phone number already exists",
    },
    { status: 400 }
  );
}

    // Employee & Meeting users auto-assign to themselves
    const finalAssignedTo =
      payload.role === "employee" || payload.role === "meeting"
        ? payload.id
        : assignedTo;

    let assignedUser = null;

    if (finalAssignedTo) {
      assignedUser = await db
        .collection("users")
        .findOne({ id: finalAssignedTo });

      if (!assignedUser) {
        return NextResponse.json(
          { message: "Assigned user not found" },
          { status: 400 },
        );
      }
    }

    const id = await getNextId(db, "leads");
    const now = new Date();

    const lead: Record<string, any> = {
      id,
      name: name || null,
      phone: cleanPhone,
      state: state || null,
      city: city || null,
      age: age ? parseInt(age) : null,
      passportType: passportType || null,
      leadSource: leadSource || null,
      jobApplied: jobApplied || null,

      status: status || "new-lead",

      dueDate: dueDate ? new Date(dueDate) : null,

      assignedTo: finalAssignedTo || null,
      assignedToName: assignedUser?.name || null,
      assignedToRole: assignedUser?.role || null,

      assignedBy: payload.id,
      assignedByName: payload.name,
      assignedByRole: payload.role,

      createdBy: payload.id,
      participants: [payload.id],
      visibleTo: [payload.id],
      createdAt: now,
      updatedAt: now,
      meetingDetails: null,
      meetingStatus: null,
meetingCompletedAt: null,
meetingCancelledAt: null,

      history: [],
      notes: note?.trim()
        ? [
            {
              text: note.trim(),
              createdAt: now,
              createdBy: payload.id,
              createdByName: payload.name,
            },
          ]
        : [],
    };

    lead.history.push({
      action: "created",
      performedBy: payload.id,
      performedByName: payload.name,
      timestamp: now,
      details: "Lead created",
    });
    if (note?.trim()) {
      lead.history.push({
        action: "note_added",
        performedBy: payload.id,
        performedByName: payload.name,
        timestamp: now,
        details: note.trim(),
      });
    }

    if (finalAssignedTo) {
      lead.history.push({
        action: "assigned",
        performedBy: payload.id,
        performedByName: payload.name,
        timestamp: now,
        details: `Lead assigned to ${assignedUser?.name || "Unknown"}`,
        newAssignee: finalAssignedTo,
        newAssigneeName: assignedUser?.name,
        newAssigneeRole: assignedUser?.role,
      });
    }

    if (finalAssignedTo && !lead.participants.includes(finalAssignedTo)) {
      lead.participants.push(finalAssignedTo);
    }
    if (finalAssignedTo && !lead.visibleTo.includes(finalAssignedTo)) {
      lead.visibleTo.push(finalAssignedTo);
    }

    await db.collection("leads").insertOne(lead);

    return NextResponse.json(
      {
        message: "Lead created successfully",
        lead,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
