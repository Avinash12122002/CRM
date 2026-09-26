import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const rootCvDir = path.join(process.cwd(), "cv");

    if (!fs.existsSync(rootCvDir)) {
      return NextResponse.json({ success: true, folders: [] });
    }

    const phoneFolders = fs.readdirSync(rootCvDir);
    const result = [];

    // Fetch leads to map candidate names to phone numbers
    const leads = await db
      .collection("leads")
      .find({})
      .project({ id: 1, name: 1, phone: 1 })
      .toArray();

    const phoneToLeadMap = new Map<string, { id: number; name: string }>();
    leads.forEach((l) => {
      const clean = String(l.phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
      if (clean) phoneToLeadMap.set(clean, { id: l.id, name: l.name });
    });

    for (const phone of phoneFolders) {
      const folderPath = path.join(rootCvDir, phone);
      const stat = fs.statSync(folderPath);

      if (stat.isDirectory()) {
        const files = fs.readdirSync(folderPath);
        const fileDetails = files.map((fileName) => {
          const filePath = path.join(folderPath, fileName);
          const fStat = fs.statSync(filePath);
          return {
            fileName,
            sizeBytes: fStat.size,
            url: `/cv/${phone}/${fileName}`,
            modifiedAt: fStat.mtime,
          };
        });

        const leadInfo = phoneToLeadMap.get(phone);

        result.push({
          phone,
          leadId: leadInfo?.id || null,
          candidateName: leadInfo?.name || "Unknown / WhatsApp Candidate",
          totalFiles: files.length,
          files: fileDetails,
        });
      }
    }

    // Sort by latest modified
    result.sort((a, b) => {
      const aTime = a.files[0]?.modifiedAt?.getTime() || 0;
      const bTime = b.files[0]?.modifiedAt?.getTime() || 0;
      return bTime - aTime;
    });

    return NextResponse.json({
      success: true,
      totalCandidates: result.length,
      folders: result,
    });
  } catch (err) {
    console.error("[GET /api/cv/list Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
