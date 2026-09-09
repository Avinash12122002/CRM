const jwt = require("jsonwebtoken");

const JWT_SECRET = "tmsvisa";
const userToken = jwt.sign({ id: 3, role: "telecaller", name: "c", username: "c" }, JWT_SECRET, { expiresIn: 3600 });

async function simulateWork() {
  console.log("Simulating real CRM work by employee 'c'...");
  const testPhone = "98" + Math.floor(10000000 + Math.random() * 90000000);
  const res = await fetch("http://localhost:3000/api/leads/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `token=${userToken}`,
    },
    body: JSON.stringify({
      name: "Rohit Sharma",
      email: "rohit.sharma@example.com",
      phone: testPhone,
      city: "Sydney",
      state: "NSW",
      status: "new-lead",
      note: "Candidate interested in subclass 189/190 skilled visa. Follow up scheduled.",
    }),
  });

  const data = await res.json();
  console.log("Lead created:", { status: res.status, lead: data.lead?.name, id: data.lead?.id });
}

simulateWork().catch(console.error);
