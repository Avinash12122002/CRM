// rename_mohit_to_mohittest.js
//
// Scoped rename: only touches records belonging to Mohit (user id 3,
// current username "mohit"). Renames both his `name` and `username` in
// the users collection, and every "name snapshot" of him stored in other
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
//   mongosh "<your MONGODB_URI>" --file rename_mohit_to_mohittest.js

const MOHIT_ID = 3;
const OLD_NAME = "mohit";
const NEW_NAME = "mohittest";

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
};

// 1. Update his own user record — both name and username
const userResult = db.users.updateOne(
  { id: MOHIT_ID },
  { $set: { name: NEW_NAME, username: NEW_NAME } }
);
print(
  `users: matched ${userResult.matchedCount}, modified ${userResult.modifiedCount}`
);

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
      if (idField && node[key] === OLD_NAME) {
        const whoValue = node[idField];
        if (whoValue === MOHIT_ID) {
          node[key] = NEW_NAME;
          changed = true;
        }
      } else if (node[key] !== null && typeof node[key] === "object") {
        if (recurseAndFix(node[key])) changed = true;
      }
    });
  }

  return changed;
}

// 3. Scan every other collection in the database
const allCollections = db.getCollectionNames();
let grandTotal = 0;

allCollections.forEach((collName) => {
  if (collName === "users") return; // handled above
  if (collName.startsWith("system.")) return;

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
  `\nDone. Total records (outside users) updated for Mohit: ${grandTotal}`
);