import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import {
  trainKnowledgeFromCandidateMessages,
  getLearnedKnowledge,
} from "@/lib/whatsapp-ireland/messageIntelligence";

/**
 * GET: Returns the currently active learned knowledge model for Ireland WhatsApp.
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    if (!isCron && token) {
      const payload = verifyToken(token);
      if (!payload || payload.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { db } = await connectToDatabase();
    const learned = await getLearnedKnowledge(db);

    return NextResponse.json({
      success: true,
      country: "Ireland",
      data: learned || { message: "No trained Ireland knowledge yet. Trigger POST to train." },
    });
  } catch (err: any) {
    console.error("[Ireland Intelligence API] GET failed:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST: Triggers knowledge training from past Ireland candidate messages in MongoDB.
 */
export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    if (!isCron && token) {
      const payload = verifyToken(token);
      if (!payload || payload.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { db } = await connectToDatabase();
    const trained = await trainKnowledgeFromCandidateMessages(db);

    return NextResponse.json({
      success: true,
      country: "Ireland",
      message: `Successfully trained Ireland AI intelligence on ${trained.totalAnalyzedMessages} candidate messages across ${trained.totalAnalyzedSessions} candidate sessions.`,
      model: {
        version: trained.version,
        lastTrainedAt: trained.lastTrainedAt,
        totalAnalyzedMessages: trained.totalAnalyzedMessages,
        totalAnalyzedSessions: trained.totalAnalyzedSessions,
        topObjections: trained.topObjections,
        sentimentBreakdown: trained.sentimentBreakdown,
        linguisticBreakdown: trained.linguisticBreakdown,
      },
    });
  } catch (err: any) {
    console.error("[Ireland Intelligence API] POST training failed:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
