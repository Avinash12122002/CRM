import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { GridFSBucket, ObjectId } from "mongodb";

/**
 * DELETE /api/cv-ireland/delete
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

    // ─── DELETE ENTIRE IRELAND CANDIDATE FOLDER ────────────────────────────────
    if (deleteAll) {
      // 1. Collect all gridFsFileIds from whatsapp_ireland_sessions
      const session = await db.collection("whatsapp_ireland_sessions").findOne({ phone: cleanPhone });
      const sessionFileIds: string[] = [];
      if (session?.cvFiles && Array.isArray(session.cvFiles)) {
        for (const f of session.cvFiles) {
          if (f.gridFsFileId) sessionFileIds.push(f.gridFsFileId);
        }
      }

      // 2. Collect all gridFsFileIds from Ireland leads
      const leadPhoneVariants = [cleanPhone, `+${cleanPhone}`, `+${cleanPhone.slice(2)}`];
      const leads = await db
        .collection("leads")
        .find({ phone: { $in: leadPhoneVariants }, interestedCountry: "Ireland" })
        .toArray();
      const leadFileIds: string[] = [];
      for (const lead of leads) {
        if (Array.isArray(lead.cvFiles)) {
          for (const f of lead.cvFiles) {
            if (f.gridFsFileId) leadFileIds.push(f.gridFsFileId);
          }
        }
      }

      // 3. Collect from GridFS chatFiles.files where metadata matches Ireland candidate
      const gridFiles = await db
        .collection("chatFiles.files")
        .find({
          "metadata.candidatePhone": { $in: [cleanPhone, `+${cleanPhone}`] },
          $or: [
            { "metadata.country": "Ireland" },
            { "metadata.source": "whatsapp_ireland" },
          ],
        })
        .toArray();
      const gridCandidateFileIds = gridFiles.map((gf) => gf._id.toString());

      // 4. Delete all collected files from GridFS
      const allFileIds = [...new Set([...sessionFileIds, ...leadFileIds, ...gridCandidateFileIds])];
      let gridDeleted = 0;
      for (const id of allFileIds) {
        try {
          await bucket.delete(new ObjectId(id));
          gridDeleted++;
        } catch {
          // File may not exist in GridFS — skip
        }
      }

      // 5. Clear cvFiles and CV tracking flags in whatsapp_ireland_sessions
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        {
          $set: {
            cvFiles: [],
            cvReceivedAt: null,
            cvFileUrl: null,
            cvFileName: null,
            updatedAt: new Date(),
          },
        }
      );

      // 6. Clear cvFiles and salesDocument in Ireland leads
      await db.collection("leads").updateMany(
        { phone: { $in: leadPhoneVariants }, interestedCountry: "Ireland" },
        {
          $set: {
            cvFiles: [],
            salesDocument: null,
            cvFileName: null,
            updatedAt: new Date(),
          },
        }
      );

      // 7. Clean up local disk files if any
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const cvDir = path.join(process.cwd(), "cv", "ireland", cleanPhone);
        const publicCvDir = path.join(process.cwd(), "public", "cv", "ireland", cleanPhone);
        await fs.rm(cvDir, { recursive: true, force: true });
        await fs.rm(publicCvDir, { recursive: true, force: true });
      } catch {
        // Disk cleanup best effort
      }

      return NextResponse.json({
        success: true,
        deletedCandidate: cleanPhone,
        gridDeleted,
        message: `All CV documents for +${cleanPhone} (Ireland) have been removed.`,
      });
    }

    // ─── DELETE SINGLE IRELAND FILE ─────────────────────────────────────────────
    if (!fileName && !fileId) {
      return NextResponse.json({ error: "fileName or fileId is required to delete a single file" }, { status: 400 });
    }

    let deletedGridFS = false;

    // 1. Delete from GridFS if fileId provided
    if (fileId && ObjectId.isValid(fileId)) {
      try {
        await bucket.delete(new ObjectId(fileId));
        deletedGridFS = true;
      } catch {
        // Might already be removed
      }
    }

    // 2. Remove from whatsapp_ireland_sessions cvFiles array
    if (fileName) {
      await db.collection("whatsapp_ireland_sessions").updateOne(
        { phone: cleanPhone },
        {
          $pull: {
            cvFiles: {
              $or: [
                { filename: fileName },
                { fileName: fileName },
                ...(fileId ? [{ gridFsFileId: fileId }] : []),
              ],
            } as any,
          },
          $set: { updatedAt: new Date() },
        }
      );
    }

    // 3. Remove from Ireland leads cvFiles array
    const leadPhoneVariants = [cleanPhone, `+${cleanPhone}`, `+${cleanPhone.slice(2)}`];
    if (fileName) {
      await db.collection("leads").updateMany(
        { phone: { $in: leadPhoneVariants }, interestedCountry: "Ireland" },
        {
          $pull: {
            cvFiles: {
              $or: [
                { filename: fileName },
                { fileName: fileName },
                ...(fileId ? [{ gridFsFileId: fileId }] : []),
              ],
            } as any,
          },
          $set: { updatedAt: new Date() },
        }
      );
    }

    // 4. Delete from local disk
    if (fileName) {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const cvFilePath = path.join(process.cwd(), "cv", "ireland", cleanPhone, fileName);
        const publicFilePath = path.join(process.cwd(), "public", "cv", "ireland", cleanPhone, fileName);
        await fs.rm(cvFilePath, { force: true });
        await fs.rm(publicFilePath, { force: true });
      } catch {
        // Best effort
      }
    }

    return NextResponse.json({
      success: true,
      deletedFile: fileName || fileId,
      deletedGridFS,
      message: `File "${fileName || fileId}" (Ireland) deleted successfully.`,
    });
  } catch (err) {
    console.error("[DELETE /api/cv-ireland/delete Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
