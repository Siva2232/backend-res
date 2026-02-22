const mongoose = require("mongoose");
const dotenv = require("dotenv");
// const users = require("./data/users"); // sample user list removed, file no longer exists
const products = [
  {
    name: "Classic Burger",
    price: 149,
    category: "Burgers",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349",
    description: "A juicy beef patty with fresh lettuce, tomato, and our secret sauce.",
    type: "non-veg",
    stock: 50,
    isAvailable: true,
  },
  {
    name: "Cheese Pizza",
    price: 249,
    category: "Pizza",
    image: "https://images.unsplash.com/photo-1601924582975-7e1f52fbb06c",
    description: "Extra cheese and our special house-made tomato sauce.",
    type: "veg",
    stock: 30,
    isAvailable: true,
  },
  {
    name: "Veg Sandwich",
    price: 99,
    category: "Sandwiches",
    image: "https://images.unsplash.com/photo-1528731708534-816fe59f90cb",
    description: "Loaded with fresh vegetables and creamy mayo.",
    type: "veg",
    stock: 20,
    isAvailable: true,
  },
  {
    name: "Masala Tea",
    price: 30,
    category: "Beverages",
    image: "https://images.unsplash.com/photo-1541167760496-1628856ab772",
    description: "Traditional Indian tea with spices.",
    type: "veg",
    stock: 100,
    isAvailable: true,
  },
];
const User = require("./models/User");
const Product = require("./models/Product");
const Banner = require("./models/Banner");
const Offer = require("./models/Offer");
const Order = require("./models/Order");
const connectDB = require("./config/db");

dotenv.config();

connectDB();

const banners = [
  {
    title: "Grand Opening",
    description: "Celebrate with us! Complimentary dessert.",
    imageUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b",
    tag: "New",
  },
  {
    title: "Happy Hours",
    description: "50% off beverages between 4‑6pm.",
    imageUrl: "https://images.unsplash.com/photo-1640777291247-0b2b1d3f3d26",
    tag: "Drinks",
  },
];

const offers = [
  {
    title: "10% Off Burgers",
    description: "Use code BURGER10",
    imageUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349",
    tag: "Burger Deal",
    isPublished: true,
  },
  {
    title: "Free Fries",
    description: "With any large pizza",
    imageUrl: "https://images.unsplash.com/photo-1601924582975-7e1f52fbb06c",
    tag: "Pizza Special",
    isPublished: true,
  },
];

const importData = async () => {
  try {
    await Order.deleteMany();
    await Product.deleteMany();
    await User.deleteMany();
    await Banner.deleteMany();
    await Offer.deleteMany();

    // Add a default admin user
    const adminUser = await User.create({
      name: "Admin User",
      email: "admin@example.com",
      password: "password123",
      isAdmin: true,
    });

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
    await Order.deleteMany();
    await Product.deleteMany();
    await User.deleteMany();

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
