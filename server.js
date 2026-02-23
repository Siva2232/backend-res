const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const billRoutes = require("./routes/billRoutes");
const authRoutes = require("./routes/authRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const offerRoutes = require("./routes/offerRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

dotenv.config();

// establish database connection and log when ready
connectDB()
  .then(() => console.log("MongoDB connection established from server.js"))
  .catch((err) => console.error("MongoDB connection failed:", err));

const app = express();

// configure CORS to allow both the deployed frontend and local development
const allowedOrigins = [
  "https://restowebtest.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        // optionally allow all during development:
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        
        var msg = 'The CORS policy for this site does not ' +
                  'allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// allow larger payloads for base64 image upload
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// we will attach socket.io to the underlying HTTP server later

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/categories", categoryRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// use a raw http server so we can hook socket.io onto it
const http = require('http');
const server = http.createServer(app);

// configure socket.io and make it available via app.get('io')
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: "https://restowebtest.netlify.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

io.on('connection', async (socket) => {
  console.log('socket client connected', socket.id);

  // send a one-time snapshot so the client can populate immediately
  try {
    const Order = require('./models/Order');
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
    socket.emit('ordersSnapshot', orders);
  } catch (err) {
    console.error('failed to load orders for socket snapshot', err);
  }

  socket.on('disconnect', () => {
    console.log('socket client disconnected', socket.id);
  });
});

// make the io instance retrievable from request handlers
app.set('io', io);

server.listen(PORT, () =>
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);

