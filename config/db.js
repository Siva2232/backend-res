const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      tlsAllowInvalidCertificates: true,
      // Give Atlas free tier enough time to wake up
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      // Heartbeat keeps TCP alive between Render and Atlas
      heartbeatFrequencyMS: 10000,
      // Keep pool small — Atlas M0 allows max 500 connections across all apps
      maxPoolSize: 5,
      minPoolSize: 1,
      // Force IPv4 — more reliable on Render infrastructure
      family: 4,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Auto-reconnect: if the pool drops, try to reconnect every 5 s
    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected — retrying in 5s");
      setTimeout(() => {
        mongoose.connect(process.env.MONGO_URI).catch((e) =>
          console.error("Reconnect failed:", e.message)
        );
      }, 5000);
    });

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err.message);
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
