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

    // RestoPrint v2: JWT-based connector joins restaurant room
    socket.on("joinRestaurant", async ({ restaurantId, connectorId, token } = {}) => {
      try {
        if (!restaurantId || !connectorId || !token) {
          socket.emit("restaurantJoined", { ok: false, error: "Missing credentials" });
          return;
        }

        const { verifyConnectorToken } = require("./middleware/connectorJwtMiddleware");
        const ConnectorDevice = require("./models/ConnectorDevice");

        const decoded = verifyConnectorToken(token);
        const rid = String(restaurantId).toUpperCase().trim();
        const cid = String(connectorId).toUpperCase().trim();

        if (decoded.restaurantId !== rid || decoded.connectorId !== cid) {
          socket.emit("restaurantJoined", { ok: false, error: "Credential mismatch" });
          return;
        }

        const connector = await ConnectorDevice.findOne({
          connectorId: cid,
          restaurantId: rid,
          isRevoked: false,
        });

        if (!connector) {
          socket.emit("restaurantJoined", { ok: false, error: "Connector revoked or not found" });
          return;
        }

        addConnector(rid, socket.id);
        socket.data = socket.data || {};
        socket.data.printConnectorRid = rid;
        socket.data.connectorId = cid;
        socket.join(`print:${rid}`);

        connector.socketId = socket.id;
        connector.isOnline = true;
        connector.lastHeartbeatAt = new Date();
        await connector.save();

        const onlineCount = getConnectorCount(rid);
        console.log(
          `socket ${socket.id} joined restaurant ${rid} as ${cid} (${onlineCount} online)`
        );
        socket.emit("restaurantJoined", {
          ok: true,
          restaurantId: rid,
          connectorId: cid,
          onlineCount,
        });
      } catch (err) {
        console.warn(`Socket ${socket.id}: joinRestaurant failed`, err.message);
        socket.emit("restaurantJoined", { ok: false, error: err.message || "Join failed" });
      }
    });

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

    socket.on("disconnect", async () => {
      const rid = socket?.data?.printConnectorRid;
      const connectorId = socket?.data?.connectorId;

      if (connectorId) {
        try {
          const ConnectorDevice = require("./models/ConnectorDevice");
          await ConnectorDevice.updateOne(
            { connectorId, restaurantId: rid },
            { $set: { isOnline: false, socketId: null } }
          );
        } catch (_) {}
      }

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
