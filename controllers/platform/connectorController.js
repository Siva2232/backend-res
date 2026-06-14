const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const ConnectorDevice = require("../../models/ConnectorDevice");
const ConnectorPairingCode = require("../../models/ConnectorPairingCode");
const Restaurant = require("../../models/Restaurant");
const PrintJob = require("../../models/PrintJob");
const { signConnectorToken, upperRid } = require("../../middleware/connectorJwtMiddleware");
const { getConnectorCount } = require("../../utils/printConnectorRegistry");

function generateConnectorId() {
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CONN${suffix}`;
}

function generatePairCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateDeviceToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashToken(token) {
  return bcrypt.hashSync(String(token), 10);
}

function verifyTokenHash(token, hash) {
  return bcrypt.compareSync(String(token), hash);
}

function isPairingExpired(doc) {
  return !doc || doc.usedAt || new Date(doc.expiresAt) < new Date();
}

function formatPrinterSettings(ps = {}) {
  const fmt = (key) => ({
    host: ps[key]?.host || "",
    port: Number(ps[key]?.port) || 9100,
  });
  return {
    invoice: fmt("invoice"),
    kitchen: fmt("kitchen"),
    bar: fmt("bar"),
    delivery: fmt("delivery"),
  };
}

/**
 * @desc    Admin generates pairing QR / code
 * @route   POST /api/connector/pairing-code
 */
async function createPairingCode(req, res) {
  try {
    const restaurantId = upperRid(req.user?.restaurantId);
    if (!restaurantId) {
      return res.status(400).json({ message: "Missing restaurantId in session" });
    }

    const isAdmin = req.user?.isAdmin || req.user?.role === "admin";
    if (!isAdmin && req.user?.role !== "superadmin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const restaurant = await Restaurant.findOne({ restaurantId });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    const deviceToken = generateDeviceToken();
    const pairCode = generatePairCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await ConnectorPairingCode.deleteMany({
      restaurantId,
      usedAt: { $exists: false },
      expiresAt: { $lt: new Date() },
    });

    const pairing = await ConnectorPairingCode.create({
      restaurantId,
      pairCode,
      deviceTokenHash: hashToken(deviceToken),
      deviceTokenPlain: deviceToken,
      expiresAt,
      createdByUserId: req.user?._id,
    });

    res.status(201).json({
      restaurantId,
      restaurantName: restaurant.name,
      pairCode,
      deviceToken,
      expiresAt: pairing.expiresAt,
      qrPayload: {
        restaurantId,
        deviceToken,
        pairCode,
      },
    });
  } catch (error) {
    console.error("[createPairingCode]", error);
    res.status(500).json({ message: error.message || "Failed to create pairing code" });
  }
}

/**
 * @desc    Register connector device after QR / pair code
 * @route   POST /api/connector/register
 */
async function registerConnector(req, res) {
  try {
    const { restaurantId, deviceName, deviceToken, pairCode } = req.body || {};
    const rid = upperRid(restaurantId);

    if (!rid) return res.status(400).json({ message: "restaurantId is required" });
    if (!deviceToken && !pairCode) {
      return res.status(400).json({ message: "deviceToken or pairCode is required" });
    }

    const restaurant = await Restaurant.findOne({ restaurantId: rid });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    let matchedPairing = null;

    if (deviceToken) {
      matchedPairing = await ConnectorPairingCode.findOne({
        restaurantId: rid,
        deviceTokenPlain: String(deviceToken).trim(),
        usedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      });
    }

    if (!matchedPairing && pairCode) {
      const candidates = await ConnectorPairingCode.find({
        restaurantId: rid,
        pairCode: String(pairCode).trim(),
        usedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: -1 })
        .limit(1);

      matchedPairing = candidates[0] || null;
      if (matchedPairing && deviceToken) {
        if (matchedPairing.deviceTokenPlain !== String(deviceToken).trim()) {
          return res.status(401).json({ message: "Invalid pairing credentials" });
        }
      }
    }

    if (!matchedPairing || isPairingExpired(matchedPairing)) {
      return res.status(401).json({ message: "Invalid or expired pairing code" });
    }

    const tokenToStore = matchedPairing.deviceTokenPlain;
    matchedPairing.usedAt = new Date();
    await matchedPairing.save();

    const connectorId = generateConnectorId();
    const connector = await ConnectorDevice.create({
      connectorId,
      restaurantId: rid,
      deviceName: String(deviceName || "RestoPrint Device").trim().slice(0, 80),
      deviceTokenHash: hashToken(tokenToStore),
      lastHeartbeatAt: new Date(),
      isOnline: true,
      printerSettings: formatPrinterSettings(restaurant.printerSettings),
    });

    const jwtToken = signConnectorToken(connector);

    res.status(201).json({
      connectorId: connector.connectorId,
      jwtToken,
      restaurantId: rid,
      restaurantName: restaurant.name,
      printerSettings: connector.printerSettings,
    });
  } catch (error) {
    console.error("[registerConnector]", error);
    res.status(500).json({ message: error.message || "Failed to register connector" });
  }
}

/**
 * @desc    Connector heartbeat
 * @route   POST /api/connectors/heartbeat
 */
async function connectorHeartbeat(req, res) {
  try {
    const connector = req.connector;
    connector.lastHeartbeatAt = new Date();
    connector.isOnline = true;
    await connector.save();

    res.json({
      ok: true,
      connectorId: connector.connectorId,
      restaurantId: connector.restaurantId,
      connectorsOnline: getConnectorCount(connector.restaurantId),
    });
  } catch (error) {
    console.error("[connectorHeartbeat]", error);
    res.status(500).json({ message: error.message || "Heartbeat failed" });
  }
}

/**
 * @desc    Acquire print lock for duplicate protection
 * @route   POST /api/print/lock
 */
async function acquirePrintLock(req, res) {
  try {
    const { jobId } = req.body || {};
    const connectorId = req.connector.connectorId;
    const restaurantId = upperRid(req.connector.restaurantId);

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await PrintJob.findOne({ _id: jobId, restaurantId });
    if (!job) return res.status(404).json({ message: "Print job not found" });

    if (job.lockedByConnectorId && job.lockedByConnectorId !== connectorId) {
      return res.status(409).json({ locked: false, message: "Job locked by another connector" });
    }

    if (job.status === "printed") {
      return res.status(409).json({ locked: false, message: "Job already printed" });
    }

    const locked = await PrintJob.findOneAndUpdate(
      {
        _id: jobId,
        restaurantId,
        status: { $in: ["queued", "delivered"] },
        $or: [{ lockedByConnectorId: null }, { lockedByConnectorId: connectorId }],
      },
      {
        $set: {
          lockedByConnectorId: connectorId,
          lockedAt: new Date(),
          status: "printing",
        },
      },
      { new: true }
    );

    if (!locked) {
      return res.status(409).json({ locked: false, message: "Could not acquire lock" });
    }

    res.json({ locked: true, jobId: String(locked._id), status: locked.status });
  } catch (error) {
    console.error("[acquirePrintLock]", error);
    res.status(500).json({ message: error.message || "Failed to acquire lock" });
  }
}

/**
 * @desc    List paired connectors for restaurant
 * @route   GET /api/connectors
 */
async function listConnectors(req, res) {
  try {
    const restaurantId = upperRid(req.params.restaurantId || req.user?.restaurantId);
    if (!restaurantId) return res.status(400).json({ message: "restaurantId is required" });

    const userRid = upperRid(req.user?.restaurantId);
    const isSuperAdmin = req.user?.role === "superadmin";
    if (!isSuperAdmin && userRid !== restaurantId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const staleBefore = new Date(Date.now() - 60 * 1000);
    await ConnectorDevice.updateMany(
      { restaurantId, isRevoked: false, lastHeartbeatAt: { $lt: staleBefore } },
      { $set: { isOnline: false } }
    );

    const connectors = await ConnectorDevice.find({ restaurantId, isRevoked: false })
      .sort({ updatedAt: -1 })
      .select("-deviceTokenHash")
      .lean();

    const legacyOnline = getConnectorCount(restaurantId);
    const jwtOnline = connectors.filter((c) => c.isOnline).length;

    res.json({
      connectors: connectors.map((c) => ({
        connectorId: c.connectorId,
        deviceName: c.deviceName,
        isOnline: Boolean(c.isOnline),
        lastHeartbeatAt: c.lastHeartbeatAt,
        createdAt: c.createdAt,
      })),
      onlineCount: jwtOnline + legacyOnline,
      jwtOnlineCount: jwtOnline,
      legacyOnlineCount: legacyOnline,
    });
  } catch (error) {
    console.error("[listConnectors]", error);
    res.status(500).json({ message: error.message || "Failed to list connectors" });
  }
}

/**
 * @desc    Revoke a connector device
 * @route   DELETE /api/connectors/:connectorId
 */
async function revokeConnector(req, res) {
  try {
    const restaurantId = upperRid(req.user?.restaurantId);
    const isAdmin = req.user?.isAdmin || req.user?.role === "admin";
    if (!isAdmin && req.user?.role !== "superadmin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const connector = await ConnectorDevice.findOne({
      connectorId: String(req.params.connectorId || "").toUpperCase().trim(),
      restaurantId,
    });

    if (!connector) return res.status(404).json({ message: "Connector not found" });

    connector.isRevoked = true;
    connector.isOnline = false;
    connector.socketId = undefined;
    await connector.save();

    res.json({ ok: true, connectorId: connector.connectorId, revoked: true });
  } catch (error) {
    console.error("[revokeConnector]", error);
    res.status(500).json({ message: error.message || "Failed to revoke connector" });
  }
}

/**
 * @desc    Sync printer settings from connector
 * @route   PUT /api/connectors/printer-settings
 */
async function updateConnectorPrinterSettings(req, res) {
  try {
    const connector = req.connector;
    const { invoice, kitchen, bar, delivery } = req.body || {};

    if (!connector.printerSettings) connector.printerSettings = {};

    const apply = (key, val) => {
      if (!val || typeof val !== "object") return;
      if (!connector.printerSettings[key]) connector.printerSettings[key] = {};
      if (val.host !== undefined) {
        connector.printerSettings[key].host = String(val.host).trim();
      }
      if (val.port !== undefined) {
        connector.printerSettings[key].port = Number(val.port) || 9100;
      }
    };

    apply("invoice", invoice);
    apply("kitchen", kitchen);
    apply("bar", bar);
    apply("delivery", delivery);

    await connector.save();

    try {
      const Restaurant = require("../../models/Restaurant");
      const rid = String(connector.restaurantId || "").toUpperCase().trim();
      const restaurant = await Restaurant.findOne({ restaurantId: rid });
      if (restaurant) {
        if (!restaurant.printerSettings) restaurant.printerSettings = {};
        const mirror = (key, val) => {
          if (!val || typeof val !== "object" || !val.host) return;
          restaurant.printerSettings[key] = {
            host: String(val.host).trim(),
            port: Number(val.port) || 9100,
          };
        };
        mirror("invoice", invoice);
        mirror("kitchen", kitchen);
        mirror("bar", bar);
        mirror("delivery", delivery);
        await restaurant.save();
      }
    } catch (mirrorErr) {
      console.warn("[updateConnectorPrinterSettings] restaurant mirror failed", mirrorErr.message);
    }

    res.json({ ok: true, printerSettings: formatPrinterSettings(connector.printerSettings) });
  } catch (error) {
    console.error("[updateConnectorPrinterSettings]", error);
    res.status(500).json({ message: error.message || "Failed to update printer settings" });
  }
}

module.exports = {
  createPairingCode,
  registerConnector,
  connectorHeartbeat,
  acquirePrintLock,
  listConnectors,
  revokeConnector,
  updateConnectorPrinterSettings,
  formatPrinterSettings,
};
