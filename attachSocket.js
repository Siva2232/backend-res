const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const {
  addConnector,
  removeConnector,
  getConnectorCount,
} = require("./utils/printConnectorRegistry");

/**
 * Attach Socket.IO to the HTTP server and expose via app.set('io', io).
 * Paths resolve relative to backend root (models/, utils/).
 */
function attachSocketIO(server, app) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

  app.set("io", io);
  app.set("getPrintConnectorCount", getConnectorCount);

  io.on("connection", async (socket) => {
    console.log("socket client connected", socket.id);

    // Print connector registers itself so backend can deliver jobs to it.
    socket.on("registerPrintConnector", ({ restaurantId, token } = {}) => {
      const expected = String(process.env.PRINT_CONNECTOR_TOKEN || "").trim();
      if (!expected || !token || token !== expected) {
        console.warn(`Socket ${socket.id}: invalid connector token`);
        socket.emit("printConnectorRegistered", { ok: false, error: "Invalid token" });
        return;
      }
      if (!restaurantId) {
        socket.emit("printConnectorRegistered", { ok: false, error: "Missing restaurantId" });
        return;
      }
      const rid = String(restaurantId).toUpperCase().trim();
      addConnector(rid, socket.id);
      socket.data = socket.data || {};
      socket.data.printConnectorRid = rid;
      socket.join(`print:${rid}`);
      const onlineCount = getConnectorCount(rid);
      console.log(
        `socket ${socket.id} registered as print connector for ${rid} (${onlineCount} online)`
      );
      socket.emit("printConnectorRegistered", { ok: true, restaurantId: rid, onlineCount });
    });

    socket.on("joinRoom", async ({ restaurantId, token } = {}) => {
      if (!restaurantId) return;
      const rid = String(restaurantId).toUpperCase().trim();

      socket.join(rid);
      console.log(`socket ${socket.id} joined room ${rid}`);

      if (!token) return;

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const decodedRid = (decoded.restaurantId || "").toUpperCase().trim();
        if (decodedRid !== rid) {
          console.warn(
            `Socket ${socket.id}: token restaurantId "${decodedRid}" does not match requested room "${rid}" — snapshot denied`
          );
          return;
        }
        const staffUser = await User.findById(decoded.id)
          .select("isAdmin isKitchen isWaiter role restaurantId")
          .lean();
        if (!staffUser) return;
        if (staffUser.restaurantId && staffUser.restaurantId.toUpperCase() !== rid) return;
        const isStaff =
          staffUser.isAdmin ||
          staffUser.isKitchen ||
          staffUser.isWaiter ||
          ["admin", "kitchen", "waiter"].includes(staffUser.role);
        if (!isStaff) return;

        const OrderModel = require("./models/Order");
        const { getModel } = require("./utils/getModel");
        const Order = await getModel("Order", OrderModel.schema, rid);
        const orders = await Order.find(
          { status: { $in: ["Pending", "New", "Preparing", "Ready", "Served"] } },
          { "items.image": 0, "items.product": 0, waiter: 0, paymentId: 0, __v: 0 }
        )
          .sort({ createdAt: -1 })
          .limit(100)
          .lean();
        socket.emit("ordersSnapshot", orders);
      } catch {
        console.warn(`Socket ${socket.id}: joinRoom token verification failed — no snapshot sent`);
      }
    });

    socket.on("disconnect", () => {
      const rid = socket?.data?.printConnectorRid;
      if (rid) {
        removeConnector(rid, socket.id);
        console.log(
          `print connector for ${rid} disconnected (${socket.id}); ${getConnectorCount(rid)} remaining`
        );
      }
      console.log("socket client disconnected", socket.id);
    });
  });

  return io;
}

module.exports = { attachSocketIO };
