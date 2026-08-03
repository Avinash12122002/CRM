import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload } from "@/lib/caseMarketingAuth";
import { getFollowupInfo, getPhaseConfig, PHASES } from "@/lib/caseMarketing";

interface TodoTask {
  type: "followup" | "interested" | "interview" | "need_cv" | "need_info";
  leadId: number;
  candidateName: string;
  phase: number;
  phaseLabel: string;
  title: string;
  detail: string;
  dueDate?: string | null;
  overdue?: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    if (payload.role !== "case_manager") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadFilter: Record<string, any> = { assignedToRole: "case_manager" };
    if (payload.role === "case_manager") {
      leadFilter.assignedTo = payload.id;
    } else {
      const { searchParams } = new URL(req.url);
      const assignedTo = searchParams.get("assignedTo");
      if (assignedTo) {
        const assignedToId = parseInt(assignedTo);
        if (!isNaN(assignedToId)) leadFilter.assignedTo = assignedToId;
      }
    }

    const leads = await db
      .collection("leads")
      .find(leadFilter)
      .project({ id: 1, name: 1, assignedToName: 1 })
      .toArray();

    const leadIds = leads.map((l) => l.id);
    const leadNameById = new Map(leads.map((l) => [l.id, l.name as string]));

    if (leadIds.length === 0) {
      return NextResponse.json({
        tasks: [],
        counts: { followup: 0, interested: 0, interview: 0, need_cv: 0, need_info: 0 },
      });
    }

    const employers = await db
      .collection("case_marketing_employers")
      .find({ leadId: { $in: leadIds } })
      .toArray();

    const tasks: TodoTask[] = [];

    // ── 1. Follow-ups due today or overdue ─────────────────────────────
    for (const e of employers) {
      if (!e.emailSent) continue;
      const info = getFollowupInfo(e.emailSentAt, e.status, e.lastFollowupAt, e.followupCount || 0);
      if (!info || info.closed || !info.isDueOrOverdue) continue;
      const phaseConfig = getPhaseConfig(e.phase);
      tasks.push({
        type: "followup",
        leadId: e.leadId,
        candidateName: leadNameById.get(e.leadId) || `Candidate #${e.leadId}`,
        phase: e.phase,
        phaseLabel: phaseConfig?.label || `Phase ${e.phase}`,
        title: `Follow-up due — ${e.companyName}`,
        detail: `${phaseConfig?.label} · ${e.sourceName} · ${info.label}`,
        dueDate: info.nextDueDate ? info.nextDueDate.toISOString() : null,
        overdue: info.nextDueDate ? info.nextDueDate.getTime() < Date.now() - 86400000 : false,
      });
    }

    // ── 2. Actionable Employer Statuses ────────────────────────────────
    for (const e of employers) {
      if (!e.status) continue;
      const phaseConfig = getPhaseConfig(e.phase);
      const baseTask = {
        leadId: e.leadId,
        candidateName: leadNameById.get(e.leadId) || `Candidate #${e.leadId}`,
        phase: e.phase,
        phaseLabel: phaseConfig?.label || `Phase ${e.phase}`,
      };

      if (e.status === "Interested") {
        tasks.push({
          ...baseTask,
          type: "interested",
          title: `Interested Employer — ${e.companyName}`,
          detail: `${phaseConfig?.label} · ${e.sourceName} · Employer expressed interest.`,
        });
      } else if (e.status === "Interview Scheduled") {
        tasks.push({
          ...baseTask,
          type: "interview",
          title: `Interview Scheduled — ${e.companyName}`,
          detail: `${phaseConfig?.label} · ${e.sourceName} · Confirm interview details.`,
        });
      } else if (e.status === "Need Updated CV") {
        tasks.push({
          ...baseTask,
          type: "need_cv",
          title: `Updated CV Required — ${e.companyName}`,
          detail: `${phaseConfig?.label} · ${e.sourceName} · Employer requested updated candidate CV.`,
        });
      } else if (e.status === "Need More Information") {
        tasks.push({
          ...baseTask,
          type: "need_info",
          title: `More Info Requested — ${e.companyName}`,
          detail: `${phaseConfig?.label} · ${e.sourceName} · ${e.statusNotes || "Employer asked for additional details."}`,
        });
      }
    }

    tasks.sort((a, b) => {
      if (a.overdue && !b.overdue) return -1;
      if (!a.overdue && b.overdue) return 1;
      return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
        (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
    });

    const counts = {
      followup: tasks.filter((t) => t.type === "followup").length,
      interested: tasks.filter((t) => t.type === "interested").length,
      interview: tasks.filter((t) => t.type === "interview").length,
      need_cv: tasks.filter((t) => t.type === "need_cv").length,
      need_info: tasks.filter((t) => t.type === "need_info").length,
    };

    return NextResponse.json({ tasks, counts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
