import { MongoClient, Db } from "mongodb";

let cached: { client: MongoClient; db: Db } | undefined;

export async function connectToDatabase() {
  if (cached) return cached;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment");

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();

    cached = { client, db };
    return cached;
  } catch (err) {
    // ensure client is closed on failure
    try {
      await client.close();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_closeErr) {
      // ignore close errors
    }
    throw err;
  }
}
