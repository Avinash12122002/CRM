import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken, getNextId } from "@/lib/auth";
import { logUserAction } from "@/lib/activity/audit";

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

    // Creating a general lead is part of the admin/telecaller/meeting workflow
    // on this page. Case managers, billing, and BD users work through their
    // own dedicated flows and should never reach this endpoint directly.
    if (
      payload.role !== "admin" &&
      payload.role !== "telecaller" && payload.role !== "employee" &&
      payload.role !== "meeting" &&
      payload.role !== "wtc" && payload.role !== "wm" && payload.role !== "supervisor" &&
      payload.role !== "follow_up" && payload.role !== "trainee"
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const {
      name,
      phone,
      email,
      status,
      assignedTo,
      dueDate,
      callbackDate,
      country,
      state,
      city,
      age,
      passportType,
      leadSource,
      jobApplied,
      note,
      interestedCountry,
    } = body;

    if (!phone) {
      return NextResponse.json(
        { message: "Phone is required" },
        { status: 400 },
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json(
        { message: "Please enter a valid email address" },
        { status: 400 },
      );
    }

    const cleanInterestedCountry =
      typeof interestedCountry === "string" ? interestedCountry.trim() : "";

    if (!cleanInterestedCountry || !["Australia", "Ireland"].includes(cleanInterestedCountry)) {
      return NextResponse.json(
        { message: "Interested country is required (Australia or Ireland)" },
        { status: 400 },
      );
    }

    if (status === "call-back") {
      if (!callbackDate) {
        return NextResponse.json(
          {
            message: "Callback date is required.",
          },
          { status: 400 },
        );
      }

      const selectedDate = new Date(callbackDate + "T00:00:00");

      if (isNaN(selectedDate.getTime())) {
        return NextResponse.json(
          {
            message: "Invalid callback date.",
          },
          { status: 400 },
        );
      }
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
        { status: 400 },
      );
    }

    // Telecaller, Meeting, Follow-Up & Trainee users auto-assign to themselves
    const finalAssignedTo =
      payload.role === "telecaller" ||
      payload.role === "employee" ||
      payload.role === "meeting" ||
      payload.role === "wtc" ||
      payload.role === "wm" ||
      payload.role === "supervisor" ||
      payload.role === "follow_up" ||
      payload.role === "trainee"
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

    const lead: Record<string, unknown> = {
      id,
      name: name || null,
      phone: cleanPhone,
      email: email ? String(email).trim() : null,
      country: country || null,
      state: state || null,
      city: city || null,
      age: age ? parseInt(age) : null,
      passportType: passportType || null,
      leadSource: leadSource || null,
      jobApplied: jobApplied || null,
      interestedCountry: cleanInterestedCountry,

      status: status || "new-lead",
      isAgent: false,
      ...(status === "call-back"
        ? {
            callbackDate: new Date(callbackDate + "T00:00:00"),
            callbackSeen: false,
          }
        : {
            callbackDate: null,
            callbackSeen: false,
          }),

      dueDate: dueDate ? new Date(dueDate + "T00:00:00") : null,

      assignedTo: finalAssignedTo || null,
      assignedToName: assignedUser?.name || null,
      assignedToRole: assignedUser?.role || null,

      assignedBy: payload.id,
      assignedByName: payload.name,
      assignedByRole: payload.role,

      createdBy: payload.id,
      createdAt: now,
      updatedAt: now,
      meetingDetails: null,
      meetingStatus: null,
      meetingCompletedAt: null,
      meetingCancelledAt: null,

      participants: finalAssignedTo ? [payload.id, finalAssignedTo] : [payload.id],
      visibleTo: finalAssignedTo ? [payload.id, finalAssignedTo] : [payload.id],

      history: [
        {
          action: "created",
          performedBy: payload.id,
          performedByName: payload.name,
          timestamp: now,
          details: "Lead created",
        },
        ...(status === "call-back"
          ? [
              {
                action: "callback_scheduled",
                performedBy: payload.id,
                performedByName: payload.name,
                timestamp: now,
                details: `Callback scheduled for ${new Date(
                  callbackDate + "T00:00:00",
                ).toLocaleDateString("en-IN")}`,
              },
            ]
          : []),
        ...(note?.trim()
          ? [
              {
                action: "note_added",
                performedBy: payload.id,
                performedByName: payload.name,
                timestamp: now,
                details: note.trim(),
              },
            ]
          : []),
        ...(finalAssignedTo
          ? [
              {
                action: "assigned",
                performedBy: payload.id,
                performedByName: payload.name,
                timestamp: now,
                details: `Lead assigned to ${assignedUser?.name || "Unknown"}`,
                newAssignee: finalAssignedTo,
                newAssigneeName: assignedUser?.name,
                newAssigneeRole: assignedUser?.role,
              },
            ]
          : []),
      ],
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

    await db.collection("leads").insertOne(lead);

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: "lead_created",
      entityType: "lead",
      entityId: id,
      summary: `Created lead #${id} (${lead.name}) with status "${lead.status}"`,
      metadata: { leadName: lead.name, phone: lead.phone, status: lead.status },
    });

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
