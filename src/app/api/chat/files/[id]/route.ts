import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getGridFSBucket } from "@/lib/gridfs";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const params = await context.params;

  if (!params.id || !ObjectId.isValid(params.id)) {
    return new Response("Invalid file ID", { status: 400 });
  }

  const bucket = await getGridFSBucket();
  const fileId = new ObjectId(params.id);

  const files = await bucket.find({ _id: fileId }).toArray();

  if (!files.length) {
    return new Response(
      "File not found",
      {
        status: 404,
      },
    );
  }

  const file = files[0];

  const stream =
    bucket.openDownloadStream(
      fileId,
    );

  return new Response(
    stream as unknown as BodyInit,
    {
      headers: {
        "Content-Type":
          file.contentType ||
          "application/octet-stream",

        "Content-Disposition":
          `inline; filename="${file.filename}"`,
      },
    },
  );
}