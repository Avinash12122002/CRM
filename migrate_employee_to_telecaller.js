// rename_users.js
//
// Scoped rename: only touches records belonging to the users listed in
// RENAMES below. For each, renames both `name` and `username` in the
// users collection, and every "name snapshot" of them stored in other
// collections (including nested arrays like a lead's `history`).
//
// Note: `username` itself is never copied into other collections in this
// codebase (chat/leads screens look it up live from the users collection),
// so only `name` snapshots need to be found and fixed elsewhere.
//
// Known id-field <-> name-field pairings in this codebase:
//   assignedTo        <-> assignedToName
//   assignedBy         <-> assignedByName
//   performedBy         <-> performedByName
//   newAssignee         <-> newAssigneeName
//   createdBy           <-> createdByName
//   changedBy           <-> changedByName
//   userId               <-> userName
//   uploadedBy           <-> uploadedByName
//   sentBy               <-> sentByName
//   senderId             <-> senderName
//   bookedBy             <-> bookedByName
//   meetingUserId        <-> meetingUserName
//
// USAGE:
//   mongosh "<your MONGODB_URI>" --file rename_users.js

// Each entry: id = user's `id` field, oldDisplayName = exact current
// value of their `name` field (what's stored in *Name snapshot fields
// elsewhere), newValue = new value for both `name` and `username`.
const RENAMES = [];

// Maps a name-field to the id-field it's paired with
const NAME_TO_ID_FIELD = {
  assignedToName: "assignedTo",
  assignedByName: "assignedBy",
  performedByName: "performedBy",
  newAssigneeName: "newAssignee",
  createdByName: "createdBy",
  changedByName: "changedBy",
  userName: "userId",
  uploadedByName: "uploadedBy",
  sentByName: "sentBy",
  senderName: "senderId",
  bookedByName: "bookedBy",
  meetingUserName: "meetingUserId",
  completedByName: "completedBy",
};

// Role updates: just changes the `role` field on the users collection.
// (Role isn't snapshotted into other collections like name/username are,
// so no recursive scan is needed for these.)
const ROLE_UPDATES = [
  { id: 20, newRole: "wm" },
  { id: 21, newRole: "wm" },
];

// 1. Update each user's own record — both name and username
RENAMES.forEach(({ id, newValue }) => {
  const userResult = db.users.updateOne(
    { id: id },
    { $set: { name: newValue, username: newValue } }
  );
  print(
    `users (id ${id}): matched ${userResult.matchedCount}, modified ${userResult.modifiedCount}`
  );
});

// 1b. Update roles
ROLE_UPDATES.forEach(({ id, newRole }) => {
  const roleResult = db.users.updateOne(
    { id: id },
    { $set: { role: newRole } }
  );
  print(
    `users (id ${id}) role: matched ${roleResult.matchedCount}, modified ${roleResult.modifiedCount}`
  );
});

// Lookup by id -> { oldDisplayName, newValue }, for fast matching below
const RENAMES_BY_ID = {};
RENAMES.forEach((r) => {
  RENAMES_BY_ID[r.id] = r;
});

// 2. Recursively walk a document/subdocument/array and fix matching name snapshots.
function recurseAndFix(node) {
  let changed = false;

  if (Array.isArray(node)) {
    node.forEach((item) => {
      if (item !== null && typeof item === "object") {
        if (recurseAndFix(item)) changed = true;
      }
    });
    return changed;
  }

  if (node !== null && typeof node === "object") {
    if (
      node instanceof ObjectId ||
      node instanceof Date ||
      node instanceof BinData ||
      node instanceof NumberLong ||
      node instanceof NumberDecimal
    ) {
      return false;
    }

    Object.keys(node).forEach((key) => {
      const idField = NAME_TO_ID_FIELD[key];
      if (idField) {
        const whoValue = node[idField];
        const rename = RENAMES_BY_ID[whoValue];
        if (rename && node[key] === rename.oldDisplayName) {
          node[key] = rename.newValue;
          changed = true;
        } else if (node[key] !== null && typeof node[key] === "object") {
          if (recurseAndFix(node[key])) changed = true;
        }
      } else if (node[key] !== null && typeof node[key] === "object") {
        if (recurseAndFix(node[key])) changed = true;
      }
    });
  }

  return changed;
}

// 3. Scan every other collection in the database (hardcoded list, `users` excluded — handled above)
const allCollections = [
  "case_marketing_employers",
  "case_marketing_sources",
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
  "triloknath_leads",
  "typingStatus",
  "vacancies",
];
let grandTotal = 0;

allCollections.forEach((collName) => {
  const coll = db.getCollection(collName);
  let updated = 0;
  let scanned = 0;

  coll.find({}).forEach((doc) => {
    scanned++;
    if (recurseAndFix(doc)) {
      coll.replaceOne({ _id: doc._id }, doc);
      updated++;
    }
  });

  print(`${collName}: scanned ${scanned}, updated ${updated}`);
  grandTotal += updated;
});

print(
  `\nDone. Total records (outside users) updated for ${RENAMES.map((r) => r.newValue).join(", ")}: ${grandTotal}`
);