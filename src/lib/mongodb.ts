import { MongoClient, Db } from "mongodb";

declare global {
  var _mongoClientInstance: { client: MongoClient; db: Db } | undefined;
}

let cached = global._mongoClientInstance;
let indexesEnsured = false;

async function ensureIndexes(db: Db) {
  if (indexesEnsured) return;
  indexesEnsured = true;
  await Promise.all([
    db.collection("bdleads").createIndex({ id: 1 }),
    db.collection("bdleads").createIndex({ createdAt: 1 }),
    db.collection("bdleads").createIndex({ status: 1 }),
    db.collection("bdpipelinehistory").createIndex({ leadId: 1 }),
    db.collection("bdactivitylogs").createIndex({ leadId: 1, action: 1 }),
    db.collection("bdactivitylogs").createIndex({ id: 1 }),
    db.collection("dailyleadtargets").createIndex({ date: 1 }),
    db.collection("users").createIndex({ role: 1 }),
    // ── Activity tracking indexes (heartbeat, ghost check, wfh-monitor) ──
    db.collection("activities").createIndex({ userId: 1, date: 1 }),
    db.collection("activities").createIndex({ userId: 1, checkOut: 1 }),
    db.collection("activities").createIndex({ date: 1 }),
    db.collection("activities").createIndex({ isGhostAlert: 1 }),
    db.collection("activities").createIndex({ lastHeartbeatAt: 1 }),
    // ── Audit log indexes (actionsToday count, ghost evaluation, timeline) ──
    db.collection("user_action_logs").createIndex({ userId: 1, date: 1 }),
    db.collection("user_action_logs").createIndex({ date: 1 }),
    db.collection("user_action_logs").createIndex({ timestamp: -1 }),
    // Email Workflow Engine indexes
    db.collection("lead_workflows").createIndex({ leadId: 1 }, { unique: true }),
    db.collection("lead_workflows").createIndex({ nextFollowupAt: 1 }),
    db.collection("lead_workflows").createIndex({ currentStage: 1 }),
    db.collection("email_history").createIndex({ leadId: 1 }),
    db.collection("email_history").createIndex({ sentAt: 1 }),
    db.collection("email_history").createIndex({ stage: 1 }),
    db.collection("invoices").createIndex({ leadId: 1 }),
    db.collection("invoices").createIndex({ invoiceNumber: 1 }, { unique: true }),
    db.collection("email_mailboxes").createIndex({ email: 1 }, { unique: true }),
    db.collection("email_workflows").createIndex({ name: 1 }),
    db.collection("email_templates").createIndex({ stage: 1 }),
    db.collection("email_templates").createIndex({ mailbox: 1 }),
    // Case Manager CV Marketing Workspace indexes
    db.collection("case_marketing_sources").createIndex({ leadId: 1, phase: 1, order: 1 }),
    db.collection("case_marketing_sources").createIndex({ id: 1 }),
    db.collection("case_marketing_employers").createIndex({ leadId: 1 }),
    db.collection("case_marketing_employers").createIndex({ sourceId: 1 }),
    db.collection("case_marketing_employers").createIndex({ id: 1 }),
    db.collection("case_marketing_employers").createIndex({ companyName: 1 }),
    db.collection("meetingSlots").createIndex({ meetingDate: 1, startTime: 1 }),
  ]).catch((err) => console.error("Index creation failed:", err));
}

export async function connectToDatabase() {
  if (cached) return cached;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment");

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const db = client.db();

    cached = { client, db };
    global._mongoClientInstance = cached;
    ensureIndexes(db); // fire-and-forget, runs once per warm instance
    return cached;
  } catch (err) {
    try {
      await client.close();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_closeErr) {
      // ignore close errors
    }
    throw err;
  }
}