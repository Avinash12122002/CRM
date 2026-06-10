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
        { message: "Lead ID required" },
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

    await db.collection("meetingSlots").updateMany(
      { leadId },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      },
    );

    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          meetingDetails: lead.meetingDetails
            ? {
                ...lead.meetingDetails,
                status: "cancelled",
              }
            : null,

          meetingStatus: "cancelled",
          updatedAt: new Date(),
        },
        $push: {
          history: {
            action: "meeting_cancelled",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: new Date(),
            details: "Meeting cancelled",
          },
        },
      },
    );

    return NextResponse.json({
      message: "Meeting cancelled successfully",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Server error",
      },
      { status: 500 },
    );
  }
}
