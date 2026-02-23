const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Order = require("./models/Order");
const Bill = require("./models/Bill");
const connectDB = require("./config/db");

dotenv.config();

const migrate = async () => {
  await connectDB();
  try {
    const orders = await Order.find({});
    console.log(`Found ${orders.length} orders to migrate...`);

    let createdCount = 0;
    for (const order of orders) {
      // Check if bill already exists for this orderRef
      const existing = await Bill.findOne({ orderRef: order._id });
      if (!existing) {
        await Bill.create({
          orderRef: order._id,
          table: order.table,
          items: order.items,
          totalAmount: order.totalAmount,
          status: order.status,
          paymentMethod: order.paymentMethod,
          notes: order.notes,
          billDetails: order.billDetails,
          billedAt: order.createdAt,
        });
        createdCount++;
      }
    }

    console.log(`Migration complete! Created ${createdCount} bills.`);
    process.exit();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

migrate();
