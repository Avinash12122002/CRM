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
  interestedCountry?: string;
  leadSource?: string;
  [key: string]: any;
}

/**
 * Builds a robust array of MongoDB filter objects to find an Ireland CRM lead across all
 * real-world telephone formatting variations, spaces, brackets, leading zeros,
 * country codes (+353, +91, +44, etc.), numeric types, linked session leadId, and email.
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

    // 5. Last 10 digits variations (covers standard mobile numbers e.g. India, UK, USA)
    const last10 = cleanPhone.slice(-10);
    if (last10.length === 10) {
      queries.push({ phone: last10 });
      queries.push({ phone: `+91${last10}` });
      queries.push({ phone: `0${last10}` });
      const num10 = Number(last10);
      if (!isNaN(num10)) queries.push({ phone: num10 });

      // Flexible regex allowing spaces, dashes, parentheses between digits
      const flexLast10 = last10.split("").join("[\\s\\-\\(\\)]*");
      queries.push({ phone: { $regex: `${flexLast10}$` } });
    }

    // 6. Last 9 digits variations (crucial for Ireland +353 8X XXX XXXX -> national 08X XXX XXXX)
    const last9 = cleanPhone.slice(-9);
    if (last9.length === 9) {
      queries.push({ phone: `0${last9}` });
      queries.push({ phone: `+353${last9}` });
      queries.push({ phone: `+3530${last9}` });
      queries.push({ phone: `353${last9}` });
      queries.push({ phone: `+61${last9}` });

      const num9 = Number(last9);
      if (!isNaN(num9)) queries.push({ phone: num9 });

      // Flexible regex with optional leading 0 for national Irish numbers (e.g. 087 123 4567)
      const flexLast9 = last9.split("").join("[\\s\\-\\(\\)]*");
      queries.push({ phone: { $regex: `0?${flexLast9}$` } });
    }
  }

  return queries;
}

export const buildIrelandLeadLookupQueries = buildLeadLookupQueries;

/**
 * Finds a matching CRM lead in the database and self-heals the session with the leadId if missing.
 */
export async function findMatchingCrmLead(
  db: Db,
  phone: string,
  session?: any,
  sessionsCollection: string = "whatsapp_ireland_sessions"
): Promise<MatchingLeadDoc | null> {
  const queries = buildLeadLookupQueries(phone, session);
  if (queries.length === 0) return null;

  try {
    const lead = (await db.collection("leads").findOne({ $or: queries })) as unknown as MatchingLeadDoc | null;

    if (lead && session && !session.leadId) {
      const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
      await db.collection(sessionsCollection).updateOne(
        { phone: cleanPhone },
        { $set: { leadId: lead.id, crmStatus: lead.status || "new-lead", updatedAt: new Date() } }
      ).catch(() => {});
    }

    return lead;
  } catch (err) {
    console.error("[findMatchingCrmLead - Ireland] Query error:", err);
    return null;
  }
}

export const findMatchingIrelandCrmLead = findMatchingCrmLead;

/**
 * Atomically links an existing CRM lead or creates a new lead document for this Ireland WhatsApp candidate.
 */
export async function syncOrCreateCrmLead(
  db: Db,
  phone: string,
  session?: any,
  options?: {
    assignedToUserId?: number | null;
    assignedToUserName?: string | null;
    assignedToUserRole?: string | null;
    destination?: string;
    sessionsCollection?: string;
  },
  sessionsCollection: string = "whatsapp_ireland_sessions"
): Promise<MatchingLeadDoc> {
  const sessionsCol = options?.sessionsCollection || sessionsCollection;
  const existingLead = await findMatchingCrmLead(db, phone, session, sessionsCol);

  if (existingLead) {
    const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
    const updates: any = {};

    if (!existingLead.interestedCountry) {
      updates.interestedCountry = "Ireland";
    }
    if (session?.email && !existingLead.email) {
      updates.email = session.email;
    }
    if (session?.name && (!existingLead.name || existingLead.name === "Candidate" || existingLead.name.toLowerCase().includes("test"))) {
      updates.name = session.name;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.collection("leads").updateOne({ id: existingLead.id }, { $set: updates });
    }

    if (session && !session.leadId) {
      await db.collection(sessionsCollection).updateOne(
        { phone: cleanPhone },
        { $set: { leadId: existingLead.id, crmStatus: existingLead.status || "new-lead", updatedAt: new Date() } }
      ).catch(() => {});
    }
    return existingLead;
  }

  const cleanPhone = String(phone).replace(/[^\d]/g, "").replace(/^00/, "");
  const now = new Date();
  const id = await getNextId(db, "leads");
  const dest = options?.destination || "Ireland";

  // Assign to Pearl if available for Ireland
  let assignedTo = options?.assignedToUserId ?? null;
  let assignedToName = options?.assignedToUserName ?? null;
  let assignedToRole = options?.assignedToUserRole ?? null;

  if (!assignedTo) {
    const pearlUser = await db.collection("users").findOne({ username: { $regex: /^pearl$/i } });
    if (pearlUser) {
      assignedTo = pearlUser.id;
      assignedToName = pearlUser.name || "Pearl";
      assignedToRole = pearlUser.role || "wm";
    }
  }

  const newLead: any = {
    id,
    name: session?.name && session.name !== "Candidate" && !session.name.toLowerCase().includes("test")
      ? session.name
      : `Ireland WhatsApp Candidate (+${cleanPhone})`,
    phone: `+${cleanPhone}`,
    email: session?.email || "",
    country: session?.countryName || "Ireland",
    interestedCountry: dest,
    jobApplied: "Ireland Work Visa (Critical Skills & General Employment)",
    leadSource: "WhatsApp Ireland",
    channel: "WhatsApp Ireland",
    status: "new-lead",
    isAgent: false,
    callbackDate: null,
    callbackSeen: false,
    assignedTo,
    assignedToName,
    assignedToRole,
    assignedBy: assignedTo ? assignedTo : null,
    assignedByName: assignedToName ? assignedToName : "WhatsApp Ireland Bot",
    meetingDetails: null,
    meetingStatus: null,
    meetingCompletedAt: null,
    meetingCancelledAt: null,
    participants: assignedTo ? [assignedTo] : [],
    visibleTo: assignedTo ? [assignedTo] : [],
    notes: [
      {
        text: `Inbound WhatsApp lead captured on Ireland channel. Location: ${session?.countryName || dest} (${session?.timeZoneLabel || "Local"}).`,
        addedBy: assignedToName || "WhatsApp Ireland Bot",
        addedAt: now,
      },
    ],
    history: [
      {
        action: "created",
        performedByName: assignedToName || "WhatsApp Ireland Bot",
        timestamp: now,
        details: `Lead created from WhatsApp Ireland conversation (+${cleanPhone})`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("leads").insertOne(newLead);
  await db.collection(sessionsCollection).updateOne(
    { phone: cleanPhone },
    { $set: { leadId: id, updatedAt: now } },
    { upsert: false }
  ).catch(() => {});

  return newLead as MatchingLeadDoc;
}

export const syncOrCreateIrelandCrmLead = syncOrCreateCrmLead;
