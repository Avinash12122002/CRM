import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export interface CandidateDocFile {
  id?: string;
  fileName: string;
  sizeBytes?: number;
  mimeType?: string;
  url: string;
  downloadUrl: string;
  source: "whatsapp" | "crm_upload";
  receivedAt?: string;
}

export interface CandidateFolder {
  phone: string;
  leadId?: number | null;
  candidateName: string;
  totalFiles: number;
  files: CandidateDocFile[];
  lastUpdated?: string;
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
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    // Map to aggregate candidate folders by normalized phone number
    const foldersMap = new Map<string, CandidateFolder>();

    const getOrCreateFolder = (phone: string, name: string = "Candidate", leadId?: number | null) => {
      const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
      if (!foldersMap.has(cleanPhone)) {
        foldersMap.set(cleanPhone, {
          phone: cleanPhone,
          leadId: leadId || null,
          candidateName: name,
          totalFiles: 0,
          files: [],
        });
      }
      const existing = foldersMap.get(cleanPhone)!;
      if (leadId && !existing.leadId) existing.leadId = leadId;
      if (name && name !== "Candidate" && existing.candidateName === "Candidate") {
        existing.candidateName = name;
      }
      return existing;
    };

    // 1. Load from MongoDB `leads` collection (Sales documents & attached CVs)
    const leadsWithDocs = await db
      .collection("leads")
      .find({
        $or: [
          { "salesDocument.fileId": { $exists: true, $ne: null } },
          { cvFiles: { $exists: true, $ne: [] } },
          { hasCv: true },
        ],
      })
      .project({
        id: 1,
        name: 1,
        phone: 1,
        salesDocument: 1,
        cvFiles: 1,
        updatedAt: 1,
      })
      .toArray();

    for (const lead of leadsWithDocs) {
      const phone = String(lead.phone || `lead_${lead.id}`);
      const folder = getOrCreateFolder(phone, lead.name, lead.id);

      // Add salesDocument if present
      if (lead.salesDocument?.fileName) {
        const fileId = String(lead.salesDocument.fileId);
        const fileName = lead.salesDocument.fileName;
        const exists = folder.files.some((f) => f.fileName === fileName);
        if (!exists) {
          folder.files.push({
            id: fileId,
            fileName,
            mimeType: "application/pdf",
            url: `/api/chat/files/${fileId}`,
            downloadUrl: `/api/chat/files/${fileId}`,
            source: "crm_upload",
            receivedAt: lead.salesDocument.uploadedAt || lead.updatedAt,
          });
        }
      }

      // Add cvFiles array if present
      if (Array.isArray(lead.cvFiles)) {
        for (const file of lead.cvFiles) {
          const fileName = file.filename || file.fileName;
          if (!fileName) continue;
          const exists = folder.files.some((f) => f.fileName === fileName);
          if (!exists) {
            const fileUrl = file.gridFsFileId ? `/api/chat/files/${file.gridFsFileId}` : file.publicUrl || `/api/leads/${lead.id}/document`;
            folder.files.push({
              id: file.gridFsFileId,
              fileName,
              sizeBytes: file.size,
              mimeType: file.mimeType || "application/pdf",
              url: fileUrl,
              downloadUrl: fileUrl,
              source: "whatsapp",
              receivedAt: file.receivedAt || file.syncedAt,
            });
          }
        }
      }
    }

    // 2. Load from MongoDB `whatsapp_sessions` collection
    const sessionsWithDocs = await db
      .collection("whatsapp_sessions")
      .find({
        cvFiles: { $exists: true, $ne: [] },
      })
      .project({ phone: 1, name: 1, cvFiles: 1, leadId: 1 })
      .toArray();

    for (const sess of sessionsWithDocs) {
      const folder = getOrCreateFolder(sess.phone, sess.name, sess.leadId);
      if (Array.isArray(sess.cvFiles)) {
        for (const file of sess.cvFiles) {
          const fileName = file.filename || file.fileName;
          if (!fileName) continue;
          const exists = folder.files.some((f) => f.fileName === fileName);
          if (!exists) {
            const fileUrl = file.gridFsFileId ? `/api/chat/files/${file.gridFsFileId}` : file.publicUrl;
            folder.files.push({
              id: file.gridFsFileId,
              fileName,
              sizeBytes: file.size,
              mimeType: file.mimeType,
              url: fileUrl,
              downloadUrl: fileUrl,
              source: "whatsapp",
              receivedAt: file.receivedAt,
            });
          }
        }
      }
    }

    // 3. Query GridFS `chatFiles.files` for any WhatsApp candidate media
    const gridFiles = await db
      .collection("chatFiles.files")
      .find({
        "metadata.candidatePhone": { $exists: true },
      })
      .toArray();

    for (const gf of gridFiles) {
      const phone = gf.metadata?.candidatePhone;
      if (!phone) continue;
      const folder = getOrCreateFolder(phone, gf.metadata?.senderName);
      const fileName = gf.filename;
      const exists = folder.files.some((f) => f.fileName === fileName);
      if (!exists) {
        folder.files.push({
          id: gf._id.toString(),
          fileName,
          sizeBytes: gf.length,
          mimeType: gf.contentType,
          url: `/api/chat/files/${gf._id.toString()}`,
          downloadUrl: `/api/chat/files/${gf._id.toString()}`,
          source: "whatsapp",
          receivedAt: gf.uploadDate || gf.metadata?.receivedAt,
        });
      }
    }

    // Compute totals and sort
    const foldersArray: CandidateFolder[] = Array.from(foldersMap.values())
      .filter((f) => f.files.length > 0)
      .map((f) => {
        f.totalFiles = f.files.length;
        f.lastUpdated = f.files[0]?.receivedAt || new Date().toISOString();
        return f;
      });

    // Sort folders by total files descending
    foldersArray.sort((a, b) => b.totalFiles - a.totalFiles);

    const totalDocuments = foldersArray.reduce((acc, f) => acc + f.totalFiles, 0);

    return NextResponse.json({
      success: true,
      rootName: "cv",
      totalCandidates: foldersArray.length,
      totalDocuments,
      folders: foldersArray,
    });
  } catch (err) {
    console.error("[GET /api/cv/list Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
