import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";
import { getAuthPayload, logBDActivity } from "@/lib/bd/helpers";
import { BD_COLLECTIONS, BD_ROLE } from "@/lib/bd/constants";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const leadId = parseInt(id);
    const body = await req.json();
    const note: string | undefined = body?.note?.trim();

    if (!note) {
      return NextResponse.json({ message: "Note text is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const lead = await db.collection(BD_COLLECTIONS.leads).findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    const isOwnerBD = payload.role === BD_ROLE && lead.assignedTo === payload.id;
    const isAdmin = payload.role === "admin";

    if (!isOwnerBD && !isAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const noteId = await getNextId(db, BD_COLLECTIONS.notes);
    const noteDoc = {
      id: noteId,
      leadId,
      note,
      createdBy: payload.id,
      createdByName: payload.name,
      createdAt: now,
    };

    await db.collection(BD_COLLECTIONS.notes).insertOne(noteDoc);

    await logBDActivity({
      db,
      leadId,
      action: "Note Added",
      userId: payload.id,
      userName: payload.name,
      newValue: note,
    });

    return NextResponse.json({ message: "Note added", note: noteDoc }, { status: 201 });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
