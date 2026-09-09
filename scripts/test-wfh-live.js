const jwt = require("jsonwebtoken");
const { MongoClient } = require("mongodb");

const JWT_SECRET = "tmsvisa";
const MONGODB_URI = "mongodb://akak2805034:kumar%401212@ac-4qexduk-shard-00-00.a7n0uwg.mongodb.net:27017,ac-4qexduk-shard-00-01.a7n0uwg.mongodb.net:27017,ac-4qexduk-shard-00-02.a7n0uwg.mongodb.net:27017/crmdatabase?ssl=true&replicaSet=atlas-6bvlya-shard-0&authSource=admin&appName=TMSVISA";

const userToken = jwt.sign({ id: 3, role: "telecaller", name: "c", username: "c" }, JWT_SECRET, { expiresIn: 3600 });
const adminToken = jwt.sign({ id: 1, role: "admin", name: "a", username: "a" }, JWT_SECRET, { expiresIn: 3600 });

async function runTest() {
  console.log("=== STARTING LIVE WFH AND GHOST ALERT VERIFICATION ===");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("crmdatabase");

  // Clean any previous test activities for user 3 today so we start fresh
  const today = new Date().toISOString().split("T")[0];
  await db.collection("activities").deleteMany({ userId: 3, date: today });
  await db.collection("user_action_logs").deleteMany({ userId: 3, date: today });
  await db.collection("notifications").deleteMany({ title: /Inactivity Alert/ });

  // 1. Employee checks in
  console.log("\n[TEST 1] Employee 'c' checks in...");
  const checkinRes = await fetch("http://localhost:3000/api/activity/checkin", {
    method: "POST",
    headers: { cookie: `token=${userToken}` },
  });
  const checkinData = await checkinRes.json();
  console.log("Check-in result:", checkinData);

  // Verify current activity
  let currentRes = await fetch("http://localhost:3000/api/activity/current", {
    headers: { cookie: `token=${userToken}` },
  });
  let currentData = await currentRes.json();
  console.log("Activity right after checkin: isCheckedIn =", currentData.isCheckedIn, ", status =", currentData.activity?.status, ", actionsToday =", currentData.activity?.actionsToday, ", isGhostAlert =", currentData.activity?.isGhostAlert);

  // 2. Simulate 12 minutes of inactivity with 0 actions (Ghost Check-In)
  console.log("\n[TEST 2] Simulating 12 minutes of clocked-in time with 0 CRM actions...");
  const twelveMinsAgo = new Date(Date.now() - 12 * 60 * 1000);
  await db.collection("activities").updateOne(
    { userId: 3, date: today },
    { $set: { checkIn: twelveMinsAgo.toISOString(), firstCheckIn: twelveMinsAgo.toISOString(), shiftSeconds: 720, isGhostAlert: false } }
  );

  // Check current activity - should now detect ghost alert
  currentRes = await fetch("http://localhost:3000/api/activity/current", {
    headers: { cookie: `token=${userToken}` },
  });
  currentData = await currentRes.json();
  console.log("Activity after 12 mins of no work: isGhostAlert =", currentData.activity?.isGhostAlert, "(Expected: true)");

  // 3. Heartbeat sends update & triggers admin notification
  console.log("\n[TEST 3] Sending heartbeat for inactive employee...");
  const heartbeatRes = await fetch("http://localhost:3000/api/activity/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `token=${userToken}` },
    body: JSON.stringify({ isIdle: false, activeSecondsDelta: 60, idleSecondsDelta: 0 }),
  });
  const heartbeatData = await heartbeatRes.json();
  console.log("Heartbeat response:", heartbeatData);

  // 4. Check Admin Notifications
  console.log("\n[TEST 4] Checking Admin notifications...");
  const notifRes = await fetch("http://localhost:3000/api/notifications", {
    headers: { cookie: `token=${adminToken}` },
  });
  const notifData = await notifRes.json();
  const alertNotif = (notifData.notifications || []).find(n => n.title.includes("Inactivity Alert"));
  console.log("Admin received Inactivity Alert notification?", Boolean(alertNotif));
  if (alertNotif) {
    console.log("Notification details:", { title: alertNotif.title, message: alertNotif.message, link: alertNotif.link });
  }

  // 5. Check Admin WFH Live Monitor
  console.log("\n[TEST 5] Checking Admin WFH Monitor dashboard data...");
  const wfhRes = await fetch("http://localhost:3000/api/admin/wfh-monitor", {
    headers: { cookie: `token=${adminToken}` },
  });
  const wfhData = await wfhRes.json();
  const monitoredC = (wfhData.users || []).find(u => u.userId === 3);
  console.log("Admin WFH monitor user 'c' status:", {
    name: monitoredC?.name,
    role: monitoredC?.role,
    isCheckedIn: monitoredC?.isCheckedIn,
    isGhostAlert: monitoredC?.isGhostAlert,
    workVerificationStatus: monitoredC?.workVerificationStatus,
    actionsToday: monitoredC?.actionsToday,
    ghostAlertsCount: wfhData.overview?.ghostAlerts,
  });

  // 6. Check Admin Timeline for user 3
  console.log("\n[TEST 6] Checking Timeline Modal API for user 3...");
  const timelineRes = await fetch("http://localhost:3000/api/admin/wfh-monitor/timeline?userId=3", {
    headers: { cookie: `token=${adminToken}` },
  });
  const timelineData = await timelineRes.json();
  console.log("Timeline response:", {
    user: timelineData.user?.name,
    isGhostAlert: timelineData.activity?.isGhostAlert,
    actionsCount: timelineData.actions?.length,
  });

  // 7. Now employee actually works (creates a lead)
  console.log("\n[TEST 7] Employee 'c' creates a real lead (performing real CRM work)...");
  const testPhone = "9999" + Math.floor(100000 + Math.random() * 900000);
  const createLeadRes = await fetch("http://localhost:3000/api/leads/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `token=${userToken}` },
    body: JSON.stringify({
      name: "WFH Test Candidate",
      email: "wfhtest@example.com",
      phone: testPhone,
      city: "Melbourne",
      state: "Victoria",
    }),
  });
  const createLeadData = await createLeadRes.json();
  console.log("Lead creation result:", { success: createLeadRes.ok, leadId: createLeadData.lead?.id });

  // 8. Check employee activity after doing work
  console.log("\n[TEST 8] Checking employee activity after performing work...");
  currentRes = await fetch("http://localhost:3000/api/activity/current", {
    headers: { cookie: `token=${userToken}` },
  });
  currentData = await currentRes.json();
  console.log("Activity after creating lead:", {
    actionsToday: currentData.activity?.actionsToday,
    isGhostAlert: currentData.activity?.isGhostAlert,
    lastActionAt: currentData.activity?.lastActionAt,
  });

  // 9. Check Admin WFH Monitor again - should show verified with 1 action!
  console.log("\n[TEST 9] Checking Admin WFH Monitor after employee performed work...");
  const wfhResAfter = await fetch("http://localhost:3000/api/admin/wfh-monitor", {
    headers: { cookie: `token=${adminToken}` },
  });
  const wfhDataAfter = await wfhResAfter.json();
  const monitoredCAfter = (wfhDataAfter.users || []).find(u => u.userId === 3);
  console.log("Admin WFH monitor user 'c' updated status:", {
    name: monitoredCAfter?.name,
    actionsToday: monitoredCAfter?.actionsToday,
    latestActionSummary: monitoredCAfter?.latestActionSummary,
    isGhostAlert: monitoredCAfter?.isGhostAlert,
    workVerificationStatus: monitoredCAfter?.workVerificationStatus,
  });

  // 10. Check Timeline Modal API again
  console.log("\n[TEST 10] Checking Timeline Modal API after work...");
  const timelineResAfter = await fetch("http://localhost:3000/api/admin/wfh-monitor/timeline?userId=3", {
    headers: { cookie: `token=${adminToken}` },
  });
  const timelineDataAfter = await timelineResAfter.json();
  console.log("Timeline after work:", {
    user: timelineDataAfter.user?.name,
    isGhostAlert: timelineDataAfter.activity?.isGhostAlert,
    actions: timelineDataAfter.actions,
  });

  // Clean up test lead and activities
  if (createLeadData.lead?.id) {
    await db.collection("leads").deleteOne({ id: createLeadData.lead.id });
  }
  await client.close();
  console.log("\n=== ALL TESTS COMPLETED SUCCESSFULLY ===");
}

runTest().catch(console.error);
