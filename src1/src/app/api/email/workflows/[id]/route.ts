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

// GET /api/email/workflows/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { db } = await connectToDatabase();

  const workflow = await db
    .collection("email_workflows")
    .findOne({ _id: new ObjectId(id) });

  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stages = await db
    .collection("email_workflow_stages")
    .find({ workflowId: id })
    .sort({ stageOrder: 1 })
    .toArray();

  return NextResponse.json({ workflow, stages });
}

// PUT /api/email/workflows/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { stages, ...updates } = body;

  const { db } = await connectToDatabase();

  await db.collection("email_workflows").updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );

  if (stages && Array.isArray(stages)) {
    // Replace all stages
    await db.collection("email_workflow_stages").deleteMany({ workflowId: id });
    if (stages.length > 0) {
      const stageDocs = stages.map((s: Record<string, unknown>, i: number) => ({
        _id: new ObjectId(),
        workflowId: id,
        stageOrder: i + 1,
        stageName: s.stageName,
        stageKey: s.stageKey,
        mailbox: s.mailbox,
        templateId: s.templateId || null,
        followupTemplateId: s.followupTemplateId || null,
        followupDays: s.followupDays || 3,
        autoSend: s.autoSend || false,
        createdAt: new Date(),
      }));
      await db.collection("email_workflow_stages").insertMany(stageDocs);
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/email/workflows/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { db } = await connectToDatabase();

  await db.collection("email_workflows").deleteOne({ _id: new ObjectId(id) });
  await db.collection("email_workflow_stages").deleteMany({ workflowId: id });

  return NextResponse.json({ success: true });
}
