import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { verifyToken } from "@/lib/auth";
import { getGridFSBucket } from "@/lib/gridfs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const bucket = await getGridFSBucket();

    const uploadStream = bucket.openUploadStream(file.name, {
      metadata: {
        uploadedBy: payload.id,
        uploadedByName: payload.name,
        mimeType: file.type,
        size: file.size,
      },
    });

    await new Promise<void>((resolve, reject) => {
      Readable.from(buffer)
        .pipe(uploadStream)
        .on("error", reject)
        .on("finish", () => resolve());
    });

    return NextResponse.json({
      fileId: uploadStream.id.toString(),
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  } catch (err) {
    console.error("[POST /api/email/templates/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
