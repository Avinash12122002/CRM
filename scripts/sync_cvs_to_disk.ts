import { connectToDatabase } from "../src/lib/mongodb";
import { getGridFSBucket } from "../src/lib/gridfs";
import { ObjectId } from "mongodb";
import fs from "fs";
import path from "path";

async function syncCvs() {
  console.log("Starting sync of existing candidate CVs to cv/<phone>/ folder...");
  const { db } = await connectToDatabase();
  const bucket = await getGridFSBucket();

  const leads = await db
    .collection("leads")
    .find({
      "salesDocument.fileId": { $exists: true, $ne: null },
    })
    .project({ id: 1, name: 1, phone: 1, salesDocument: 1 })
    .toArray();

  console.log(`Found ${leads.length} leads with salesDocuments in GridFS.`);

  let syncedCount = 0;

  for (const lead of leads) {
    const rawPhone = String(lead.phone || `lead_${lead.id}`).trim();
    const cleanPhone = rawPhone.replace(/[^\d]/g, "").replace(/^00/, "") || `lead_${lead.id}`;
    const doc = lead.salesDocument;

    if (!doc?.fileId) continue;

    const fileName = doc.fileName || `resume_${lead.id}.pdf`;
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    const rootDir = path.join(process.cwd(), "cv", cleanPhone);
    const publicDir = path.join(process.cwd(), "public", "cv", cleanPhone);

    fs.mkdirSync(rootDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    const rootFilePath = path.join(rootDir, cleanFileName);
    const publicFilePath = path.join(publicDir, cleanFileName);

    try {
      const fileIdObj = typeof doc.fileId === "string" ? new ObjectId(doc.fileId) : doc.fileId;
      const downloadStream = bucket.openDownloadStream(fileIdObj);

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        downloadStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        downloadStream.on("error", (err) => reject(err));
        downloadStream.on("end", () => resolve());
      });

      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(rootFilePath, buffer);
      fs.writeFileSync(publicFilePath, buffer);

      console.log(`[Synced] Lead #${lead.id} (${lead.name}) -> cv/${cleanPhone}/${cleanFileName} (${buffer.length} bytes)`);
      syncedCount++;

      // Update lead document to link path
      await db.collection("leads").updateOne(
        { id: lead.id },
        {
          $set: {
            hasCv: true,
            lastCvUrl: `/cv/${cleanPhone}/${cleanFileName}`,
            lastUploadedCvPath: `cv/${cleanPhone}/${cleanFileName}`,
          },
          $addToSet: {
            cvFiles: {
              filename: cleanFileName,
              filePath: `cv/${cleanPhone}/${cleanFileName}`,
              url: `/cv/${cleanPhone}/${cleanFileName}`,
              mimeType: "application/pdf",
              size: buffer.length,
              syncedAt: new Date(),
            } as any,
          },
        }
      );
    } catch (err) {
      console.warn(`[Skip] Could not sync lead #${lead.id} (${doc.fileName}):`, err);
    }
  }

  console.log(`\nSuccessfully synced ${syncedCount} / ${leads.length} CVs to disk in 'cv/<phone>/' folder!`);
  process.exit(0);
}

syncCvs().catch((err) => {
  console.error("Sync error:", err);
  process.exit(1);
});
