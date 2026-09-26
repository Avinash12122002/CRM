import { connectToDatabase } from "../src/lib/mongodb";

async function searchAll() {
  const { db } = await connectToDatabase();
  const cols = await db.listCollections().toArray();

  for (const c of cols) {
    const colName = c.name;
    try {
      const match = await db.collection(colName).findOne({
        $or: [
          { text: { $regex: "17-migz0VwryoP" } },
          { message: { $regex: "17-migz0VwryoP" } },
          { "conversationHistory.message": { $regex: "17-migz0VwryoP" } }
        ]
      });
      if (match) {
        console.log(`FOUND in collection: ${colName}!`);
        console.log(JSON.stringify(match, null, 2).slice(0, 500));
      }
    } catch (e) {}
  }
}

searchAll().then(() => process.exit(0)).catch(console.error);
