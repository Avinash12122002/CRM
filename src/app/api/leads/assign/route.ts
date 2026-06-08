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
    const { leadId, assignedTo } = body;

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
      if (
        payload.role === "employee" &&
        assignedUser &&
        !["admin", "meeting", "employee"].includes(assignedUser.role)
      ) {
        return NextResponse.json(
          {
            message:
              "Employees can only assign leads to Admin or Meeting users",
          },
          { status: 403 },
        );
      }

      // Meeting -> Admin or Employee
      if (
        payload.role === "meeting" &&
        assignedUser &&
        !["admin", "meeting", "employee"].includes(assignedUser.role)
      ) {
        return NextResponse.json(
          {
            message:
              "Meeting users can only assign leads to Admin or Employee users",
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

      details: assignedTo
        ? `Lead assigned to ${assignedUser?.name} (${assignedUser?.role})`
        : "Lead unassigned",

      previousAssignee: lead.assignedTo || null,
      previousAssigneeName: lead.assignedToName || null,
      previousAssigneeRole: lead.assignedToRole || null,

      newAssignee: assignedTo || null,
      newAssigneeName: assignedUser?.name || null,
      newAssigneeRole: assignedUser?.role || null,
    };

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          assignedTo: assignedTo || null,
          assignedToName: assignedUser?.name || null,
          assignedToRole: assignedUser?.role || null,

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
            $each: assignedTo ? [payload.id, assignedTo] : [payload.id],
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
