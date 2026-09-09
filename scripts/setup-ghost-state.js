const jwt = require("jsonwebtoken");
const { MongoClient } = require("mongodb");

const JWT_SECRET = "tmsvisa";
const MONGODB_URI = "mongodb://akak2805034:kumar%401212@ac-4qexduk-shard-00-00.a7n0uwg.mongodb.net:27017,ac-4qexduk-shard-00-01.a7n0uwg.mongodb.net:27017,ac-4qexduk-shard-00-02.a7n0uwg.mongodb.net:27017/crmdatabase?ssl=true&replicaSet=atlas-6bvlya-shard-0&authSource=admin&appName=TMSVISA";

const userToken = jwt.sign({ id: 3, role: "telecaller", name: "c", username: "c" }, JWT_SECRET, { expiresIn: 3600 });

async function setupGhostState() {
  console.log("Setting up Ghost Check-In State for user 3 (telecaller 'c')...");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("crmdatabase");

  const today = new Date().toISOString().split("T")[0];
  await db.collection("activities").deleteMany({ userId: 3, date: today });
  await db.collection("user_action_logs").deleteMany({ userId: 3, date: today });
  await db.collection("notifications").deleteMany({ title: /Inactivity Alert/ });

  // Check in
  const checkinRes = await fetch("http://localhost:3000/api/activity/checkin", {
    method: "POST",
    headers: { cookie: `token=${userToken}` },
  });
  console.log("Check-in status:", checkinRes.status);

  // Set check-in to 18 minutes ago, 0 actions
  const eighteenMinsAgo = new Date(Date.now() - 18 * 60 * 1000);
  await db.collection("activities").updateOne(
    { userId: 3, date: today },
    {
      $set: {
        checkIn: eighteenMinsAgo.toISOString(),
        firstCheckIn: eighteenMinsAgo.toISOString(),
        shiftSeconds: 1080,
        workSeconds: 1080,
        activeSeconds: 900,
        idleSeconds: 180,
        actionsToday: 0,
        isGhostAlert: false,
        workVerificationStatus: "pending",
      },
    }
  );

  // Send heartbeat to ensure notification gets dispatched to admin
  const heartbeatRes = await fetch("http://localhost:3000/api/activity/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `token=${userToken}` },
    body: JSON.stringify({ isIdle: false, activeSecondsDelta: 60, idleSecondsDelta: 0 }),
  });
  console.log("Heartbeat response:", await heartbeatRes.json());

  // Verify notifications collection
  const notifs = await db.collection("notifications").find({ title: /Inactivity Alert/ }).toArray();
  console.log(`Dispatched ${notifs.length} admin notification(s):`, notifs.map(n => ({ to: n.userId, title: n.title, msg: n.message })));

  await client.close();
  console.log("Ghost state ready!");
}

setupGhostState().catch(console.error);
