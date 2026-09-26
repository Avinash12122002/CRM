import { connectToDatabase } from "../src/lib/mongodb";

async function inspect() {
  const { db } = await connectToDatabase();
  const phone = "919354497615";

  console.log("=== whatsapp_messages ===");
  const msgs = await db.collection("whatsapp_messages").find({ phone }).sort({ createdAt: -1 }).limit(10).toArray();
  for (const m of msgs) {
    console.log(`[${m.createdAt}] _id: ${m._id} sender: ${m.sender} senderName: ${m.senderName} messageId: ${m.messageId} text: "${m.text.slice(0, 40)}"`);
  }

  console.log("\n=== whatsapp_outgoing_logs ===");
  const out = await db.collection("whatsapp_outgoing_logs").find({ phone }).sort({ createdAt: -1 }).limit(10).toArray();
  for (const o of out) {
    console.log(`[${o.createdAt}] _id: ${o._id} sentByRole: ${o.sentByRole} sentByName: ${o.sentByName} messageId: ${o.messageId} text: "${o.message.slice(0, 40)}"`);
  }

  console.log("\n=== whatsapp_sessions conversationHistory ===");
  const sess = await db.collection("whatsapp_sessions").findOne({ phone });
  if (sess?.conversationHistory) {
    for (const h of sess.conversationHistory.slice(-6)) {
      console.log(`[${h.timestamp}] role: ${h.role} step: ${h.step} text: "${h.message.slice(0, 40)}"`);
    }
  }
}

inspect().then(() => process.exit(0)).catch(console.error);
