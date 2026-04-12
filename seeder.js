const mongoose = require("mongoose");
const dotenv = require("dotenv");
// const users = require("./data/users"); // sample user list removed, file no longer exists
const products = [
  // {
  //   name: "Classic Burger",
  //   price: 149,
  //   category: "Burgers",
  //   image: "https://images.unsplash.com/photo-1550547660-d9450f859349",
  //   description: "A juicy beef patty with fresh lettuce, tomato, and our secret sauce.",
  //   type: "non-veg",
  //   stock: 50,
  //   isAvailable: true,
  // },
  // {
  //   name: "Cheese Pizza",
  //   price: 249,
  //   category: "Pizza",
  //   image: "https://images.unsplash.com/photo-1601924582975-7e1f52fbb06c",
  //   description: "Extra cheese and our special house-made tomato sauce.",
  //   type: "veg",
  //   stock: 30,
  //   isAvailable: true,
  // },
  // {
  //   name: "Veg Sandwich",
  //   price: 99,
  //   category: "Sandwiches",
  //   image: "https://images.unsplash.com/photo-1528731708534-816fe59f90cb",
  //   description: "Loaded with fresh vegetables and creamy mayo.",
  //   type: "veg",
  //   stock: 20,
  //   isAvailable: true,
  // },
  // {
  //   name: "Masala Tea",
  //   price: 30,
  //   category: "Beverages",
  //   image: "https://images.unsplash.com/photo-1541167760496-1628856ab772",
  //   description: "Traditional Indian tea with spices.",
  //   type: "veg",
  //   stock: 100,
  //   isAvailable: true,
  // },
];
const User = require("./models/User");
const Product = require("./models/Product");
const Banner = require("./models/Banner");
const Offer = require("./models/Offer");
const Order = require("./models/Order");
const Bill = require("./models/Bill");
const Category = require("./models/Category");
const SuperAdmin = require("./models/SuperAdmin");
const connectDB = require("./config/db");

dotenv.config();

connectDB();

const categories = [
  { name: "Starters" },
  { name: "Main Courses" },
  { name: "Desserts" },
  { name: "Beverages" },
];

const banners = [];

const offers = [];

const importData = async () => {
  try {
    await Bill.deleteMany();
    await Order.deleteMany();
    await Product.deleteMany();
    await User.deleteMany();
    await Banner.deleteMany();
    await Offer.deleteMany();
    await Category.deleteMany();

    await Category.insertMany(categories);
    console.log("Categories Seeded!");

    // ── Super Admin — always reset to known credentials ──────────────────────
    await SuperAdmin.deleteMany();
    await SuperAdmin.create({
      name:     "Super Admin",
      email:    "superadmin@platform.com",
      password: "SuperAdmin@123",
    });
    console.log("Super Admin Created!");
    console.log("  Email   : superadmin@platform.com");
    console.log("  Password: SuperAdmin@123");

    // Add a default admin user
    const adminUser = await User.create({
      name: "Admin User",
      email: "admin@example.com",
      password: "password123",
      isAdmin: true,
      role: "admin",
    });

    // Add a default kitchen staff user
    const kitchenUser = await User.create({
      name: "Kitchen Staff",
      email: "kitchen@demo.com",
      password: "kitchen123",
      isAdmin: false,
      isKitchen: true,
      salary: 15000,
      role: "kitchen",
    });

    // Add a default waiter user
    const waiterUser = await User.create({
      name: "Waiter",
      email: "waiter@demo.com",
      password: "password123",
      isAdmin: false,
      isKitchen: false,
      isWaiter: true,
      salary: 12000,
      role: "waiter",
    });

    // Add a default support team user for the customer support panel
    const supportUser = await User.create({
      name: "Hari Krishnan",
      email: "support@platform.com",
      password: "Support@123",
      isAdmin: false,
      isKitchen: false,
      isWaiter: false,
      salary: 0,
      role: "support",
    });
    console.log("Support Agent Created!");
    console.log("  Email   : support@platform.com");
    console.log("  Password: Support@123");

    await Product.insertMany(products);
    await Banner.insertMany(banners);
    await Offer.insertMany(offers);

    console.log("Data Imported!");
    process.exit();
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
};

const destroyData = async () => {
  try {
    await Bill.deleteMany();
    await Order.deleteMany();
    await Product.deleteMany();
    await User.deleteMany();
    await SuperAdmin.deleteMany();
    await Category.deleteMany();

    console.log("Data Destroyed!");
    process.exit();
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
};

if (process.argv[2] === "-d") {
  destroyData();
} else {
  importData();
}
