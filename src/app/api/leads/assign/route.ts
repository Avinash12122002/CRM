import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

async function handleAssign(req: NextRequest) {
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
    const { leadId, assignedTo, meetingDate, startTime } = body;

    if (!leadId) {
      return NextResponse.json(
        { message: "Lead ID is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({
      id: leadId,
    });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    let assignedUser = null;

    if (assignedTo) {
      assignedUser = await db.collection("users").findOne({
        id: assignedTo,
      });

      if (!assignedUser) {
        return NextResponse.json(
          { message: "Assigned user not found" },
          { status: 400 },
        );
      }
    }

    if (assignedUser?.role === "meeting" && (!meetingDate || !startTime)) {
      return NextResponse.json(
        {
          message: "Meeting date and slot are required for meeting users",
        },
        { status: 400 },
      );
    }

    // =========================
    // ROLE PERMISSIONS
    // =========================

    if (payload.role !== "admin") {
      // Employee/Meeting can only reassign their own leads
      if (lead.assignedTo !== payload.id) {
        return NextResponse.json(
          {
            message: "Forbidden: You can only reassign your own leads",
          },
          { status: 403 },
        );
      }

      // Employee -> Admin or Meeting
      const allowedRoles = ["admin", "employee", "meeting"];

      if (
        payload.role !== "admin" &&
        assignedUser &&
        !allowedRoles.includes(assignedUser.role)
      ) {
        return NextResponse.json(
          {
            message: "Invalid assignment target",
          },
          { status: 403 },
        );
      }
    }

    const now = new Date();

    const historyEntry = {
      action: assignedTo ? "assigned" : "unassigned",

      performedBy: payload.id,
      performedByName: payload.name,
      performedByRole: payload.role,

      timestamp: now,
      meetingDate,
      startTime,

      details:
        assignedUser?.role === "meeting"
          ? `Meeting booked with ${assignedUser?.name} on ${meetingDate} at ${startTime}`
          : assignedTo
            ? `Lead assigned to ${assignedUser?.name} (${assignedUser?.role})`
            : "Lead unassigned",

      previousAssignee: lead.assignedTo || null,
      previousAssigneeName: lead.assignedToName || null,
      previousAssigneeRole: lead.assignedToRole || null,

      newAssignee: assignedTo || null,
      newAssigneeName: assignedUser?.name || null,
      newAssigneeRole: assignedUser?.role || null,
    };

    let meetingDetails = null;

    if (assignedUser && assignedUser.role === "meeting") {
      const existingSlot = await db.collection("meetingSlots").findOne({
        meetingUserId: assignedUser.id,
        meetingDate,
        startTime,
        status: "scheduled",
      });

      if (existingSlot) {
        return NextResponse.json(
          {
            message: "Selected meeting slot is already booked",
          },
          { status: 400 },
        );
      }

      // Remove previous slot only after validation succeeds
      await db.collection("meetingSlots").deleteMany({
        leadId,
      });

      const [hours, minutes] = startTime.split(":");

      const endDate = new Date();
      endDate.setHours(Number(hours), Number(minutes) + 30, 0, 0);

      const endTime = `${String(endDate.getHours()).padStart(
        2,
        "0",
      )}:${String(endDate.getMinutes()).padStart(2, "0")}`;

      meetingDetails = {
        meetingUserId: assignedUser.id,
        meetingUserName: assignedUser.name,
        meetingDate,
        startTime,
        endTime,
        status: "scheduled",
      };

      await db.collection("meetingSlots").insertOne({
        leadId,

        meetingUserId: assignedUser.id,
        meetingUserName: assignedUser.name,

        meetingDate,
        startTime,
        endTime,

        bookedBy: payload.id,
        bookedByName: payload.name,

        status: "scheduled",

        createdAt: now,
        updatedAt: now,
      });
    } else {
      // If assigned to Admin/Employee/unassigned
      await db.collection("meetingSlots").deleteMany({
        leadId,
      });
    }

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          assignedTo: assignedTo || null,
          assignedToName: assignedUser?.name || null,
          assignedToRole: assignedUser?.role || null,

          meetingDetails,

          meetingStatus: assignedUser?.role === "meeting" ? "scheduled" : null,

          meetingCompletedAt: null,
          meetingCancelledAt: null,

          status:
            assignedUser?.role === "meeting"
              ? "meeting-scheduled"
              : lead.status,

          assignedBy: payload.id,
          assignedByName: payload.name,
          assignedByRole: payload.role,

          updatedAt: now,
        },
        $push: {
          history: historyEntry,
        },

        $addToSet: {
          participants: {
            $each: assignedTo
              ? [payload.id, assignedTo, lead.assignedTo].filter(Boolean)
              : [payload.id],
          },
        },
      },
    );

    return NextResponse.json({
      message: "Lead assignment updated successfully",
    });
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

export async function POST(req: NextRequest) {
  return handleAssign(req);
}

export async function PUT(req: NextRequest) {
  return handleAssign(req);
}
