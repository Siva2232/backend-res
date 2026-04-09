// Force IPv4 DNS resolution globally — prevents ENETUNREACH on platforms
// (like Render) that don't support outbound IPv6 connections (e.g. to smtp.gmail.com)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

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
const accRoutes = require("./routes/accRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const subscriptionPlanRoutes = require("./routes/subscriptionPlanRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { tenantMiddleware } = require("./middleware/tenantMiddleware");
const { requireFeature } = require("./middleware/featureMiddleware");
const { protect } = require("./middleware/authMiddleware");

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
    const { initHRCronJobs, initSubscriptionCronJobs } = require('./services/cronService');
    initHRCronJobs();
    initSubscriptionCronJobs();
    // Seed accounting Chart of Accounts
    const { seedAccounts } = require('./utils/accSeeder');
    seedAccounts();
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

// Global restaurantId extraction middleware
// Priority: query param → x-restaurant-id header → JWT bearer token
// Auth middleware may further override this with the JWT-based restaurantId.
const _jwt = require('jsonwebtoken');
app.use((req, res, next) => {
  // 1. Query param or explicit header
  const rid = req.query.restaurantId || req.headers['x-restaurant-id'];
  if (rid) {
    req.restaurantId = String(rid).toUpperCase().trim();
  }

  // 2. Fall back to JWT token if no query param was provided
  if (!req.restaurantId) {
    try {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const decoded = _jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
        if (decoded.restaurantId) {
          req.restaurantId = String(decoded.restaurantId).toUpperCase().trim();
        }
      }
    } catch (_) { /* invalid / expired token — ignore */ }
  }

  next();
});

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

  // Client must emit joinRoom with restaurantId to receive restaurant-scoped events
  socket.on('joinRoom', async (restaurantId) => {
    if (!restaurantId) return;
    const rid = String(restaurantId).toUpperCase().trim();
    socket.join(rid);
    console.log(`socket ${socket.id} joined room ${rid}`);

    // Send a lightweight snapshot of active orders for THIS restaurant only
    try {
      const OrderModel = require('./models/Order');
      const { getModel } = require('./utils/getModel');
      const Order = await getModel('Order', OrderModel.schema, rid);
      const orders = await Order.find(
        { status: { $in: ['Pending', 'New', 'Preparing', 'Ready', 'Served'] } },
        { 'items.image': 0, 'items.product': 0, waiter: 0, paymentId: 0, __v: 0 }
      ).sort({ createdAt: -1 }).limit(100).lean();
      socket.emit('ordersSnapshot', orders);
    } catch (err) {
      console.error('failed to load orders for socket snapshot', err);
    }
  });

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

// ─── Tenant-isolated routes ───────────────────────────────────────────────
// Every route below uses tenantMiddleware so each restaurant gets its OWN
// data (products, orders, bills, kitchen bills, tables, etc.).
// tenantMiddleware validates restaurantId is present, the restaurant exists,
// and is active. It sets req.restaurantId + req.restaurant for controllers.
app.use("/api/products", tenantMiddleware, productRoutes);
app.use("/api/orders", tenantMiddleware, orderRoutes);
app.use("/api/bills", tenantMiddleware, billRoutes);
app.use("/api/kitchen-bills", tenantMiddleware, kitchenBillRoutes);
app.use("/api/banners", tenantMiddleware, bannerRoutes);
app.use("/api/offers", tenantMiddleware, offerRoutes);
app.use("/api/categories", tenantMiddleware, categoryRoutes);
app.use("/api/payment", tenantMiddleware, paymentRoutes);
app.use("/api/sub-items", tenantMiddleware, subItemRoutes);
app.use("/api/tables", tenantMiddleware, tableRoutes);
app.use("/api/notifications", tenantMiddleware, notificationRoutes);
app.use("/api/reservations", tenantMiddleware, reservationRoutes);

// ─── Non-tenant routes (platform-level) ──────────────────────────────────
// Auth uses the shared User collection (no per-restaurant DB needed)
app.use("/api/auth", authRoutes);
// HR Module Routes — feature guard applied inside routes that need it
// (HR staff /login is public, so we can't guard at app.use level)
app.use("/api/hr/staff", tenantMiddleware, hrStaffRoutes);
app.use("/api/hr/attendance", tenantMiddleware, hrAttendanceRoutes);
app.use("/api/hr/leaves", tenantMiddleware, hrLeaveRoutes);
app.use("/api/hr/shifts", tenantMiddleware, hrShiftRoutes);
app.use("/api/hr/payroll", tenantMiddleware, hrPayrollRoutes);
// Accounting / Tally Module Routes — all routes require auth already via router.use(protect)
app.use("/api/acc", tenantMiddleware, accRoutes);
// SaaS Multi-Tenant Routes (platform-level, no per-restaurant DB)
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/plans", subscriptionPlanRoutes);
app.use("/api/superadmin", superAdminRoutes);

app.use(notFound);
app.use(errorHandler);

// Graceful shutdown: close all per-restaurant DB connections
const { closeAllConnections } = require('./utils/dbConnection');
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await closeAllConnections();
  server.close(() => process.exit(0));
});
process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  await closeAllConnections();
  server.close(() => process.exit(0));
});

