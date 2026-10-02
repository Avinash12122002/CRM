import { Db } from "mongodb";
import { sendTextMessage } from "./client";
import { createNotification } from "@/lib/notifications";

/**
 * Downloads a media file (PDF document or image) from Meta WhatsApp Cloud API for Ireland.
 */
export async function downloadWhatsAppIrelandMedia(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  const token = process.env.WHATSAPP_IRELAND_TOKEN || process.env.WHATSAPP_TOKEN || "";
  if (!token) {
    console.warn("[WhatsApp Ireland Media] WHATSAPP_IRELAND_TOKEN is not configured.");
    return null;
  }

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      console.error(
        "[WhatsApp Ireland Media] Failed to get media info from Meta:",
        await metaRes.text(),
      );
      return null;
    }

    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    const mimeType = metaData.mime_type || "application/octet-stream";

    if (!downloadUrl) {
      console.error("[WhatsApp Ireland Media] No download URL returned by Meta:", metaData);
      return null;
    }

    const binaryRes = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "TMS-CRM-WhatsApp-Ireland/1.0",
      },
    });

    if (!binaryRes.ok) {
      console.error(
        "[WhatsApp Ireland Media] Binary download failed:",
        binaryRes.status,
        binaryRes.statusText,
      );
      return null;
    }

    const arrayBuffer = await binaryRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
    };
  } catch (err) {
    console.error("[WhatsApp Ireland Media Download Error]", err);
    return null;
  }
}

function sanitizeFilename(originalName?: string, mimeType?: string, fallbackPrefix: string = "file"): string {
  let ext = "";
  if (mimeType) {
    if (mimeType.includes("pdf")) ext = ".pdf";
    else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = ".jpg";
    else if (mimeType.includes("png")) ext = ".png";
    else if (mimeType.includes("webp")) ext = ".webp";
    else if (mimeType.includes("msword")) ext = ".doc";
    else if (mimeType.includes("wordprocessingml")) ext = ".docx";
  }

  if (originalName) {
    const clean = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (clean.includes(".")) return clean;
    return `${clean}${ext || ".bin"}`;
  }

  const timestamp = Date.now();
  return `${fallbackPrefix}_${timestamp}${ext || ".bin"}`;
}

/**
 * Handles incoming document (PDF) or image sent by an Ireland candidate over WhatsApp.
 * Creates folder `cv/ireland/<candidate_phone_number>/` and stores the file there.
 * Also stores in `public/cv/ireland/<candidate_phone_number>/` so it can be previewed/downloaded in CRM.
 */
