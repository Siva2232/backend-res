/**
 * Reset (or create) the Super Admin credentials.
 * Run: node reset-superadmin.js
 */
const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("./config/db");
const SuperAdmin = require("./models/SuperAdmin");

(async () => {
  await connectDB();
  await SuperAdmin.deleteMany();
  await SuperAdmin.create({
    name:     "Super Admin",
    email:    "superadmin@platform.com",
    password: "SuperAdmin@123",
  });
  console.log("✅ Super Admin reset successfully!");
  console.log("   Email   : superadmin@platform.com");
  console.log("   Password: SuperAdmin@123");
  process.exit(0);
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
