import { Db } from "mongodb";
import { sendTextMessage, sendQuickReplyButtons } from "./client";
import { createNotification } from "@/lib/notifications";
import { WhatsAppSession } from "./types";

/**
 * Downloads a media file (PDF document or image) from Meta WhatsApp Cloud API.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  const token = process.env.WHATSAPP_TOKEN || "";
  if (!token) {
    console.warn("[WhatsApp Media] WHATSAPP_TOKEN is not configured.");
    return null;
  }

  try {
    // 1. Get media metadata and direct download URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      console.error(
        "[WhatsApp Media] Failed to get media info from Meta:",
        await metaRes.text(),
      );
      return null;
    }

    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    const mimeType = metaData.mime_type || "application/octet-stream";

    if (!downloadUrl) {
      console.error("[WhatsApp Media] No download URL returned by Meta:", metaData);
      return null;
    }

    // 2. Download the binary media stream
    const binaryRes = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "TMS-CRM-WhatsApp/1.0",
      },
    });

    if (!binaryRes.ok) {
      console.error(
        "[WhatsApp Media] Binary download failed:",
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
    console.error("[WhatsApp Media Download Error]", err);
    return null;
  }
}

/**
 * Sanitizes and generates a safe filename
 */
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
    // Clean original filename
    const clean = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (clean.includes(".")) return clean;
    return `${clean}${ext || ".bin"}`;
  }

  const timestamp = Date.now();
  return `${fallbackPrefix}_${timestamp}${ext || ".bin"}`;
}

/**
 * Handles incoming document (PDF) or image sent by a candidate over WhatsApp.
 * Creates folder `cv/<candidate_phone_number>/` and stores the file there.
 * Also stores in `public/cv/<candidate_phone_number>/` so it can be previewed/downloaded in CRM.
 */
export async function handleIncomingWhatsAppMedia(params: {
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
}): Promise<{ success: boolean; filePath?: string; filename?: string }> {
  const { db, phone, senderName, mediaType, mediaObj } = params;

  const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  const now = new Date();

  console.log(`[WhatsApp Media] Received ${mediaType} from +${cleanPhone} (${senderName}):`, mediaObj);

  // 1. Download file buffer from Meta
  const downloaded = await downloadWhatsAppMedia(mediaObj.id);
  if (!downloaded) {
    console.error(`[WhatsApp Media] Could not download ${mediaType} ${mediaObj.id} from Meta.`);
    return { success: false };
  }

  const finalMime = downloaded.mimeType || mediaObj.mime_type || "";
  const fallbackPrefix = mediaType === "document" ? "cv_document" : "candidate_image";
  const finalFilename = sanitizeFilename(mediaObj.filename, finalMime, fallbackPrefix);

  try {
    // 2. Upload directly to MongoDB GridFS for permanent database storage (no local disk files)
    const { getGridFSBucket } = await import("@/lib/gridfs");
    const bucket = await getGridFSBucket();
    const uploadStream = bucket.openUploadStream(finalFilename, {
      contentType: finalMime,
      metadata: {
        candidatePhone: cleanPhone,
        senderName,
        source: "whatsapp",
        mediaType,
        receivedAt: now,
      },
    });

    await new Promise<void>((resolve, reject) => {
      uploadStream.end(downloaded.buffer, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const gridFsFileId = uploadStream.id.toString();
    const fileUrl = `/api/chat/files/${gridFsFileId}`;
    console.log(`[WhatsApp Media] Successfully saved to MongoDB GridFS with ID: ${gridFsFileId} (${fileUrl})`);

    // 3. Update WhatsApp Session in MongoDB
    const fileRecord = {
      filename: finalFilename,
      mediaType,
      mimeType: finalMime,
      size: downloaded.buffer.length,
      publicUrl: fileUrl,
      gridFsFileId,
      caption: mediaObj.caption || null,
      receivedAt: now,
    };

    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $push: {
          cvFiles: fileRecord as any,
        },
        $set: {
          hasUploadedCv: true,
          lastUploadedCvUrl: fileUrl,
          gridFsFileId,
          updatedAt: now,
        },
      },
    );

    // 4. Update CRM Lead if matched
    const lead = await db.collection("leads").findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` },
        { phone: { $regex: cleanPhone.slice(-10) } },
      ],
    });

    if (lead) {
      await db.collection("leads").updateOne(
        { id: lead.id },
        {
          $push: {
            cvFiles: fileRecord as any,
            history: {
              action: "whatsapp_cv_received",
              performedByName: "WhatsApp Automation",
              timestamp: now,
              details: `Candidate sent ${mediaType} (${finalFilename}) via WhatsApp. Saved securely in database.`,
            } as any,
          },
          $set: {
            hasCv: true,
            lastCvUrl: fileUrl,
            updatedAt: now,
          },
        },
      );
    }

    // 5. In-App Notification for Admin and assigned Lead User
    try {
      const adminUsers = await db.collection("users").find({ role: "admin" }).toArray();
      const notifyUsers = new Set<number>(adminUsers.map((u) => u.id));
      if (lead?.assignedTo) {
        notifyUsers.add(lead.assignedTo);
      }

      for (const userId of notifyUsers) {
        await createNotification({
          userId,
          title: `📄 New ${mediaType === "document" ? "CV / Document" : "Image"} Received`,
          message: `${senderName || lead?.name || cleanPhone} sent ${finalFilename}. Saved to cv/${cleanPhone}/`,
          type: "whatsapp_cv_upload",
          link: lead ? `/dashboard/leads/${lead.id}` : "/dashboard/leads",
        });
      }
    } catch (notifErr) {
      console.warn("[WhatsApp Media] Failed to create in-app notification:", notifErr);
    }

    // Update session in whatsapp_sessions
    await db.collection("whatsapp_sessions").updateOne(
      { phone: cleanPhone },
      {
        $set: {
          cvReceivedAt: now,
          cvFileUrl: fileUrl,
          cvFileName: finalFilename,
          currentStep: "MEETING_COMPLETED",
          updatedAt: now,
        },
      }
    );

    // 6. Send Automated Confirmation Reply back to the Candidate on WhatsApp
    const cvReceivedMsg =
      `Thanks for sharing your CV with us! Our review team is reviewing your qualification and job availability according to your work experience.\n\n` +
      `Our team expects to call you from an Australian number shortly. 🇦🇺📞`;

    await sendTextMessage(cleanPhone, cvReceivedMsg);

    return {
      success: true,
      filePath: fileUrl,
      filename: finalFilename,
    };
  } catch (err) {
    console.error(`[WhatsApp Media] Error saving media for +${cleanPhone}:`, err);
    return { success: false };
  }
}
