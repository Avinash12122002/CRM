import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

async function getAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

// GET /api/email/templates
export async function GET(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { db } = await connectToDatabase();
    const stage = req.nextUrl.searchParams.get("stage");
    const mailbox = req.nextUrl.searchParams.get("mailbox");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (stage) filter.stage = stage;
    if (mailbox) filter.mailbox = mailbox;

    const templates = await db
      .collection("email_templates")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[GET /api/email/templates]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// POST /api/email/templates
export async function POST(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, stage, mailbox, subject, html, isFollowup, workflowId, program, attachments } = body;

    if (!name || !stage || !mailbox || !subject || !html) {
      return NextResponse.json(
        { error: "name, stage, mailbox, subject, and html are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const doc = {
      _id: new ObjectId(),
      name,
      stage,
      mailbox,
      subject,
      html,
      isFollowup: isFollowup || false,
      workflowId: workflowId || null,
      program: program || null,
      attachments: attachments || [],
      createdBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("email_templates").insertOne(doc);
    return NextResponse.json({ template: doc }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/email/templates]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// PUT /api/email/templates (update by _id in body)
export async function PUT(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { _id, ...updates } = body;
    if (!_id) return NextResponse.json({ error: "_id required" }, { status: 400 });

    const { db } = await connectToDatabase();
    await db.collection("email_templates").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUT /api/email/templates]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// DELETE /api/email/templates?id=...
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { db } = await connectToDatabase();
    await db.collection("email_templates").deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/email/templates]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
