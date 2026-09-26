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
    const now = new Date();

    const userId = payload.id;
    const userCandidates: any[] = [userId];
    if (typeof userId === "number") {
      userCandidates.push(String(userId));
    } else if (typeof userId === "string" && !isNaN(Number(userId))) {
      userCandidates.push(Number(userId));
    }
    const userFilter = { $in: Array.from(new Set(userCandidates)) };

    // Handle "Mark all read"
    if (markAll) {
      // 1. Set global __ALL__ watermark for this admin user
      await col.updateOne(
        { userId: userFilter, fileKey: "__ALL__" },
        {
          $set: {
            userId,
            fileKey: "__ALL__",
            allViewedAt: now,
            viewedAt: now,
          },
        },
        { upsert: true }
      );

      // 2. Also record any individual file keys provided
      if (Array.isArray(fileKeys) && fileKeys.length > 0) {
        const ops = fileKeys.map((k: string) => ({
          updateOne: {
            filter: { userId: userFilter, fileKey: String(k) },
            update: { $set: { userId, fileKey: String(k), viewedAt: now } },
            upsert: true,
          },
        }));
        await col.bulkWrite(ops);
      }

      return NextResponse.json({
        success: true,
        markAll: true,
        allViewedAt: now,
        markedCount: fileKeys?.length || 0,
      });
    }

    // Handle single document mark as viewed
    if (fileKey) {
      await col.updateOne(
        { userId: userFilter, fileKey: String(fileKey) },
        { $set: { userId, fileKey: String(fileKey), viewedAt: now } },
        { upsert: true }
      );
      return NextResponse.json({ success: true, fileKey });
    }

    return NextResponse.json({ error: "Missing fileKey or markAll flag" }, { status: 400 });
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
    const userId = payload.id;
    const userCandidates: any[] = [userId];
    if (typeof userId === "number") {
      userCandidates.push(String(userId));
    } else if (typeof userId === "string" && !isNaN(Number(userId))) {
      userCandidates.push(Number(userId));
    }
    const userFilter = { $in: Array.from(new Set(userCandidates)) };

    const records = await db
      .collection("cv_viewed_records")
      .find({ userId: userFilter })
      .toArray();

    const allRecord = records.find((r: any) => r.fileKey === "__ALL__");

    return NextResponse.json({
      success: true,
      allViewedAt: allRecord?.allViewedAt || null,
      viewedKeys: records.map((r: any) => r.fileKey).filter((k: string) => k !== "__ALL__"),
    });
  } catch (err) {
    console.error("[GET /api/cv/viewed Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
