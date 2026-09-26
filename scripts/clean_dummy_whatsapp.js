const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('crmdatabase');

  const dummyPhones = ['971501234567', '2348012345678', '+971501234567', '+2348012345678'];
  const r1 = await db.collection('whatsapp_sessions').deleteMany({ phone: { $in: dummyPhones } });
  const r2 = await db.collection('whatsapp_messages').deleteMany({ phone: { $in: dummyPhones } });
  const r3 = await db.collection('whatsapp_incoming_logs').deleteMany({ phone: { $in: dummyPhones } });
  const r4 = await db.collection('whatsapp_outgoing_logs').deleteMany({ phone: { $in: dummyPhones } });

  console.log('Deleted dummy data:');
  console.log('Sessions removed:', r1.deletedCount);
  console.log('Messages removed:', r2.deletedCount);
  console.log('Incoming removed:', r3.deletedCount);
  console.log('Outgoing removed:', r4.deletedCount);

  await client.close();
})();
