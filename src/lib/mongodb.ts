import { MongoClient, Db } from "mongodb";

let cached: { client: MongoClient; db: Db } | undefined;
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
  ]).catch((err) => console.error("Index creation failed:", err));
}

export async function connectToDatabase() {
  if (cached) return cached;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment");

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();

    cached = { client, db };
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