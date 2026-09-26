import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { verifyToken } from "@/lib/auth";
import { getGridFSBucket } from "@/lib/gridfs";

export async function DELETE(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { fileId } = body;

    if (!fileId || !ObjectId.isValid(fileId)) {
      return NextResponse.json(
        { message: "Invalid file ID" },
        { status: 400 }
      );
    }

    const bucket = await getGridFSBucket();
    const objId = new ObjectId(fileId);
    const files = await bucket.find({ _id: objId }).toArray();

    if (!files.length) {
      return NextResponse.json(
        { message: "File not found" },
        { status: 404 }
      );
    }

    const file = files[0];
    if (file.metadata?.uploadedBy !== payload.id && payload.role !== "admin") {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 }
      );
    }

    await bucket.delete(objId);

    return NextResponse.json({
      message: "File deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting file:", err);
    return NextResponse.json(
      { message: "Server Error" },
      { status: 500 }
    );
  }
}