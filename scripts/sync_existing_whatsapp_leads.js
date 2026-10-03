const { MongoClient } = require('mongodb');

async function getNextId(db, name) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = result && result.value ? result.value : result;
  if (doc && typeof doc.seq === 'number') {
    return doc.seq;
  }
  const counterDoc = await db.collection('counters').findOne({ _id: name });
  return counterDoc && typeof counterDoc.seq === 'number' ? counterDoc.seq : 1;
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log("Connected to MongoDB. Starting sync for existing WhatsApp sessions...");

  // 1. Sync Australia sessions
  const auSessions = await db.collection('whatsapp_sessions').find().toArray();
  console.log(`Found ${auSessions.length} Australia sessions in whatsapp_sessions.`);

  for (const session of auSessions) {
    const rawPhone = String(session.phone || '');
    const cleanPhone = rawPhone.replace(/[^\d]/g, '').replace(/^00/, '');
    if (!cleanPhone) continue;

    const last10 = cleanPhone.slice(-10);
    const phoneQueries = [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
    ];
    if (cleanPhone.length >= 8 && !isNaN(Number(cleanPhone))) {
      phoneQueries.push({ phone: Number(cleanPhone) });
    }
    if (last10.length === 10) {
      phoneQueries.push(
        { phone: last10 },
        { phone: `+91${last10}` },
        { phone: { $regex: `${last10}$` } }
      );
      if (!isNaN(Number(last10))) {
        phoneQueries.push({ phone: Number(last10) });
      }
    }
    if (session.leadId) {
      phoneQueries.push({ id: session.leadId });
    }

    let lead = await db.collection('leads').findOne({ $or: phoneQueries });

    if (lead) {
      console.log(`[AU] Session +${cleanPhone} matches existing CRM lead #${lead.id} (${lead.name}) - Status: ${lead.status}`);
      await db.collection('whatsapp_sessions').updateOne(
        { phone: session.phone },
        { $set: { leadId: lead.id, crmStatus: lead.status } }
      );
    } else {
      const id = await getNextId(db, 'leads');
      const now = session.createdAt ? new Date(session.createdAt) : new Date();
      const candidateName = session.name && session.name !== 'Candidate' && !session.name.toLowerCase().includes('test')
        ? session.name
        : `WhatsApp Candidate (+${cleanPhone})`;

      const newLead = {
        id,
        name: candidateName,
        phone: `+${cleanPhone}`,
        email: session.email || '',
        country: session.countryName || (cleanPhone.startsWith('91') ? 'India' : 'Australia'),
        interestedCountry: 'Australia',
        jobApplied: 'Australia Employer Sponsored Work Visa',
        leadSource: 'WhatsApp Ad Automation',
        status: 'new-lead',
        isAgent: false,
        callbackDate: null,
        callbackSeen: false,
        assignedTo: null,
        assignedToName: null,
        assignedToRole: null,
        assignedBy: null,
        assignedByName: null,
        meetingDetails: null,
        meetingStatus: null,
        meetingCompletedAt: null,
        meetingCancelledAt: null,
        participants: [],
        visibleTo: [],
        notes: [
          {
            text: `Inbound WhatsApp lead captured. Location: ${session.countryName || 'Australia'} (${session.timeZoneLabel || 'Local'}).`,
            addedBy: 'WhatsApp System',
            addedAt: now,
          },
        ],
        history: [
          {
            action: 'created',
            performedByName: 'WhatsApp System',
            timestamp: now,
            details: `Lead created from WhatsApp conversation (+${cleanPhone})`,
          },
        ],
        createdAt: now,
        updatedAt: new Date(),
      };

      await db.collection('leads').insertOne(newLead);
      await db.collection('whatsapp_sessions').updateOne(
        { phone: session.phone },
        { $set: { leadId: id, crmStatus: 'new-lead' } }
      );
      console.log(`[AU] Created NEW CRM Lead #${id} for +${cleanPhone} (${candidateName}) with status: new-lead`);
    }
  }

  // 2. Sync Ireland sessions
  const ieSessions = await db.collection('whatsapp_ireland_sessions').find().toArray();
  console.log(`Found ${ieSessions.length} Ireland sessions in whatsapp_ireland_sessions.`);

  for (const session of ieSessions) {
    const rawPhone = String(session.phone || '');
    const cleanPhone = rawPhone.replace(/[^\d]/g, '').replace(/^00/, '');
    if (!cleanPhone) continue;

    const last10 = cleanPhone.slice(-10);
    const phoneQueries = [
      { phone: cleanPhone },
      { phone: `+${cleanPhone}` },
    ];
    if (cleanPhone.length >= 8 && !isNaN(Number(cleanPhone))) {
      phoneQueries.push({ phone: Number(cleanPhone) });
    }
    if (last10.length === 10) {
      phoneQueries.push(
        { phone: last10 },
        { phone: `+91${last10}` },
        { phone: { $regex: `${last10}$` } }
      );
    }
    if (session.leadId) {
      phoneQueries.push({ id: session.leadId });
    }

    let lead = await db.collection('leads').findOne({ $or: phoneQueries });

    if (lead) {
      console.log(`[IE] Session +${cleanPhone} matches existing CRM lead #${lead.id} (${lead.name}) - Status: ${lead.status}`);
      await db.collection('whatsapp_ireland_sessions').updateOne(
        { phone: session.phone },
        { $set: { leadId: lead.id, crmStatus: lead.status } }
      );
    } else {
      const id = await getNextId(db, 'leads');
      const now = session.createdAt ? new Date(session.createdAt) : new Date();
      const candidateName = session.name && session.name !== 'Candidate' && !session.name.toLowerCase().includes('test')
        ? session.name
        : `Ireland WhatsApp Candidate (+${cleanPhone})`;

      const newLead = {
        id,
        name: candidateName,
        phone: `+${cleanPhone}`,
        email: session.email || '',
        country: session.countryName || 'Ireland',
        interestedCountry: 'Ireland',
        jobApplied: 'Ireland Work Visa (Critical Skills & General Employment)',
        leadSource: 'WhatsApp Ireland',
        channel: 'WhatsApp Ireland',
        status: 'new-lead',
        isAgent: false,
        callbackDate: null,
        callbackSeen: false,
        assignedTo: null,
        assignedToName: null,
        assignedToRole: null,
        assignedBy: null,
        assignedByName: null,
        meetingDetails: null,
        meetingStatus: null,
        meetingCompletedAt: null,
        meetingCancelledAt: null,
        participants: [],
        visibleTo: [],
        notes: [
          {
            text: `Inbound WhatsApp lead captured on Ireland channel. Location: ${session.countryName || 'Ireland'} (${session.timeZoneLabel || 'Local'}).`,
            addedBy: 'WhatsApp Ireland Bot',
            addedAt: now,
          },
        ],
        history: [
          {
            action: 'created',
            performedByName: 'WhatsApp Ireland Bot',
            timestamp: now,
            details: `Lead created from WhatsApp Ireland conversation (+${cleanPhone})`,
          },
        ],
        createdAt: now,
        updatedAt: new Date(),
      };

      await db.collection('leads').insertOne(newLead);
      await db.collection('whatsapp_ireland_sessions').updateOne(
        { phone: session.phone },
        { $set: { leadId: id, crmStatus: 'new-lead' } }
      );
      console.log(`[IE] Created NEW CRM Lead #${id} for +${cleanPhone} (${candidateName}) with status: new-lead`);
    }
  }

  console.log("All existing WhatsApp sessions are now synced with CRM Leads!");
  await client.close();
})();
