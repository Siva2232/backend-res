const mongoose = require("mongoose");

function platformPoolMax() {
  const n = parseInt(process.env.MONGO_MAX_POOL_SIZE || "20", 10);
  return Number.isFinite(n) && n >= 5 && n <= 100 ? n : 20;
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      tlsAllowInvalidCertificates: true,
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: platformPoolMax(),
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      retryReads: true,
      retryWrites: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
