import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { runWhatsAppFollowupEngine } from "@/lib/whatsapp/followupEngine";

/**
 * GET /api/whatsapp/cron/followups
 * Runs automated background tasks:
 * 1. 10-Minute Consultation Prompt for candidates who received the video.
 * 2. 7-Day Follow-Up Sequence (Day 1 to Day 7 distinct messages) across all 7 steps.
 * 3. 1-Hour Pre-Meeting reminders with static Google Meet link and strict 12-hour AM/PM time.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided =
      req.headers.get("x-cron-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      req.nextUrl.searchParams.get("secret");
    if (provided && provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { db } = await connectToDatabase();
    const results = await runWhatsAppFollowupEngine(db);

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[WhatsApp Followup Cron Error]", err);
    return NextResponse.json({ error: "Internal Server Error", details: String(err) }, { status: 500 });
  }
}

export const POST = GET;
