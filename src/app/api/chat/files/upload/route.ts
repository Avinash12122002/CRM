import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { verifyToken, getNextId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getGridFSBucket } from "@/lib/gridfs";

export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";

    const matches =
      cookie.match(/(^|; )token=([^;]+)/);

    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const formData =
      await req.formData();

    const file =
      formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { message: "File required" },
        { status: 400 },
      );
    }

    const bytes =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(bytes);

    const bucket =
      await getGridFSBucket();

    const uploadStream =
      bucket.openUploadStream(
        file.name,
        {
          metadata: {
            uploadedBy:
              payload.id,

            uploadedByName:
              payload.name,

            mimeType:
              file.type,
          },
        },
      );

    await new Promise<void>(
      (resolve, reject) => {
        Readable.from(buffer)
          .pipe(uploadStream)
          .on("error", reject)
          .on("finish", () =>
            resolve(),
          );
      },
    );

    return NextResponse.json({
      fileId:
        uploadStream.id.toString(),

      fileName:
        file.name,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message:
          "Upload failed",
      },
      {
        status: 500,
      },
    );
  }
}