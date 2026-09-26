import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { GridFSBucket, ObjectId } from "mongodb";

/**
 * DELETE /api/cv/delete
 *
 * Body (delete single file):
 *   { phone: string, fileId: string, fileName: string }
 *
 * Body (delete entire candidate folder / all files for a phone):
 *   { phone: string, deleteAll: true }
 */
export async function DELETE(req: NextRequest) {
  try {
    // Auth — admin only
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { phone, fileId, fileName, deleteAll } = body as {
      phone: string;
      fileId?: string;
      fileName?: string;
      deleteAll?: boolean;
    };

    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, "").replace(/^00/, "");
    const { db } = await connectToDatabase();
    const bucket = new GridFSBucket(db, { bucketName: "chatFiles" });

    // ─── DELETE ENTIRE CANDIDATE FOLDER ────────────────────────────────────────
    if (deleteAll) {
      // 1. Collect all gridFsFileIds from whatsapp_sessions
      const session = await db.collection("whatsapp_sessions").findOne({ phone: cleanPhone });
      const sessionFileIds: string[] = [];
      if (session?.cvFiles && Array.isArray(session.cvFiles)) {
        for (const f of session.cvFiles) {
          if (f.gridFsFileId) sessionFileIds.push(f.gridFsFileId);
        }
      }

      // 2. Collect all gridFsFileIds from leads
      const leadPhoneVariants = [cleanPhone, `+${cleanPhone}`, `+${cleanPhone.slice(2)}`];
      const leads = await db
        .collection("leads")
        .find({ phone: { $in: leadPhoneVariants } })
        .toArray();
      const leadFileIds: string[] = [];
      for (const lead of leads) {
        if (Array.isArray(lead.cvFiles)) {
          for (const f of lead.cvFiles) {
            if (f.gridFsFileId) leadFileIds.push(f.gridFsFileId);
          }
        }
      }

      // 3. Delete from GridFS
      const allFileIds = [...new Set([...sessionFileIds, ...leadFileIds])];
      let gridDeleted = 0;
      for (const id of allFileIds) {
        try {
          await bucket.delete(new ObjectId(id));
          gridDeleted++;
        } catch {
          // File may not exist in GridFS — skip
        }
      }

      // 4. Clear cvFiles array in whatsapp_sessions
      await db.collection("whatsapp_sessions").updateOne(
        { phone: cleanPhone },
        { $set: { cvFiles: [], cvReceivedAt: null, updatedAt: new Date() } }
      );

      // 5. Clear cvFiles array in leads
      for (const lead of leads) {
        await db.collection("leads").updateOne(
          { id: lead.id },
          { $set: { cvFiles: [], updatedAt: new Date() } }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${allFileIds.length} file(s) for candidate +${cleanPhone}`,
        gridDeleted,
      });
    }

    // ─── DELETE SINGLE FILE ─────────────────────────────────────────────────────
    if (!fileName) {
      return NextResponse.json({ error: "fileName is required to delete a single file" }, { status: 400 });
    }

    // 1. Delete from GridFS if fileId provided
    if (fileId) {
      try {
        await bucket.delete(new ObjectId(fileId));
      } catch {
        // May not exist in GridFS
      }
    }

    // 2. Remove from whatsapp_sessions.cvFiles
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $pull: {
          cvFiles: fileId
            ? { gridFsFileId: fileId }
            : { $or: [{ filename: fileName }, { fileName }] },
        } as any,
        $set: { updatedAt: new Date() },
      }
    );

    // 3. Remove from leads.cvFiles (any phone variant)
    const leadPhoneVariants = [cleanPhone, `+${cleanPhone}`, `+${cleanPhone.slice(2)}`];
    await db.collection("leads").updateMany(
      { phone: { $in: leadPhoneVariants } },
      {
        $pull: {
          cvFiles: fileId
            ? { gridFsFileId: fileId }
            : { $or: [{ filename: fileName }, { fileName }] },
        } as any,
        $set: { updatedAt: new Date() },
      }
    );

    return NextResponse.json({
      success: true,
      message: `File "${fileName}" deleted successfully`,
    });
  } catch (err) {
    console.error("[CV Delete API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
