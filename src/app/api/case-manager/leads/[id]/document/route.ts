import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Readable } from "stream";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload } from "@/lib/caseMarketingAuth";
import { getGridFSBucket } from "@/lib/gridfs";

// PUT /api/case-manager/leads/:id/document
// Admin-only endpoint to re-upload or update the signed PDF document for a case lead.
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "admin") {
      return NextResponse.json(
        { message: "Only admin can re-upload PDF documents" },
        { status: 403 },
      );
    }

    const { id: paramId } = await context.params;
    const leadId = parseInt(paramId);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { message: "Please select a PDF file to upload" },
        { status: 400 },
      );
    }

    const isPdf =
      !file.type ||
      file.type === "application/pdf" ||
      file.type === "application/x-pdf" ||
      file.type === "application/octet-stream" ||
      file.name?.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { message: "Only PDF files are accepted" },
        { status: 400 },
      );
    }

    const MAX_FILE_SIZE = 4.5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          message: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 4.5MB`,
        },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    // Check general leads first, then triloknath_leads as fallback
    let collectionName = "leads";
    let lead = await db.collection("leads").findOne({ id: leadId });
    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne({ id: leadId });
      collectionName = "triloknath_leads";
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const bucket = await getGridFSBucket();

    // Delete old PDF file from GridFS if it exists to cleanly replace it
    const oldFileId = lead.salesDocument?.fileId;
    if (oldFileId && ObjectId.isValid(oldFileId)) {
      try {
        await bucket.delete(new ObjectId(oldFileId));
      } catch (delErr) {
        console.error("Could not delete old PDF from GridFS:", delErr);
      }
    }

    const sanitizedFileName = (file.name || "document.pdf").replace(/['"\\/]/g, "_");

    const uploadStream = bucket.openUploadStream(sanitizedFileName, {
      contentType: "application/pdf",
      metadata: {
        leadId,
        type: "sales-document-reupload",
        uploadedBy: payload.id,
        uploadedByName: payload.name,
      },
    });

    await new Promise<void>((resolve, reject) => {
      Readable.from(buffer)
        .pipe(uploadStream)
        .on("error", reject)
        .on("finish", () => resolve());
    });

    const fileId = uploadStream.id.toString();
    const now = new Date();

    const salesDoc = {
      fileId,
      fileName: sanitizedFileName,
      uploadedAt: now,
      uploadedBy: payload.id,
      uploadedByName: payload.name,
    };

    await db.collection(collectionName).updateOne(
      { id: leadId },
      {
        $set: {
          salesDocument: salesDoc,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "document_uploaded",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: `Admin re-uploaded signed document "${sanitizedFileName}"`,
          } as any,
        },
      },
    );

    return NextResponse.json({
      message: "PDF document updated successfully",
      salesDocument: salesDoc,
    });
  } catch (err) {
    console.error("REUPLOAD DOCUMENT ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}

// DELETE /api/case-manager/leads/:id/document
// Admin-only endpoint to delete the PDF document attached to a case lead.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "admin") {
      return NextResponse.json(
        { message: "Only admin can delete PDF documents" },
        { status: 403 },
      );
    }

    const { id: paramId } = await context.params;
    const leadId = parseInt(paramId);
    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    let collectionName = "leads";
    let lead = await db.collection("leads").findOne({ id: leadId });
    if (!lead) {
      lead = await db.collection("triloknath_leads").findOne({ id: leadId });
      collectionName = "triloknath_leads";
    }

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    if (!lead.salesDocument?.fileId) {
      return NextResponse.json(
        { message: "No document attached to this lead" },
        { status: 400 },
      );
    }

    const bucket = await getGridFSBucket();
    const oldFileId = lead.salesDocument.fileId;
    if (oldFileId && ObjectId.isValid(oldFileId)) {
      try {
        await bucket.delete(new ObjectId(oldFileId));
      } catch (delErr) {
        console.error("Could not delete PDF from GridFS:", delErr);
      }
    }

    const now = new Date();

    await db.collection(collectionName).updateOne(
      { id: leadId },
      {
        $unset: { salesDocument: "" },
        $set: { updatedAt: now },
        $push: {
          history: {
            action: "document_deleted",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details: "Admin deleted candidate PDF document",
          } as any,
        },
      },
    );

    return NextResponse.json({
      message: "PDF document deleted successfully",
    });
  } catch (err) {
    console.error("DELETE DOCUMENT ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}
