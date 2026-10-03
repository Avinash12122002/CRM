import { Db } from "mongodb";
import { getNextId } from "@/lib/auth";

export interface MatchingLeadDoc {
  id: number;
  name?: string;
  phone?: string | number;
  email?: string;
  status?: string;
  assignedTo?: number | null;
  assignedToName?: string | null;
  country?: string;
  [key: string]: any;
}

/**
 * Builds a robust array of MongoDB filter objects to find a CRM lead across all
 * real-world telephone formatting variations, spaces, brackets, leading zeros,
 * country codes, numeric types, linked session leadId, and email.
 */
export function buildLeadLookupQueries(
  phone: string,
  session?: { leadId?: number | null; email?: string | null } | null
): any[] {
  const cleanPhone = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
  const queries: any[] = [];

  // 1. By ID if session has a linked leadId
  if (session?.leadId) {
    const numId = Number(session.leadId);
    if (!isNaN(numId)) {
      queries.push({ id: numId });
      queries.push({ id: String(numId) });
    }
  }

  // 2. By Email if session has a valid candidate email
  if (session?.email && session.email.includes("@")) {
    const cleanEmail = session.email.trim();
    const escapedEmail = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    queries.push({ email: { $regex: `^${escapedEmail}$`, $options: "i" } });
  }

  if (cleanPhone) {
    // 3. Exact full phone match
    queries.push({ phone: cleanPhone });
    queries.push({ phone: `+${cleanPhone}` });

    // 4. Numeric phone type in MongoDB
    const numPhone = Number(cleanPhone);
    if (!isNaN(numPhone)) {
      queries.push({ phone: numPhone });
    }

    // 5. Last 10 digits variations (covers standard 10-digit mobile numbers)
    const last10 = cleanPhone.slice(-10);
    if (last10.length === 10) {
      queries.push({ phone: last10 });
      queries.push({ phone: `+91${last10}` });
      queries.push({ phone: `0${last10}` });
      const num10 = Number(last10);
      if (!isNaN(num10)) queries.push({ phone: num10 });

      // Flexible regex allowing spaces, dashes, parentheses between digits (e.g. +91 98765 43210 or 09876-543210)
      const flexLast10 = last10.split("").join("[\\s\\-\\(\\)]*");
      queries.push({ phone: { $regex: `${flexLast10}$` } });
    }

    // 6. Last 9 digits variations (crucial for Australia: +61 4XX XXX XXX -> national 04XX XXX XXX)
    const last9 = cleanPhone.slice(-9);
    if (last9.length === 9) {
      queries.push({ phone: `0${last9}` });
      queries.push({ phone: `+61${last9}` });
      queries.push({ phone: `+610${last9}` });
      queries.push({ phone: `61${last9}` });

      const num9 = Number(last9);
      if (!isNaN(num9)) queries.push({ phone: num9 });

      // Flexible regex with optional leading 0 for national Australian numbers
      const flexLast9 = last9.split("").join("[\\s\\-\\(\\)]*");
      queries.push({ phone: { $regex: `0?${flexLast9}$` } });
    }
  }

  return queries;
}

/**
 * Finds a matching CRM lead in the database and self-heals the session with the leadId if missing.
 */
export async function findMatchingCrmLead(
  db: Db,
  phone: string,
  session?: any,
  sessionsCollection: string = "whatsapp_sessions"
): Promise<MatchingLeadDoc | null> {
  const queries = buildLeadLookupQueries(phone, session);
  if (queries.length === 0) return null;

  const lead = (await db.collection("leads").findOne({ $or: queries })) as MatchingLeadDoc | null;

  // Self-heal session leadId if found
  if (lead && lead.id && session && !session.leadId) {
    const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
    await db.collection(sessionsCollection).updateOne(
      { phone: cleanPhone },
      { $set: { leadId: lead.id } }
    ).catch(() => {});
  }

  return lead;
}

/**
 * Creates or synchronizes a CRM lead for a WhatsApp session.
 */
export async function syncOrCreateCrmLead(
  db: Db,
  phone: string,
  session: any,
  options?: {
    assignedToUserId?: number | null;
    assignedToUserName?: string | null;
    assignedToUserRole?: string | null;
    destination?: "Australia" | "Ireland";
    sessionsCollection?: string;
  }
): Promise<MatchingLeadDoc> {
  const sessionsCol = options?.sessionsCollection || "whatsapp_sessions";
  const existingLead = await findMatchingCrmLead(db, phone, session, sessionsCol);

  if (existingLead) {
    if (!session?.leadId) {
      const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
      await db.collection(sessionsCol).updateOne(
        { phone: cleanPhone },
        { $set: { leadId: existingLead.id } }
      ).catch(() => {});
    }
    return existingLead;
  }

  const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
  const now = new Date();
  const id = await getNextId(db, "leads");
  const dest = options?.destination || (session?.countryName?.toLowerCase().includes("ireland") ? "Ireland" : "Australia");

  const newLead: any = {
    id,
    name: session?.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
      ? session.name
      : `WhatsApp Candidate (+${cleanPhone})`,
    phone: `+${cleanPhone}`,
    email: session?.email || "",
    country: session?.countryName || dest,
    interestedCountry: dest,
    jobApplied: dest === "Ireland" ? "Ireland General Employment Permit" : "Australia Employer Sponsored Work Visa",
    leadSource: dest === "Ireland" ? "WhatsApp Ireland Automation" : "WhatsApp Ad Automation",
    status: "new-lead",
    isAgent: false,
    callbackDate: null,
    callbackSeen: false,
    assignedTo: options?.assignedToUserId ?? null,
    assignedToName: options?.assignedToUserName ?? null,
    assignedToRole: options?.assignedToUserRole ?? null,
    assignedBy: options?.assignedToUserId ? options.assignedToUserId : null,
    assignedByName: options?.assignedToUserName ? options.assignedToUserName : null,
    meetingDetails: null,
    meetingStatus: null,
    meetingCompletedAt: null,
    meetingCancelledAt: null,
    participants: [],
    visibleTo: [],
    notes: [
      {
        text: `Inbound WhatsApp lead captured. Location: ${session?.countryName || dest} (${session?.timeZoneLabel || "Local"}).`,
        addedBy: options?.assignedToUserName || "System",
        addedAt: now,
      },
    ],
    history: [
      {
        action: "created",
        performedByName: options?.assignedToUserName || "WhatsApp System",
        timestamp: now,
        details: `Lead created from WhatsApp conversation (+${cleanPhone})`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("leads").insertOne(newLead);
  await db.collection(sessionsCol).updateOne(
    { phone: cleanPhone },
    { $set: { leadId: id, updatedAt: now } },
    { upsert: false }
  ).catch(() => {});

  return newLead as MatchingLeadDoc;
}
