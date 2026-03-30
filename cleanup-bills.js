const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Bill = require("./models/Bill");
const Order = require("./models/Order");
const connectDB = require("./config/db");

dotenv.config();

const cleanupOldBills = async () => {
  try {
    await connectDB();
    
    // Keep only the last 3 days of closed bills to keep the DB lean
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 3);

    const result = await Bill.deleteMany({
      status: "Closed",
      billedAt: { $lt: cutoffDate }
    });

    console.log(`Successfully cleaned up ${result.deletedCount} old closed bills.`);
    
    // Also clean up closed orders attached to these
    const orderResult = await Order.deleteMany({
        status: "Closed",
        createdAt: { $lt: cutoffDate }
    });
    console.log(`Successfully cleaned up ${orderResult.deletedCount} old closed orders.`);

    process.exit();
  } catch (error) {
    console.error(`Error during cleanup: ${error.message}`);
    process.exit(1);
  }
};

cleanupOldBills();
