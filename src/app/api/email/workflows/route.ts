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

// GET /api/email/workflows
export async function GET() {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = await connectToDatabase();
  const workflows = await db
    .collection("email_workflows")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  // Attach stage count to each
  const results = await Promise.all(
    workflows.map(async (wf) => {
      const stageCount = await db
        .collection("email_workflow_stages")
        .countDocuments({ workflowId: wf._id.toString() });
      return { ...wf, stageCount };
    })
  );

  return NextResponse.json({ workflows: results });
}

// POST /api/email/workflows
export async function POST(req: NextRequest) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, country, description, isActive, stages } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { db } = await connectToDatabase();

  const wfId = new ObjectId();
  const doc = {
    _id: wfId,
    name,
    country: country || null,
    description: description || null,
    isActive: isActive !== false,
    createdBy: user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("email_workflows").insertOne(doc);

  // Insert default stages if provided
  if (stages && Array.isArray(stages) && stages.length > 0) {
    const stageDocs = stages.map((s: Record<string, unknown>, i: number) => ({
      _id: new ObjectId(),
      workflowId: wfId.toString(),
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

  return NextResponse.json({ workflow: doc }, { status: 201 });
}
