import { NextRequest, NextResponse } from "next/server";
import { processDueFollowups } from "@/lib/email";

// GET /api/email/cron
// Protected by CRON_SECRET header or query param
// Call this every hour via Vercel Cron, Windows Task Scheduler, or manually
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const providedSecret =
      req.headers.get("x-cron-secret") ||
      req.nextUrl.searchParams.get("secret");

    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await processDueFollowups();

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      processed: results.length,
      succeeded,
      failed,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron] Error processing followups:", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}

// Also allow POST for webhook-style cron providers
export const POST = GET;
