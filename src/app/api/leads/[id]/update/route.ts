import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const leadId = parseInt(id);

    if (isNaN(leadId)) {
      return NextResponse.json({ message: "Invalid lead ID" }, { status: 400 });
    }

    const body = await req.json();
    const {
      name,
      phone,
      dueDate,
      callbackDate,
      state,
      city,
      age,
      status,
      passportType,
      leadSource,
      jobApplied,
    } = body;

    if (!phone?.trim()) {
      return NextResponse.json(
        { message: "Phone is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    // Find the lead
    const lead = await db.collection("leads").findOne({ id: leadId });

    if (!lead) {
      return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    }

    // Check permissions: Admins can edit any lead, employees can only edit leads assigned to them
    if (
      (payload.role === "employee" || payload.role === "meeting") &&
      lead.assignedTo !== payload.id
    ) {
      return NextResponse.json(
        { message: "You can only edit leads assigned to you" },
        { status: 403 },
      );
    }

    // Effective status: fall back to the lead's current status if the request
    // didn't send one, so we never misjudge whether this is a "call-back" edit.
    const effectiveStatus = status ?? lead.status;

    if (effectiveStatus === "call-back") {
      if (!callbackDate) {
        return NextResponse.json(
          { message: "Callback date is required." },
          { status: 400 },
        );
      }

      const selectedDate = new Date(callbackDate + "T00:00:00");

      if (isNaN(selectedDate.getTime())) {
        return NextResponse.json(
          { message: "Invalid callback date." },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const changes: string[] = [];

    // For employees, phone is read-only but name is editable
    const finalPhone =
      payload.role === "employee" || payload.role === "meeting"
        ? lead.phone
        : phone;

    // Track changes
    if (lead.name !== name) changes.push(`Name: "${lead.name}" → "${name}"`);
    if ((lead.phone || "") !== (finalPhone || ""))
      changes.push(
        `Phone: "${lead.phone || "N/A"}" → "${finalPhone || "N/A"}"`,
      );
    if ((lead.state || "") !== (state || ""))
      changes.push(`State: "${lead.state || "N/A"}" → "${state || "N/A"}"`);
    if ((lead.city || "") !== (city || ""))
      changes.push(`City: "${lead.city || "N/A"}" → "${city || "N/A"}"`);

    const oldAge = lead.age ? String(lead.age) : "";
    const newAge = age ? String(age) : "";
    if (oldAge !== newAge)
      changes.push(`Age: "${oldAge || "N/A"}" → "${newAge || "N/A"}"`);

    if ((lead.status || "") !== (effectiveStatus || ""))
      changes.push(
        `Status: "${lead.status || "N/A"}" → "${effectiveStatus || "N/A"}"`,
      );

    if ((lead.passportType || "") !== (passportType || ""))
      changes.push(
        `Passport Type: "${lead.passportType || "N/A"}" → "${
          passportType || "N/A"
        }"`,
      );

    if ((lead.leadSource || "") !== (leadSource || ""))
      changes.push(
        `Lead Source: "${lead.leadSource || "N/A"}" → "${leadSource || "N/A"}"`,
      );

    if ((lead.jobApplied || "") !== (jobApplied || ""))
      changes.push(
        `Job Applied: "${lead.jobApplied || "N/A"}" → "${jobApplied || "N/A"}"`,
      );

    // Format dates for comparison
    const oldDueDate = lead.dueDate
      ? new Date(lead.dueDate).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        })
      : "";
    const newDueDate = dueDate || "";
    if (oldDueDate !== newDueDate) {
      changes.push(
        `Due Date: "${oldDueDate || "N/A"}" → "${newDueDate || "N/A"}"`,
      );
    }

    const oldCallbackDate = lead.callbackDate
      ? new Date(lead.callbackDate).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        })
      : "";

    const newCallbackDate =
      effectiveStatus === "call-back" ? callbackDate || "" : "";

    if (oldCallbackDate !== newCallbackDate) {
      changes.push(
        `Callback Date: "${oldCallbackDate || "N/A"}" → "${
          newCallbackDate || "N/A"
        }"`,
      );
    }

    // Update the lead
    await db.collection("leads").updateOne(
      { id: leadId },
      {
        $set: {
          name: name || null,
          phone: finalPhone,
          state: state || null,
          city: city || null,
          age: age ? parseInt(age) : null,
          passportType: passportType || null,
          leadSource: leadSource || null,
          jobApplied: jobApplied || null,
          status: effectiveStatus,
          ...(effectiveStatus === "call-back"
            ? {
                callbackDate: new Date(callbackDate + "T00:00:00"),
                callbackSeen: false,
              }
            : {
                callbackDate: null,
                callbackSeen: false,
              }),
          dueDate: dueDate ? new Date(dueDate + "T00:00:00") : null,
          updatedAt: now,
        },
        $push: {
          history: {
            action: "lead_updated",
            performedBy: payload.id,
            performedByName: payload.name,
            timestamp: now,
            details:
              changes.length > 0 ? changes.join("; ") : "Lead details updated",
          },
        },
      },
    );

    return NextResponse.json(
      {
        message: "Lead updated successfully",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 },
    );
  }
}