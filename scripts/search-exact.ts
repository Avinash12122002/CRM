import { connectToDatabase } from "../src/lib/mongodb";

async function searchExact() {
  const { db } = await connectToDatabase();
  const cols = await db.listCollections().toArray();

  for (const c of cols) {
    const colName = c.name;
    const matches = await db.collection(colName).find({
      $or: [
        { text: { $regex: "free 1-on-1 consultation", $options: "i" } },
        { message: { $regex: "free 1-on-1 consultation", $options: "i" } },
        { "conversationHistory.message": { $regex: "free 1-on-1 consultation", $options: "i" } },
        { "history.details": { $regex: "free 1-on-1 consultation", $options: "i" } }
      ]
    }).toArray();

    if (matches.length > 0) {
      console.log(`Found ${matches.length} matches in collection: ${colName}`);
      for (const m of matches) {
        console.log(`_id: ${m._id}, phone: ${m.phone || m.id || m.leadId}`);
        console.log(JSON.stringify(m).slice(0, 300));
      }
    }
  }
}

searchExact().then(() => process.exit(0)).catch(console.error);
