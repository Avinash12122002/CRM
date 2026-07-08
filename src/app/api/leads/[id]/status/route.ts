import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(
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

  const body = await req.json();
const { status, callbackDate } = body;

    const validStatuses = [
      "new-lead",
      "call-back",
      "not-answering",
      "meeting-scheduled",
      "not-interested",
      "wrong-number",
      "document-pending",
      "payment-pending",
      "sales",
    ];

    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          message:
            "Invalid status. Must be one of: new-lead, call-back, not-answering, meeting-scheduled, not-interested, wrong-number, document-pending, payment-pending, sales",
        },
        { status: 400 },
      );
    }
   if (status === "call-back") {
  if (!callbackDate) {
    return NextResponse.json(
      {
        message: "Callback date is required.",
      },
      { status: 400 }
    );
  }

  const selectedDate = new Date(callbackDate + "T00:00:00");

  if (isNaN(selectedDate.getTime())) {
    return NextResponse.json(
      {
        message: "Invalid callback date.",
      },
      { status: 400 }
    );
  }
}
    const { db } = await connectToDatabase();

    const lead = await db.collection("leads").findOne({
      id: leadId,
    });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (
      (payload.role === "employee" || payload.role === "meeting") &&
      lead.assignedTo !== payload.id
    ) {
      return NextResponse.json(
        {
          message: "You can only update status of leads assigned to you",
        },
        { status: 403 },
      );
    }

    const now = new Date();
    const oldStatus = lead.status;
    let meetingStatusUpdate: Record<string, any> = {};

    // Sales = Meeting Completed
    if (status === "sales") {
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

      if (lead.meetingDetails) {
        meetingStatusUpdate = {
          meetingStatus: "completed",
          "meetingDetails.status": "completed",
          meetingCompletedAt: now,
        };
      }
    }

    // Not Interested / Wrong Number = Meeting Cancelled
    if (status === "not-interested" || status === "wrong-number") {
      await db.collection("meetingSlots").updateMany(
        {
          leadId,
          status: "scheduled",
        },
        {
          $set: {
            status: "cancelled",
            updatedAt: now,
          },
        },
      );

      if (lead.meetingDetails) {
        meetingStatusUpdate = {
          meetingStatus: "cancelled",
          "meetingDetails.status": "cancelled",
          meetingCancelledAt: now,
        };
      }
    }
    const shouldReturnToAdmin =
      payload.role !== "admin" &&
      ["wrong-number", "not-interested", "sales"].includes(status);

    const adminUser = shouldReturnToAdmin
      ? await db.collection("users").findOne({
          role: "admin",
        })
      : null;
await db.collection("leads").updateOne(
  { id: leadId },
  {
    $set: {
      status,
        ...(status === "call-back"
      ? {
          callbackDate: new Date(callbackDate + "T00:00:00"),
          callbackSeen: false,
        }
      : {
          callbackDate: null,
          callbackSeen: false,
        }),

      ...(shouldReturnToAdmin
        ? {
            assignedTo: adminUser?.id || null,
            assignedToName: adminUser?.name || null,
            assignedToRole: adminUser?.role || "admin",

            assignedBy: payload.id,
            assignedByName: payload.name,
            assignedByRole: payload.role,
          }
        : {}),

      updatedAt: now,
      ...meetingStatusUpdate,
    },

    $push: {
      history: {
        action: "status_updated",
        performedBy: payload.id,
        performedByName: payload.name,
        timestamp: now,
        details:
  status === "call-back"
    ? `Status changed from "${oldStatus}" to "call-back". Callback scheduled for ${new Date(callbackDate + "T00:00:00").toLocaleDateString("en-IN")}`
    : shouldReturnToAdmin
      ? `Status changed from "${oldStatus}" to "${status}" and reassigned to Admin`
      : `Status changed from "${oldStatus}" to "${status}"`,
        oldStatus,
        newStatus: status,
      },
    },

    $addToSet: shouldReturnToAdmin
      ? {
          visibleTo: payload.id,
        }
      : {},
  },
);

    return NextResponse.json(
      {
        message: "Lead status updated successfully",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("STATUS UPDATE ERROR:", err);

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
