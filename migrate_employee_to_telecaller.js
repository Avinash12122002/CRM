// migrate_employee_to_telecaller.js
//
// Recursively walks every document in the listed collections and replaces
// any field whose value is EXACTLY the string "employee" with "telecaller"
// (including inside nested objects and arrays, e.g. targetRoles: ["employee", "meeting"]).
//
// It does NOT touch substrings inside longer text (e.g. an email template
// paragraph that happens to contain the word "employee" won't be altered) —
// only fields whose entire value equals "employee".
//
// USAGE:
//   1. BACK UP YOUR DATABASE FIRST (mongodump) — this script writes in place.
//   2. Run with mongosh, pointed at your database:
//        mongosh "mongodb+srv://<user>:<pass>@<cluster>/<dbname>" --file migrate_employee_to_telecaller.js
//      or, if already inside mongosh connected to the right db:
//        load("migrate_employee_to_telecaller.js")

const collections = [
  "activities",
  "bdactivitylogs",
  "bdconfig",
  "bdleadnotes",
  "bdleads",
  "bdpipelinehistory",
  "billinginvoices",
  "broadcasts",
  "chatFiles.chunks",
  "chatFiles.files",
  "conversations",
  "counters",
  "dailyleadtargets",
  "email_history",
  "email_mailboxes",
  "email_templates",
  "email_workflows",
  "globalChatReads",
  "globalMessages",
  "invoices",
  "lead_workflows",
  "leads",
  "meetingSlots",
  "messages",
  "notifications",
  "starredMessages",
  "typingStatus",
  "users",
  "vacancies",
];

function deepReplace(value) {
  if (typeof value === "string") {
    return value === "employee" ? "telecaller" : value;
  }
  if (Array.isArray(value)) {
    return value.map(deepReplace);
  }
  if (value !== null && typeof value === "object") {
    // Leave BSON types (ObjectId, Date, binary data, etc.) untouched
    if (
      value instanceof ObjectId ||
      value instanceof Date ||
      value instanceof BinData ||
      value instanceof NumberLong ||
      value instanceof NumberDecimal
    ) {
      return value;
    }
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = deepReplace(value[key]);
    }
    return out;
  }
  return value;
}

let grandTotal = 0;

collections.forEach((collName) => {
  const coll = db.getCollection(collName);
  let updated = 0;
  let scanned = 0;

  coll.find({}).forEach((doc) => {
    scanned++;
    const newDoc = deepReplace(doc);
    if (JSON.stringify(newDoc) !== JSON.stringify(doc)) {
      coll.replaceOne({ _id: doc._id }, newDoc);
      updated++;
    }
  });

  grandTotal += updated;
  print(`${collName}: scanned ${scanned}, updated ${updated}`);
});

print(`\nDone. Total documents updated across all collections: ${grandTotal}`);