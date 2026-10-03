import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload, getAuthorizedCandidateLead } from "@/lib/caseMarketingAuth";
import { getFollowupInfo, isTerminalStatus, PHASES, type MarketingSummary } from "@/lib/caseMarketing";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { leadId: leadIdParam } = await context.params;
    const leadId = parseInt(leadIdParam);
    const { db } = await connectToDatabase();

    const auth = await getAuthorizedCandidateLead(db, leadId, payload);
    if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

    const employers = await db
      .collection("case_marketing_employers")
      .find({ leadId })
      .toArray();

    // Lazily auto-close anything that has silently passed the 60-day mark
    // with no terminal status recorded — matches the "Automatically Closed
    // / No Response" rule without needing a background cron job.
    const now = new Date();
    for (const e of employers) {
      if (!e.emailSent || isTerminalStatus(e.status)) continue;
      const info = getFollowupInfo(e.emailSentAt, e.status, e.lastFollowupAt, e.followupCount || 0);
      if (info?.closed) {
        await db.collection("case_marketing_employers").updateOne(
          { id: e.id },
          {
            $set: {
              status: "No Response",
              statusNotes: "Auto-closed — no reply after 60 days",
              statusUpdatedAt: now,
              statusUpdatedByName: "System (Auto)",
            },
            $push: {
              timeline: {
                event: "auto_closed",
                date: now,
                details: "Automatically closed — no response after 60 days",
              },
            },
          },
        );
        e.status = "No Response";
      }
    }

    const sources = await db
      .collection("case_marketing_sources")
      .find({ leadId })
      .sort({ phase: 1, order: 1 })
      .toArray();

    const employersByPhase: Record<number, number> = {};
    let initialEmailsSent = 0;
    let followupsDueToday = 0;
    let totalReplies = 0;
    let interestedEmployers = 0;
    let interviewsScheduled = 0;

    for (const e of employers) {
      employersByPhase[e.phase] = (employersByPhase[e.phase] || 0) + 1;
      if (e.emailSent) initialEmailsSent += 1;
      if (e.status && e.status !== "No Response") totalReplies += 1;
      if (e.status === "Interested") interestedEmployers += 1;
      if (e.status === "Interview Scheduled") interviewsScheduled += 1;

      const info = getFollowupInfo(e.emailSentAt, e.status, e.lastFollowupAt, e.followupCount || 0);
      if (info && !info.closed && info.isDueOrOverdue) followupsDueToday += 1;
    }

    // ── Per-phase completion: a phase is complete when:
    //     1. It has at least one source
    //     2. All sources in it are marked "completed"
    //     3. At least one employer exists and ALL employers in it have emailSent === true
    const phaseCompletionStatus: Record<number, boolean> = {};
    for (const p of PHASES) {
      const phaseSources = sources.filter((s) => s.phase === p.phase);
      const phaseEmployers = employers.filter((e) => e.phase === p.phase);
      const allSourcesDone = phaseSources.length > 0 && phaseSources.every((s) => s.status === "completed");
      const allEmailsSent = phaseEmployers.length > 0 && phaseEmployers.every((e) => e.emailSent);
      phaseCompletionStatus[p.phase] = allSourcesDone && allEmailsSent;
    }

    // ── Current phase: the lowest phase that is not yet fully complete ─
    const computedCurrentPhase =
      PHASES.find((p) => !phaseCompletionStatus[p.phase])?.phase ?? PHASES[PHASES.length - 1].phase;

    const totalEmployers = employers.length;
    const averageResponseRate =
      initialEmailsSent > 0 ? Math.round((totalReplies / initialEmailsSent) * 100) : 0;
    const completionPercent =
      totalEmployers > 0 ? Math.round((initialEmailsSent / totalEmployers) * 100) : 0;

    const activeSource = sources.find((s) => s.status === "active");

    const summary: MarketingSummary = {
      totalEmployers,
      employersByPhase,
      initialEmailsSent,
      followupsDueToday,
      totalReplies,
      interestedEmployers,
      interviewsScheduled,
      averageResponseRate,
      completionPercent,
      currentPhase: computedCurrentPhase,
      currentSourceName: activeSource ? activeSource.name : null,
      phaseCompletionStatus,
    };

    return NextResponse.json({ summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
