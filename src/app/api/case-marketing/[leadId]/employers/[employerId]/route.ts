import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getTokenPayload, getAuthorizedCandidateLead } from "@/lib/caseMarketingAuth";
import { getPhaseConfig, STATUS_OPTIONS } from "@/lib/caseMarketing";

// PATCH /api/case-marketing/:leadId/employers/:employerId
// body: { action: "email_sent", templateUsed?, mailboxUsed? }
//    or { action: "status_update", status, notes }
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ leadId: string; employerId: string }> },
) {
  try {
    const payload = getTokenPayload(req);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { leadId: leadIdParam, employerId: employerIdParam } = await context.params;
    const leadId = parseInt(leadIdParam);
    const employerId = parseInt(employerIdParam);
    const { db } = await connectToDatabase();

    const auth = await getAuthorizedCandidateLead(db, leadId, payload);
    if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

    const employer = await db
      .collection("case_marketing_employers")
      .findOne({ id: employerId, leadId });
    if (!employer) {
      return NextResponse.json({ message: "Employer not found" }, { status: 404 });
    }

    const phaseConfig = getPhaseConfig(employer.phase);
    const body = await req.json();
    const action = body.action;
    const now = new Date();

    if (action === "email_sent") {
      if (employer.emailSent) {
        return NextResponse.json({ message: "Email already marked as sent" }, { status: 400 });
      }

      const templateUsed = typeof body.templateUsed === "string" ? body.templateUsed.trim() : "";
      const mailboxUsed = typeof body.mailboxUsed === "string" ? body.mailboxUsed.trim() : "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setDoc: Record<string, any> = {
        emailSent: true,
        emailSentAt: now,
        emailSentByName: payload.name,
      };
      if (templateUsed) setDoc.templateUsed = templateUsed;
      if (mailboxUsed) setDoc.mailboxUsed = mailboxUsed;

      await db.collection("case_marketing_employers").updateOne(
        { id: employerId },
        {
          $set: setDoc,
          $push: {
            timeline: {
              event: "email_sent",
              date: now,
              details: `Email sent${templateUsed ? ` — ${templateUsed}` : ""}`,
            },
          },
        },
      );

      await db.collection("leads").updateOne(
        { id: leadId },
        {
          $set: { updatedAt: now },
          $push: {
            history: {
              action: "marketing_email_sent",
              performedBy: payload.id,
              performedByName: payload.name,
              timestamp: now,
              details: `Phase ${employer.phase} · ${phaseConfig?.label} — ${employer.sourceName}: email sent to ${employer.companyName}. Follow-ups will run every 10 days for 60 days.`,
            },
          },
        },
      );

      const updated = await db.collection("case_marketing_employers").findOne({ id: employerId });
      return NextResponse.json({ message: "Email marked as sent", employer: updated });
    }

    if (action === "status_update") {
      const status = String(body.status || "").trim();
      const notes = String(body.notes || "").trim();

      const validStatus = STATUS_OPTIONS.some((s) => s.value === status);
      if (!validStatus) {
        return NextResponse.json({ message: "Invalid status" }, { status: 400 });
      }
      if (!notes) {
        return NextResponse.json({ message: "Notes are required with a status update" }, { status: 400 });
      }
      if (!employer.emailSent) {
        return NextResponse.json(
          { message: "Send the initial email before updating a status" },
          { status: 400 },
        );
      }

      await db.collection("case_marketing_employers").updateOne(
        { id: employerId },
        {
          $set: {
            status,
            statusNotes: notes,
            statusUpdatedAt: now,
            statusUpdatedByName: payload.name,
          },
          $push: {
            timeline: {
              event: "status_update",
              date: now,
              details: `Status set to "${status}" — ${notes}`,
            },
          },
        },
      );

      await db.collection("leads").updateOne(
        { id: leadId },
        {
          $set: { updatedAt: now },
          $push: {
            history: {
              action: "marketing_status_update",
              performedBy: payload.id,
              performedByName: payload.name,
              timestamp: now,
              details: `Phase ${employer.phase} · ${phaseConfig?.label} — ${employer.sourceName}: ${employer.companyName} status → "${status}"`,
            },
          },
        },
      );

      const updated = await db.collection("case_marketing_employers").findOne({ id: employerId });
      return NextResponse.json({ message: "Status updated", employer: updated });
    }

    if (action === "log_followup") {
      if (!employer.emailSent) {
        return NextResponse.json(
          { message: "Send initial email before logging follow-up" },
          { status: 400 },
        );
      }
      const newFollowupCount = (employer.followupCount || 0) + 1;

      await db.collection("case_marketing_employers").updateOne(
        { id: employerId },
        {
          $set: {
            lastFollowupAt: now,
            lastFollowupByName: payload.name,
            followupCount: newFollowupCount,
          },
          $push: {
            timeline: {
              event: "followup_logged",
              date: now,
              details: `Logged Follow-up #${newFollowupCount}`,
            },
          },
        },
      );

      await db.collection("leads").updateOne(
        { id: leadId },
        {
          $set: { updatedAt: now },
          $push: {
            history: {
              action: "marketing_followup_logged",
              performedBy: payload.id,
              performedByName: payload.name,
              timestamp: now,
              details: `Phase ${employer.phase} · ${phaseConfig?.label} — ${employer.sourceName}: logged Follow-up #${newFollowupCount} for ${employer.companyName}.`,
            },
          },
        },
      );

      const updated = await db.collection("case_marketing_employers").findOne({ id: employerId });
      return NextResponse.json({ message: `Follow-up #${newFollowupCount} logged successfully`, employer: updated });
    }

    if (action === "update_details") {
      const companyName = String(body.companyName || "").trim();
      if (!companyName) {
        return NextResponse.json({ message: "Company name is required" }, { status: 400 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateDoc: Record<string, any> = {
        companyName,
        occupation: typeof body.occupation === "string" ? body.occupation.trim() : "",
        website: typeof body.website === "string" ? body.website.trim() : "",
        jobUrl: typeof body.jobUrl === "string" ? body.jobUrl.trim() : "",
        hrEmail: typeof body.hrEmail === "string" ? body.hrEmail.trim() : "",
        generalEmail: typeof body.generalEmail === "string" ? body.generalEmail.trim() : "",
        contactPerson: typeof body.contactPerson === "string" ? body.contactPerson.trim() : "",
        phone: typeof body.phone === "string" ? body.phone.trim() : "",
        city: typeof body.city === "string" ? body.city.trim() : "",
        state: typeof body.state === "string" ? body.state.trim() : "",
        notes: typeof body.notes === "string" ? body.notes.trim() : "",
        updatedAt: now,
        updatedByName: payload.name,
      };

      await db.collection("case_marketing_employers").updateOne(
        { id: employerId },
        {
          $set: updateDoc,
          $push: {
            timeline: {
              event: "details_updated",
              date: now,
              details: `Employer details updated by ${payload.name}`,
            },
          },
        },
      );

      await db.collection("leads").updateOne(
        { id: leadId },
        {
          $set: { updatedAt: now },
          $push: {
            history: {
              action: "marketing_employer_updated",
              performedBy: payload.id,
              performedByName: payload.name,
              timestamp: now,
              details: `Phase ${employer.phase} · ${phaseConfig?.label} — ${employer.sourceName}: updated details for employer "${companyName}"`,
            },
          },
        },
      );

      const updated = await db.collection("case_marketing_employers").findOne({ id: employerId });
      return NextResponse.json({ message: "Employer details updated successfully", employer: updated });
    }

    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
  }
}
