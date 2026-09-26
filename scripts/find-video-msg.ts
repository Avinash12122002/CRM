import { connectToDatabase } from "../src/lib/mongodb";

async function findVideoMsg() {
  const { db } = await connectToDatabase();
  const msgs = await db.collection("whatsapp_messages").find({
    text: { $regex: "explainer video" }
  }).toArray();

  console.log("Count found in whatsapp_messages:", msgs.length);
  for (const m of msgs) {
    console.log(`Phone: ${m.phone} | CreatedAt: ${m.createdAt} | Sender: ${m.sender} | SenderName: ${m.senderName} | _id: ${m._id} | messageId: ${m.messageId}`);
  }

  const out = await db.collection("whatsapp_outgoing_logs").find({
    message: { $regex: "explainer video" }
  }).toArray();
  console.log("\nCount found in whatsapp_outgoing_logs:", out.length);
  for (const o of out) {
    console.log(`Phone: ${o.phone} | CreatedAt: ${o.createdAt} | Role: ${o.sentByRole} | Name: ${o.sentByName} | _id: ${o._id} | messageId: ${o.messageId}`);
  }
}

findVideoMsg().then(() => process.exit(0)).catch(console.error);
