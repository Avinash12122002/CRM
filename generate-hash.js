const bcrypt = require("bcryptjs");

async function generateHash() {
  const password = process.argv[2];

  if (!password) {
    console.log("Usage: node generate-hash.js yourpassword");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  console.log("\nPassword:", password);
  console.log("Hash:", hash);
}

generateHash();