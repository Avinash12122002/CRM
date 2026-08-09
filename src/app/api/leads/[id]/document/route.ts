import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { getGridFSBucket } from "@/lib/gridfs";

// Streams the signed document attached to a lead when it was converted to
// "sales". Access is granted to: admin, case manager (assigned or role),
// and whoever uploaded the file.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
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
      payload.role === "case_manager" ||
      String(lead.assignedTo) === String(payload.id) ||
      String(lead.assignedBy) === String(payload.id) ||
      String(lead.createdBy) === String(payload.id) ||
      String(lead.salesDocument?.uploadedBy) === String(payload.id) ||
      (Array.isArray(lead.visibleTo) &&
        lead.visibleTo.some((v: unknown) => String(v) === String(payload.id)));

    if (!canAccess) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const rawFileId = lead.salesDocument.fileId;
    if (!ObjectId.isValid(rawFileId)) {
      return NextResponse.json({ message: "Invalid file reference" }, { status: 404 });
    }

    const bucket = await getGridFSBucket();
    const fileId = new ObjectId(rawFileId);

    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files.length) {
      return NextResponse.json({ message: "File not found" }, { status: 404 });
    }

    const file = files[0];
    const stream = bucket.openDownloadStream(fileId);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    const filename = file.filename || "document.pdf";
    const safeFilename = encodeURIComponent(filename);

    const contentType =
      file.contentType && file.contentType !== "application/octet-stream"
        ? file.contentType
        : "application/pdf";

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    console.error("GET DOCUMENT ERROR:", err);
    return NextResponse.json({ message: "Failed to load document" }, { status: 500 });
  }
}

