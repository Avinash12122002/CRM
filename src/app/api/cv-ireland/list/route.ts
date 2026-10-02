import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export interface CandidateDocFile {
  id?: string;
  fileKey?: string;
  isViewed?: boolean;
  fileName: string;
  sizeBytes?: number;
  mimeType?: string;
  url: string;
  downloadUrl: string;
  source: "whatsapp_ireland" | "crm_upload" | "disk";
  receivedAt?: string;
}

export interface CandidateFolder {
  phone: string;
  leadId?: number | null;
  candidateName: string;
  country?: string;
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

    // Map to aggregate Ireland candidate folders by normalized phone number
    const foldersMap = new Map<string, CandidateFolder>();

    const getOrCreateFolder = (phone: string, name: string = "Candidate", leadId?: number | null) => {
      const cleanPhone = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "") || "Unknown";
      const cleanName = typeof name === "string" && name.trim() ? name.trim() : "Candidate";
      if (!foldersMap.has(cleanPhone)) {
        foldersMap.set(cleanPhone, {
          phone: cleanPhone,
          leadId: leadId || null,
          candidateName: cleanName,
          country: "Ireland",
          totalFiles: 0,
          files: [],
        });
      }
      const existing = foldersMap.get(cleanPhone)!;
      if (leadId && !existing.leadId) existing.leadId = leadId;
      if (cleanName && cleanName !== "Candidate" && existing.candidateName === "Candidate") {
        existing.candidateName = cleanName;
      }
      return existing;
    };

    // 1. Load from MongoDB `whatsapp_ireland_sessions`
    const irelandSessions = await db
      .collection("whatsapp_ireland_sessions")
      .find({
        $or: [
          { cvFiles: { $exists: true, $ne: [] } },
          { cvFileUrl: { $exists: true, $ne: null } },
        ],
      })
      .project({ phone: 1, name: 1, cvFiles: 1, cvFileUrl: 1, cvFileName: 1, cvReceivedAt: 1, leadId: 1 })
      .toArray();

    for (const sess of irelandSessions) {
      const folder = getOrCreateFolder(sess.phone, sess.name, sess.leadId);
      if (Array.isArray(sess.cvFiles)) {
        for (const file of sess.cvFiles) {
          const fileName = file.filename || file.fileName;
          if (!fileName) continue;
          const exists = folder.files.some((f) => f.fileName === fileName);
          if (!exists) {
            const fileUrl = file.gridFsFileId ? `/api/chat/files/${file.gridFsFileId}` : (file.publicUrl || sess.cvFileUrl);
            folder.files.push({
              id: file.gridFsFileId,
              fileName,
              sizeBytes: file.size,
              mimeType: file.mimeType || "application/pdf",
              url: fileUrl,
              downloadUrl: fileUrl,
              source: "whatsapp_ireland",
              receivedAt: file.receivedAt || sess.cvReceivedAt,
            });
          }
        }
      } else if (sess.cvFileUrl) {
        const fileName = sess.cvFileName || "Candidate_CV.pdf";
        const exists = folder.files.some((f) => f.fileName === fileName);
        if (!exists) {
          folder.files.push({
            fileName,
            url: sess.cvFileUrl,
            downloadUrl: sess.cvFileUrl,
            source: "whatsapp_ireland",
            receivedAt: sess.cvReceivedAt,
          });
        }
      }
    }

    // 2. Load Ireland leads from `leads` collection
    const irelandLeads = await db
      .collection("leads")
      .find({
        interestedCountry: "Ireland",
        $or: [
          { cvFiles: { $exists: true, $ne: [] } },
          { salesDocument: { $exists: true, $ne: null } },
        ],
      })
      .project({ id: 1, name: 1, phone: 1, cvFiles: 1, salesDocument: 1, cvFileName: 1, updatedAt: 1 })
      .toArray();

    for (const lead of irelandLeads) {
      const phone = String(lead.phone || `ireland_lead_${lead.id}`);
      const folder = getOrCreateFolder(phone, lead.name, lead.id);
      if (Array.isArray(lead.cvFiles)) {
        for (const file of lead.cvFiles) {
          const fileName = file.filename || file.fileName;
          if (!fileName) continue;
          const exists = folder.files.some((f) => f.fileName === fileName);
          if (!exists) {
            const fileUrl = file.gridFsFileId ? `/api/chat/files/${file.gridFsFileId}` : (file.publicUrl || lead.salesDocument);
            folder.files.push({
              id: file.gridFsFileId,
              fileName,
              sizeBytes: file.size,
              mimeType: file.mimeType || "application/pdf",
              url: fileUrl,
              downloadUrl: fileUrl,
              source: "whatsapp_ireland",
              receivedAt: file.receivedAt || lead.updatedAt,
            });
          }
        }
      } else if (lead.salesDocument) {
        const fileName = lead.cvFileName || "Ireland_Resume.pdf";
        const exists = folder.files.some((f) => f.fileName === fileName);
        if (!exists) {
          folder.files.push({
            fileName,
            url: lead.salesDocument,
            downloadUrl: lead.salesDocument,
            source: "whatsapp_ireland",
            receivedAt: lead.updatedAt,
          });
        }
      }
    }

    // 3. GridFS candidate documents tagged with Ireland
    const gridFiles = await db
      .collection("chatFiles.files")
      .find({
        $or: [
          { "metadata.country": "Ireland" },
          { "metadata.source": "whatsapp_ireland" },
        ],
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
          mimeType: gf.contentType || "application/pdf",
          url: `/api/chat/files/${gf._id.toString()}`,
          downloadUrl: `/api/chat/files/${gf._id.toString()}`,
          source: "whatsapp_ireland",
          receivedAt: gf.uploadDate || gf.metadata?.receivedAt,
        });
      }
    }

    // 4. Also check local disk for cv/ireland/ folders if any
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const diskDir = path.join(process.cwd(), "public", "cv", "ireland");
      try {
        const candidateDirs = await fs.readdir(diskDir);
        for (const phoneDir of candidateDirs) {
          const folderPath = path.join(diskDir, phoneDir);
          const stat = await fs.stat(folderPath);
          if (stat.isDirectory()) {
            const files = await fs.readdir(folderPath);
            for (const file of files) {
              const folder = getOrCreateFolder(phoneDir, "Candidate");
              const exists = folder.files.some((f) => f.fileName === file);
              if (!exists) {
                const publicUrl = `/cv/ireland/${phoneDir}/${file}`;
                folder.files.push({
                  fileName: file,
                  url: publicUrl,
                  downloadUrl: publicUrl,
                  source: "disk",
                });
              }
            }
          }
        }
      } catch {
        // Disk folder doesn't exist yet or is empty — ignore
      }
    } catch {
      // Local fs check non-fatal
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

    // Fetch viewed records for this admin user from `cv_ireland_viewed_records`
    const userId = payload.id;
    const userCandidates: any[] = [userId];
    if (typeof userId === "number") {
      userCandidates.push(String(userId));
    } else if (typeof userId === "string" && !isNaN(Number(userId))) {
      userCandidates.push(Number(userId));
    }
    const userFilter = { $in: Array.from(new Set(userCandidates)) };

    const viewedRecords = await db
      .collection("cv_ireland_viewed_records")
      .find({ userId: userFilter })
      .toArray();

    const allRecord = viewedRecords.find((r: any) => r.fileKey === "__ALL__");
    const allViewedAt = allRecord?.allViewedAt ? new Date(allRecord.allViewedAt).getTime() : 0;
    const viewedKeysSet = new Set(viewedRecords.map((r: any) => String(r.fileKey)));

    let unreadCount = 0;
    for (const folder of foldersArray) {
      for (const file of folder.files) {
        const fileKey = String(file.fileKey || file.id || `${folder.phone}_${file.fileName}`);
        file.fileKey = fileKey;

        const isIndividuallyViewed = viewedKeysSet.has(fileKey);
        const fileTime = file.receivedAt ? new Date(file.receivedAt).getTime() : 0;
        const isBeforeMarkAll = allViewedAt > 0 && fileTime > 0 && fileTime <= allViewedAt;

        file.isViewed = Boolean(isIndividuallyViewed || isBeforeMarkAll);
        if (!file.isViewed) {
          unreadCount++;
        }
      }
    }

    const totalDocuments = foldersArray.reduce((acc, f) => acc + f.totalFiles, 0);

    return NextResponse.json({
      success: true,
      rootName: "cv-ireland",
      country: "Ireland",
      totalCandidates: foldersArray.length,
      totalDocuments,
      unreadCount,
      folders: foldersArray,
    });
  } catch (err) {
    console.error("[GET /api/cv-ireland/list Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
