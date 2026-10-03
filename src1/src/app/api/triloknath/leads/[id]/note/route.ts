import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { logUserAction } from "@/lib/activity/audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { note } = body;
    if (!note || !note.trim()) {
      return NextResponse.json({ message: "Note is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection("triloknath_leads");

    const lead = await collection.findOne({ id: leadId });
    if (!lead) return NextResponse.json({ message: "Lead not found" }, { status: 404 });

    const now = new Date();
    const noteId = (lead.notes?.length || 0) + 1;
    const newNoteObj = {
      id: noteId,
      note: note.trim(),
      performedBy: payload.id,
      performedByName: payload.name,
      timestamp: now,
    };

    const historyObj = {
      action: "note_added",
      performedBy: payload.id,
      performedByName: payload.name,
      performedByRole: payload.role,
      timestamp: now,
      details: note.trim(),
    };

    await collection.updateOne(
      { id: leadId },
      {
        $set: { updatedAt: now },
        $push: {
          notes: newNoteObj,
          history: historyObj,
        },
      }
    );

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: "add_lead_note",
      entityType: "triloknath_lead",
      entityId: leadId,
      summary: `Added note to Triloknath lead "${lead.name || `#${leadId}`}": ${note.trim().slice(0, 70)}${note.trim().length > 70 ? "..." : ""}`,
      metadata: { leadId, note: note.trim() },
    });

    return NextResponse.json({ message: "Note added successfully" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
