const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const connectDB = require("./config/db");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const billRoutes = require("./routes/billRoutes");
const kitchenBillRoutes = require("./routes/kitchenBillRoutes");
const authRoutes = require("./routes/authRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const offerRoutes = require("./routes/offerRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const subItemRoutes = require("./routes/subItemRoutes");
const tableRoutes = require("./routes/tableRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const hrStaffRoutes = require("./routes/hrStaffRoutes");
const hrAttendanceRoutes = require("./routes/hrAttendanceRoutes");
const hrLeaveRoutes = require("./routes/hrLeaveRoutes");
const hrShiftRoutes = require("./routes/hrShiftRoutes");
const hrPayrollRoutes = require("./routes/hrPayrollRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

dotenv.config();

// create express app and HTTP server early
// so we can reference `server` when starting after DB connection
const app = express();
const fs = require('fs');
const http = require('http');
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Create uploads/attendance directory if it doesn't exist
const attendanceDir = path.join(__dirname, 'uploads', 'attendance');
if (!fs.existsSync(attendanceDir)) {
  fs.mkdirSync(attendanceDir, { recursive: true });
}

// establish database connection and start server only when ready
// this prevents incoming requests from hitting mongoose before
// the connection is established (which can trigger buffering timeouts)
connectDB()
  .then(() => {
    console.log("MongoDB connection established from server.js");
    // Initialize HR cron jobs after DB is ready
    const { initHRCronJobs } = require('./services/cronService');
    initHRCronJobs();
    // start listening after DB is connected
    server.listen(PORT, () =>
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });

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

// gzip/brotli compress all responses for faster transfer
app.use(compression());

// allow larger payloads for base64 image upload
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// configure socket.io and make it available via app.get('io')
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});
app.set('io', io);

io.on('connection', async (socket) => {
  console.log('socket client connected', socket.id);

  // send a lightweight snapshot of active orders only (no images/heavy fields)
  try {
    const Order = require('./models/Order');
    const orders = await Order.find(
      { status: { $in: ['Pending', 'New', 'Preparing', 'Ready', 'Served'] } },
      { 'items.image': 0, 'items.product': 0, waiter: 0, paymentId: 0, __v: 0 }
    ).sort({ createdAt: -1 }).limit(100).lean();
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

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/kitchen-bills", kitchenBillRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/sub-items", subItemRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reservations", reservationRoutes);
// HR Module Routes
app.use("/api/hr/staff", hrStaffRoutes);
app.use("/api/hr/attendance", hrAttendanceRoutes);
app.use("/api/hr/leaves", hrLeaveRoutes);
app.use("/api/hr/shifts", hrShiftRoutes);
app.use("/api/hr/payroll", hrPayrollRoutes);

app.use(notFound);
app.use(errorHandler);

