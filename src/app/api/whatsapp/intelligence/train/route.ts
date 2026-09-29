import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import {
  trainKnowledgeFromCandidateMessages,
  getLearnedKnowledge,
} from "@/lib/whatsapp/messageIntelligence";

/**
 * GET: Returns the currently active learned knowledge model.
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    // Check auth if called via user/admin session; allow cron key via header if external
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
      data: learned || { message: "No trained knowledge yet. Trigger POST to train." },
    });
  } catch (err: any) {
    console.error("[Intelligence API] GET failed:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST: Triggers knowledge training from past candidate messages in MongoDB.
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
    const trainedModel = await trainKnowledgeFromCandidateMessages(db);

    return NextResponse.json({
      success: true,
      message: "Knowledge base successfully trained from candidate messages!",
      stats: {
        totalAnalyzedMessages: trainedModel.totalAnalyzedMessages,
        totalAnalyzedSessions: trainedModel.totalAnalyzedSessions,
        topObjections: trainedModel.topObjections,
        sentimentBreakdown: trainedModel.sentimentBreakdown,
        linguisticBreakdown: trainedModel.linguisticBreakdown,
        lastTrainedAt: trainedModel.lastTrainedAt,
      },
      synthesizedPromptGuidance: trainedModel.synthesizedPromptGuidance,
    });
  } catch (err: any) {
    console.error("[Intelligence API] POST training failed:", err);
    return NextResponse.json({ error: err.message || "Training failed" }, { status: 500 });
  }
}
