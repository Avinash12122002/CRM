import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getGridFSBucket } from "@/lib/gridfs";

const EXT_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const params = await context.params;

    if (!params.id || !ObjectId.isValid(params.id)) {
      return new Response("Invalid file ID", { status: 400 });
    }

    const bucket = await getGridFSBucket();
    const fileId = new ObjectId(params.id);

    const files = await bucket.find({ _id: fileId }).toArray();

    if (!files.length) {
      return new Response("File not found", { status: 404 });
    }

    const file = files[0];
    const filename = file.filename || "file";
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    let contentType =
      file.contentType && file.contentType !== "application/octet-stream"
        ? file.contentType
        : (file.metadata as any)?.mimeType && (file.metadata as any)?.mimeType !== "application/octet-stream"
        ? (file.metadata as any)?.mimeType
        : EXT_MIME_MAP[ext] || "application/octet-stream";

    if (ext === "pdf" && (!contentType || contentType === "application/octet-stream")) {
      contentType = "application/pdf";
    }

    const stream = bucket.openDownloadStream(fileId);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const totalSize = buffer.length;

    const safeFilename = encodeURIComponent(filename);

    const rangeHeader = req.headers.get("range");
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        return new Response("Requested range not satisfiable", {
          status: 416,
          headers: {
            "Content-Range": `bytes */${totalSize}`,
          },
        });
      }

      const chunk = buffer.subarray(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunk.length.toString(),
          "Content-Disposition": `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
        },
      });
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": totalSize.toString(),
        "Content-Disposition": `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      },
    });
  } catch (err) {
    console.error("[GET /api/chat/files/[id] Error]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}