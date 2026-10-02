import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { runWhatsAppIrelandFollowupEngine } from "@/lib/whatsapp-ireland/followupEngine";

/**
 * GET /api/whatsapp-ireland/cron/followups
 * Runs automated Ireland background tasks:
 * 1. 10-Minute Consultation Prompt for Ireland candidates.
 * 2. 7-Day Follow-Up Sequence across all steps for Ireland.
 * 3. 1-Hour Pre-Meeting reminders for Ireland consultations.
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
    const results = await runWhatsAppIrelandFollowupEngine(db);

    // Continuous learning: auto-refresh learned candidate knowledge model if stale (> 2 hours)
    const { autoTrainIfStale } = await import("@/lib/whatsapp-ireland/messageIntelligence");
    await autoTrainIfStale(db);

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[WhatsApp Ireland Followup Cron Error]", err);
    return NextResponse.json({ error: "Internal Server Error", details: String(err) }, { status: 500 });
  }
}

export const POST = GET;
