import { connectToDatabase } from "../src/lib/mongodb";

async function listAll() {
  const { db } = await connectToDatabase();
  const msgs = await db.collection("whatsapp_messages").find({}).sort({ createdAt: -1 }).limit(30).toArray();
  console.log("Last 30 messages in whatsapp_messages:");
  for (const m of msgs) {
    console.log(`[${m.createdAt}] phone: ${m.phone} | sender: ${m.sender} | senderName: ${m.senderName} | text: "${m.text.slice(0, 50)}"`);
  }

  const out = await db.collection("whatsapp_outgoing_logs").find({}).sort({ createdAt: -1 }).limit(30).toArray();
  console.log("\nLast 30 in whatsapp_outgoing_logs:");
  for (const o of out) {
    console.log(`[${o.createdAt}] phone: ${o.phone} | sentByRole: ${o.sentByRole} | text: "${o.message.slice(0, 50)}"`);
  }
}

listAll().then(() => process.exit(0)).catch(console.error);
