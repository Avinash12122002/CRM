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
    if (!provided || provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { db } = await connectToDatabase();
    const results = await runWhatsAppFollowupEngine(db);

    // Continuous learning: auto-refresh learned candidate knowledge model if stale (> 2 hours)
    const { autoTrainIfStale } = await import("@/lib/whatsapp/messageIntelligence");
    await autoTrainIfStale(db);

    // Also run WhatsApp Ireland followup engine alongside Australia
    let irelandResults: any[] = [];
    try {
      const { runWhatsAppIrelandFollowupEngine } = await import("@/lib/whatsapp-ireland/followupEngine");
      irelandResults = await runWhatsAppIrelandFollowupEngine(db);

      const { autoTrainIfStale: autoTrainIrelandIfStale } = await import("@/lib/whatsapp-ireland/messageIntelligence");
      await autoTrainIrelandIfStale(db);
    } catch (ieErr) {
      console.warn("[WhatsApp Cron] Error running Ireland follow-up engine:", ieErr);
    }

    return NextResponse.json({
      success: true,
      processed: results.length + irelandResults.length,
      australiaProcessed: results.length,
      irelandProcessed: irelandResults.length,
      results: [...results, ...irelandResults],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[WhatsApp Followup Cron Error]", err);
    return NextResponse.json({ error: "Internal Server Error", details: String(err) }, { status: 500 });
  }
}

export const POST = GET;
