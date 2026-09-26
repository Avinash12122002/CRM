import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { fileKey, fileKeys, markAll } = body;

    const { db } = await connectToDatabase();
    const col = db.collection("cv_viewed_records");

    if (markAll && Array.isArray(fileKeys) && fileKeys.length > 0) {
      const ops = fileKeys.map((k: string) => ({
        updateOne: {
          filter: { userId: payload.id, fileKey: String(k) },
          update: { $set: { userId: payload.id, fileKey: String(k), viewedAt: new Date() } },
          upsert: true,
        },
      }));
      await col.bulkWrite(ops);
      return NextResponse.json({ success: true, marked: fileKeys.length });
    }

    if (fileKey) {
      await col.updateOne(
        { userId: payload.id, fileKey: String(fileKey) },
        { $set: { userId: payload.id, fileKey: String(fileKey), viewedAt: new Date() } },
        { upsert: true }
      );
      return NextResponse.json({ success: true, fileKey });
    }

    return NextResponse.json({ error: "Missing fileKey or fileKeys" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/cv/viewed Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const records = await db
      .collection("cv_viewed_records")
      .find({ userId: payload.id })
      .project({ fileKey: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      viewedKeys: records.map((r) => r.fileKey),
    });
  } catch (err) {
    console.error("[GET /api/cv/viewed Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
