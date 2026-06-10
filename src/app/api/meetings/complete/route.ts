import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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

    const { leadId } = await req.json();

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

    // Admin can complete any meeting
    // Employee/Meeting can complete only their assigned lead
    if (payload.role !== "admin" && lead.assignedTo !== payload.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const now = new Date();

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          meetingStatus: "completed",

          meetingDetails: lead.meetingDetails
            ? {
                ...lead.meetingDetails,
                status: "completed",
              }
            : null,

          updatedAt: now,
        },

        $push: {
          history: {
            action: "meeting_completed",
            performedBy: payload.id,
            performedByName: payload.name,
            performedByRole: payload.role,
            timestamp: now,
            details: "Meeting completed",
          },
        },
      },
    );

    await db.collection("meetingSlots").updateMany(
      {
        leadId,
        status: "scheduled",
      },
      {
        $set: {
          status: "completed",
          updatedAt: now,
        },
      },
    );

    return NextResponse.json({
      message: "Meeting completed successfully",
    });
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        message: "Server Error",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
