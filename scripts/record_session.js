const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('crmdatabase');

  await db.collection('whatsapp_sessions').updateOne(
    { phone: '919354497615' },
    {
      $set: {
        name: 'Avinash',
        lastMessage: 'Are you interested in the Australia Employer Sponsored Work Visa?',
        lastMessageAt: new Date(),
        lastSender: 'bot',
        unreadCount: 0,
      }
    }
  );

  // Check if message already logged
  const count = await db.collection('whatsapp_messages').countDocuments({ phone: '919354497615' });
  if (count === 0) {
    await db.collection('whatsapp_messages').insertOne({
      phone: '919354497615',
      sender: 'bot',
      senderName: 'TMS Automation',
      text: 'Hello ☺️! Welcome to The Migration School (TMS Visa) 🇦🇺.\n\nWe specialize in employer-sponsored work visas for Australia.\n\n*Are you interested in the Australia Employer Sponsored Work Visa?*',
      msgType: 'interactive_button',
      buttons: [
        { id: 'BTN_482_YES', title: 'Yes, Interested' },
        { id: 'BTN_482_NO', title: 'Not Right Now' }
      ],
      createdAt: new Date(),
    });
  }

  console.log('Done!');
  await client.close();
})();
