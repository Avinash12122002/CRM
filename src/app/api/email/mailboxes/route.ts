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

// GET /api/email/mailboxes
export async function GET() {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { db } = await connectToDatabase();
    const mailboxes = await db
      .collection("email_mailboxes")
      .find({})
      .sort({ createdAt: 1 })
      .toArray();

    return NextResponse.json({ mailboxes });
  } catch (err) {
    console.error("[GET /api/email/mailboxes]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// POST /api/email/mailboxes
export async function POST(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { email, displayName, purpose, stage, smtpHost, smtpPort, smtpUser, smtpPass, isActive } = body;

    if (!email || !displayName || !purpose) {
      return NextResponse.json({ error: "email, displayName, and purpose are required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const existing = await db.collection("email_mailboxes").findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "Mailbox with this email already exists" }, { status: 409 });
    }

    const doc = {
      _id: new ObjectId(),
      email,
      displayName,
      purpose,
      stage: stage || null,
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || null,
      smtpUser: smtpUser || null,
      smtpPass: smtpPass || null,
      isActive: isActive !== false,
      createdBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("email_mailboxes").insertOne(doc);
    return NextResponse.json({ mailbox: doc }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/email/mailboxes]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// PUT /api/email/mailboxes (update by _id in body)
export async function PUT(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { _id, ...updates } = body;
    if (!_id) return NextResponse.json({ error: "_id required" }, { status: 400 });

    const { db } = await connectToDatabase();
    await db.collection("email_mailboxes").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUT /api/email/mailboxes]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}

// DELETE /api/email/mailboxes?id=...
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { db } = await connectToDatabase();
    await db.collection("email_mailboxes").deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/email/mailboxes]", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
