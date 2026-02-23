const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Order = require("./models/Order");
const Bill = require("./models/Bill");
const connectDB = require("./config/db");

dotenv.config();

const checkData = async () => {
  await connectDB();
  try {
    const orderCount = await Order.countDocuments();
    const billCount = await Bill.countDocuments();
    console.log(`Orders in DB: ${orderCount}`);
    console.log(`Bills in DB: ${billCount}`);

    if (billCount > 0) {
        const sampleBill = await Bill.findOne();
        console.log("Sample Bill:", JSON.stringify(sampleBill, null, 2));
    } else if (orderCount > 0) {
        console.log("Orders exist but no bills found.");
        const sampleOrder = await Order.findOne();
        console.log("Sample Order:", JSON.stringify(sampleOrder, null, 2));
    }

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

checkData();