export async function handleIncomingWhatsAppIrelandMedia(params: {
  db: Db;
  phone: string;
  senderName: string;
  mediaType: "document" | "image";
  mediaObj: {
    id: string;
    filename?: string;
    mime_type?: string;
    caption?: string;
  };
}): Promise<{ filePath: string; filename: string } | null> {
  const { db, phone, senderName, mediaType, mediaObj } = params;
  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");

  try {
    const media = await downloadWhatsAppIrelandMedia(mediaObj.id);
    if (!media) {
      console.warn(`[WhatsApp Ireland Media] Could not download media for +${cleanPhone}`);
      return null;
    }

    const fs = await import("fs/promises");
    const path = await import("path");

    // 1. Create target directories: cv/ireland/<phone> and public/cv/ireland/<phone>
    const cvDir = path.join(process.cwd(), "cv", "ireland", cleanPhone);
    const publicCvDir = path.join(process.cwd(), "public", "cv", "ireland", cleanPhone);

    await fs.mkdir(cvDir, { recursive: true });
    await fs.mkdir(publicCvDir, { recursive: true });

    const safeFilename = sanitizeFilename(
      mediaObj.filename,
      media.mimeType,
      mediaType === "document" ? "CV" : "IMG"
    );

    const cvFilePath = path.join(cvDir, safeFilename);
    const publicFilePath = path.join(publicCvDir, safeFilename);

    await fs.writeFile(cvFilePath, media.buffer);
    await fs.writeFile(publicFilePath, media.buffer);

    const relativePublicUrl = `/cv/ireland/${cleanPhone}/${safeFilename}`;
    const now = new Date();

    // 2. Upload to MongoDB GridFS for persistent multi-environment storage
    let gridFsFileId: string | undefined;
    try {
      const { getGridFSBucket } = await import("@/lib/gridfs");
      const bucket = await getGridFSBucket();
      const uploadStream = bucket.openUploadStream(safeFilename, {
        contentType: media.mimeType,
        metadata: {
          candidatePhone: cleanPhone,
          country: "Ireland",
          senderName,
          source: "whatsapp_ireland",
          mediaType,
          receivedAt: now,
        },
      });

      await new Promise<void>((resolve, reject) => {
        uploadStream.end(media.buffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      gridFsFileId = uploadStream.id.toString();
    } catch (gErr) {
      console.warn("[WhatsApp Ireland Media] GridFS upload fallback warning:", gErr);
    }

    const finalFileUrl = gridFsFileId ? `/api/chat/files/${gridFsFileId}` : relativePublicUrl;

    const fileRecord = {
      filename: safeFilename,
      mediaType,
      mimeType: media.mimeType,
      size: media.buffer.length,
      gridFsFileId,
      publicUrl: finalFileUrl,
      receivedAt: now,
    };

    // 3. Update session in whatsapp_ireland_sessions
    const last10 = cleanPhone.slice(-10);
    const waPhoneFilter = {
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        ...(last10.length === 10 ? [{ phone: { $regex: `${last10}$` } }] : []),
      ],
    };
    const existingSession = await db.collection("whatsapp_ireland_sessions").findOne(waPhoneFilter);
    const updateFields: Record<string, unknown> = {
      hasUploadedCv: true,
      cvReceivedAt: now,
      cvFileUrl: finalFileUrl,
      cvFileName: safeFilename,
      nextFollowupAt: null,
      updatedAt: now,
    };
    if (existingSession?.currentStep === "AWAITING_CV") {
      updateFields.currentStep = "MEETING_COMPLETED";
    }

    await db.collection("whatsapp_ireland_sessions").updateOne(
      waPhoneFilter,
      {
        $push: { cvFiles: fileRecord as any },
        $set: updateFields,
      }
    );

    // 4. Update or link CRM Lead if exists
    const phoneQueries: any[] = [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
    ];
    if (cleanPhone.length >= 8 && !isNaN(Number(cleanPhone))) {
      phoneQueries.push({ phone: Number(cleanPhone) });
    }
    if (last10.length === 10) {
      phoneQueries.push(
        { phone: last10 },
        { phone: `+91${last10}` },
        { phone: { $regex: `${last10}$` } }
      );
      if (!isNaN(Number(last10))) {
        phoneQueries.push({ phone: Number(last10) });
      }
    }
    const lead = await db.collection("leads").findOne({ $or: phoneQueries });

    if (lead) {
      await db.collection("leads").updateOne(
        { id: lead.id },
        {
          $push: {
            cvFiles: fileRecord as any,
            history: {
              action: "ireland_cv_uploaded_whatsapp",
              performedByName: senderName || "Candidate",
              timestamp: now,
              details: `Candidate uploaded document via Ireland WhatsApp: ${safeFilename}`,
            } as any,
          },
          $set: {
            salesDocument: finalFileUrl,
            cvFileName: safeFilename,
            interestedCountry: "Ireland",
            updatedAt: now,
          },
        }
      );
    }

    // 4. Send acknowledgement to candidate
    const candidateDisplayName = senderName && senderName !== "Candidate" ? ` ${senderName}` : "";
    const isExistingCrmLead =
      lead?.status &&
      ["meeting-scheduled", "follow-up", "sales", "payment-pending", "document-pending", "call-back"].includes(
        lead.status.toLowerCase().trim()
      );

    const consultationClause = isExistingCrmLead
      ? `If you have any questions, feel free to ask our Ireland advisory team here anytime!`
      : `If you have any questions or want to schedule your 1-on-1 consultation, feel free to ask here anytime!`;

    const ackMessage =
      `Thank you${candidateDisplayName}! 📄 We have received your CV / Document.\n\n` +
      `Our Ireland Review & Recruitment Team will assess your qualifications against the Ireland Critical Skills (CSEP) and General Employment (GEP) lists (minimum 2 years of relevant experience required). 🇮🇪\n\n` +
      consultationClause;

    await sendTextMessage(cleanPhone, ackMessage);

    // 5. Create in-app notification for Admin
    const adminUser = await db.collection("users").findOne({ role: "admin" });
    if (adminUser) {
      await createNotification({
        userId: adminUser.id,
        title: "New Ireland CV Received (WhatsApp) 🇮🇪",
        message: `${senderName || "Candidate"} (+${cleanPhone}) uploaded their CV via Ireland WhatsApp.`,
        type: "lead",
        link: `/dashboard/whatsapp-ireland?phone=${cleanPhone}`,
      });
    }

    return { filePath: relativePublicUrl, filename: safeFilename };
  } catch (err) {
    console.error(`[WhatsApp Ireland Media] Failed to handle media for +${cleanPhone}:`, err);
    return null;
  }
}
