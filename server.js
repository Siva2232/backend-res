/**
 * Process entrypoint — keeps DNS + dotenv at top; delegates HTTP/Socket bootstrap after Mongo connects.
 * Express routes & middleware live in createApp.js (easier to test and deploy behind proxies).
 */
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const connectDB = require("./config/db");
const { validateProductionEnv } = require("./config/env");
const { createApp } = require("./createApp");
const { attachSocketIO } = require("./attachSocket");

validateProductionEnv();

const attendanceDir = path.join(__dirname, "uploads", "attendance");
if (!fs.existsSync(attendanceDir)) {
  fs.mkdirSync(attendanceDir, { recursive: true });
}

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    console.log("MongoDB connection established.");

    const app = createApp();
    const server = http.createServer(app);
    attachSocketIO(server, app);

    const { initHRCronJobs, initSubscriptionCronJobs } = require("./services/cronService");
    initHRCronJobs(app);
    initSubscriptionCronJobs(app);

    server.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
    });

    const { closeAllConnections } = require("./utils/dbConnection");
    const shutdown = async (signal) => {
      console.log(`${signal} received, closing connections...`);
      await closeAllConnections();
      server.close(() => process.exit(0));
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });
