import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getGridFSBucket } from "@/lib/gridfs";

// Streams the signed document attached to a lead when it was converted to
// "sales". Access is restricted to: the admin, the case manager it is
// currently assigned to, and whoever uploaded the file — nobody else can
// pull the file even if they know the lead id.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const leadId = parseInt(id);
  if (isNaN(leadId)) {
    return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
  }

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

  const { db } = await connectToDatabase();
  const lead = await db.collection("leads").findOne({ id: leadId });

  if (!lead || !lead.salesDocument?.fileId) {
    return NextResponse.json({ message: "No document found for this lead" }, { status: 404 });
  }

  const canAccess =
    payload.role === "admin" ||
    lead.assignedTo === payload.id ||
    lead.salesDocument.uploadedBy === payload.id;

  if (!canAccess) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const bucket = await getGridFSBucket();
  const fileId = new ObjectId(lead.salesDocument.fileId);

  const files = await bucket.find({ _id: fileId }).toArray();
  if (!files.length) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }

  const file = files[0];
  const stream = bucket.openDownloadStream(fileId);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": file.contentType || "application/pdf",
      "Content-Disposition": `inline; filename="${file.filename}"`,
    },
  });
}
