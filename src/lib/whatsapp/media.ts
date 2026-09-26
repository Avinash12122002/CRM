import fs from "fs";
import path from "path";
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

  // 2. Define Folder Paths:
  // Root project folder: cv/<candidate_phone_number>/
  const rootCvDir = path.join(process.cwd(), "cv", cleanPhone);
  // Public folder for static serving: public/cv/<candidate_phone_number>/
  const publicCvDir = path.join(process.cwd(), "public", "cv", cleanPhone);

  try {
    await fs.promises.mkdir(rootCvDir, { recursive: true });
    await fs.promises.mkdir(publicCvDir, { recursive: true });

    const rootFilePath = path.join(rootCvDir, finalFilename);
    const publicFilePath = path.join(publicCvDir, finalFilename);

    // Save to both locations
    await fs.promises.writeFile(rootFilePath, downloaded.buffer);
    await fs.promises.writeFile(publicFilePath, downloaded.buffer);

    console.log(`[WhatsApp Media] Successfully saved to: ${rootFilePath}`);
    console.log(`[WhatsApp Media] Public web access: /cv/${cleanPhone}/${finalFilename}`);

    // 3. Update WhatsApp Session in MongoDB
    const fileRecord = {
      filename: finalFilename,
      mediaType,
      mimeType: finalMime,
      size: downloaded.buffer.length,
      relativePath: `cv/${cleanPhone}/${finalFilename}`,
      publicUrl: `/cv/${cleanPhone}/${finalFilename}`,
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
          lastUploadedCvPath: `cv/${cleanPhone}/${finalFilename}`,
          lastUploadedCvUrl: `/cv/${cleanPhone}/${finalFilename}`,
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
              details: `Candidate sent ${mediaType} (${finalFilename}) via WhatsApp. Stored in cv/${cleanPhone}/`,
            } as any,
          },
          $set: {
            hasCv: true,
            lastCvUrl: `/cv/${cleanPhone}/${finalFilename}`,
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

    // 6. Send Automated Confirmation Reply back to the Candidate on WhatsApp
    const session = (await db
      .collection("whatsapp_sessions")
      .findOne({ phone: cleanPhone })) as unknown as WhatsAppSession | null;

    const candidateDisplayName =
      session?.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
        ? session.name
        : senderName && senderName !== "Candidate"
        ? senderName
        : "there";

    if (session?.bookedSlot) {
      const confirmedMsg =
        `Hello ${candidateDisplayName}! 👋\n\n` +
        `Thank you for sharing your ${mediaType === "document" ? "CV / document" : "file"} (*${finalFilename}*). 📄✅\n\n` +
        `We have attached it to your candidate profile for Australia Subclass 482 visa assessment.\n\n` +
        `Our senior expert will review your profile during your confirmed consultation on **${session.bookedSlot.date}** at **${session.bookedSlot.candidateTimeLabel}**. See you soon! 🇦🇺`;

      await sendTextMessage(cleanPhone, confirmedMsg);
    } else {
      const promptBookingMsg =
        `Hello ${candidateDisplayName}! 👋\n\n` +
        `Thank you for sharing your ${mediaType === "document" ? "CV / document" : "file"} (*${finalFilename}*). 📄✅\n\n` +
        `We have safely saved your document to your candidate profile for Australia Subclass 482 visa evaluation!\n\n` +
        `👉 To have your profile evaluated 1-on-1 by our senior visa expert, please book a free weekend consultation below:`;

      await sendQuickReplyButtons(cleanPhone, promptBookingMsg, [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_ASK_VIDEO", title: "Watch 482 Video" },
      ]);
    }

    return {
      success: true,
      filePath: `cv/${cleanPhone}/${finalFilename}`,
      filename: finalFilename,
    };
  } catch (fsErr) {
    console.error(`[WhatsApp Media] Error writing file to cv/${cleanPhone}/:`, fsErr);
    return { success: false };
  }
}
