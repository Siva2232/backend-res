const PrintJob = require("../../models/PrintJob");
const Restaurant = require("../../models/Restaurant");
const ConnectorDevice = require("../../models/ConnectorDevice");
const {
  pickConnectorSocketId,
  getConnectorCount,
} = require("../../utils/printConnectorRegistry");

function upperRid(rid) {
  return String(rid || "").toUpperCase().trim();
}

function resolvePrinterType(body) {
  return (
    body.printerType ||
    body.printerTarget ||
    (body.type === "kot" ? "kitchen" : body.type) ||
    "custom"
  );
}

function formatJobPayload(job) {
  const base = {
    jobId: String(job._id),
    restaurantId: upperRid(job.restaurantId),
    printerHost: job.printerHost,
    printerPort: job.printerPort,
    printerTarget: job.printerTarget,
    printerType: job.printerType || job.printerTarget,
    type: job.type || job.printerTarget,
  };

  if (job.payload && typeof job.payload === "object") {
    return { ...base, payload: job.payload };
  }

  return { ...base, text: job.text || "" };
}

function emitPrintJob(io, socketId, job) {
  if (!io || !socketId || !job) return false;
  io.to(socketId).emit("printJob", formatJobPayload(job));
  return true;
}

async function resolvePrinterFromRestaurant(restaurantId, printerType) {
  const restaurant = await Restaurant.findOne({ restaurantId: upperRid(restaurantId) }).select(
    "printerSettings"
  );
  if (!restaurant?.printerSettings) return null;

  const key = printerType === "invoice" ? "invoice" : printerType;
  const ps = restaurant.printerSettings[key];
  if (!ps?.host) return null;

  return {
    host: String(ps.host).trim(),
    port: Number(ps.port) || 9100,
  };
}

async function tryDeliverJob(job, req) {
  const io = req.app.get("io");
  const restaurantId = upperRid(job.restaurantId);
  const socketId = pickConnectorSocketId(restaurantId);
  if (!io || !socketId) return false;

  emitPrintJob(io, socketId, job);
  job.status = "delivered";
  job.deliveredAt = new Date();
  job.connectorSocketId = socketId;
  await job.save();
  return true;
}

function getRestaurantIdFromReq(req) {
  if (req.connector?.restaurantId) return upperRid(req.connector.restaurantId);
  if (req.connectorRestaurantId) return upperRid(req.connectorRestaurantId);
  return null;
}

/**
 * @desc    Create a print job (mobile/remote printing via connector)
 * @route   POST /api/print-jobs
 * @access  Private (Restaurant Admin/User)
 */
async function createPrintJob(req, res) {
  try {
    const restaurantId = upperRid(req.user?.restaurantId);
    if (!restaurantId) {
      return res.status(400).json({ message: "Missing restaurantId in session" });
    }

    const body = req.body || {};
    const { printerTarget, printerHost, printerPort, text, type, printerType, payload } = body;

    const resolvedType = type || (printerTarget === "kitchen" ? "kot" : printerTarget) || "custom";
    const resolvedPrinterType = resolvePrinterType(body);

    let host = String(printerHost || "").trim();
    let port = Number(printerPort) || 9100;
    let jobText = text ? String(text) : "";
    let jobPayload = payload;

    if (jobPayload && typeof jobPayload === "object") {
      if (!host) {
        const resolved = await resolvePrinterFromRestaurant(restaurantId, resolvedPrinterType);
        if (!resolved?.host) {
          return res.status(400).json({
            message: `${resolvedPrinterType} printer IP not configured. Set it in Admin Profile.`,
          });
        }
        host = resolved.host;
        port = resolved.port;
      }
    } else {
      if (!host) {
        return res.status(400).json({ message: "printerHost is required" });
      }
      if (!jobText.trim()) {
        return res.status(400).json({ message: "text or payload is required" });
      }
    }

    const job = await PrintJob.create({
      restaurantId,
      createdByUserId: req.user?._id,
      printerTarget: printerTarget || resolvedPrinterType,
      printerType: resolvedPrinterType,
      type: resolvedType,
      payload: jobPayload,
      printerHost: host,
      printerPort: port,
      text: jobText,
      status: "queued",
    });

    const delivered = await tryDeliverJob(job, req);

    const jwtOnline = await ConnectorDevice.countDocuments({
      restaurantId,
      isRevoked: false,
      isOnline: true,
    });

    res.status(201).json({
      jobId: job._id,
      status: job.status,
      queued: job.status === "queued",
      delivered: delivered || job.status === "delivered",
      connectorsOnline: getConnectorCount(restaurantId) + jwtOnline,
    });
  } catch (error) {
    console.error("[createPrintJob]", error);
    res.status(500).json({ message: error.message || "Failed to create print job" });
  }
}

/**
 * @desc    Connector polls queued jobs (drain when coming online)
 * @route   GET /api/print-jobs/pending
 * @access  Private (Connector token or JWT)
 */
async function listPendingPrintJobs(req, res) {
  try {
    const restaurantId = getRestaurantIdFromReq(req);
    if (!restaurantId) {
      return res.status(401).json({ message: "Invalid connector session" });
    }

    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    const jobs = await PrintJob.find({ restaurantId, status: "queued" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    const claimed = [];

    for (const row of jobs) {
      const job = await PrintJob.findOneAndUpdate(
        { _id: row._id, status: "queued" },
        {
          $set: {
            status: "delivered",
            deliveredAt: new Date(),
            connectorSocketId: req.connector?.connectorId || "pending-poll",
          },
        },
        { new: true }
      );
      if (!job) continue;
      claimed.push(formatJobPayload(job));
    }

    res.json({
      jobs: claimed,
      count: claimed.length,
      connectorsOnline: getConnectorCount(restaurantId),
    });
  } catch (error) {
    console.error("[listPendingPrintJobs]", error);
    res.status(500).json({ message: error.message || "Failed to load pending jobs" });
  }
}

/**
 * @desc    Connector acknowledges job outcome
 * @route   POST /api/print-jobs/:id/ack
 * @access  Private (Connector token or JWT)
 */
async function ackPrintJob(req, res) {
  try {
    const restaurantId = getRestaurantIdFromReq(req);
    if (!restaurantId) return res.status(401).json({ message: "Invalid connector session" });

    const job = await PrintJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Print job not found" });
    if (upperRid(job.restaurantId) !== restaurantId) {
      return res.status(403).json({ message: "Not authorized for this restaurant" });
    }

    const { ok, errorMessage } = req.body || {};
    if (ok) {
      job.status = "printed";
      job.printedAt = new Date();
      job.errorMessage = undefined;
      job.failedAt = undefined;
      job.lockedByConnectorId = undefined;
      job.lockedAt = undefined;
    } else {
      job.status = "queued";
      job.failedAt = new Date();
      job.errorMessage = String(errorMessage || "Print failed");
      job.deliveredAt = undefined;
      job.connectorSocketId = undefined;
      job.lockedByConnectorId = undefined;
      job.lockedAt = undefined;
      await job.save();

      await tryDeliverJob(job, req);

      return res.json({ ok: true, status: job.status, requeued: true });
    }
    await job.save();

    res.json({ ok: true, status: job.status });
  } catch (error) {
    console.error("[ackPrintJob]", error);
    res.status(500).json({ message: error.message || "Failed to update print job" });
  }
}

/**
 * @desc    Fetch recent jobs for restaurant (optional UI support)
 * @route   GET /api/print-jobs
 * @access  Private (Restaurant Admin/User)
 */
async function listPrintJobs(req, res) {
  try {
    const restaurantId = upperRid(req.user?.restaurantId);
    if (!restaurantId) return res.status(400).json({ message: "Missing restaurantId in session" });

    const jobs = await PrintJob.find({ restaurantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const jwtOnline = await ConnectorDevice.countDocuments({
      restaurantId,
      isRevoked: false,
      isOnline: true,
    });

    res.json({
      jobs,
      connectorsOnline: getConnectorCount(restaurantId) + jwtOnline,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to load print jobs" });
  }
}

module.exports = {
  createPrintJob,
  ackPrintJob,
  listPrintJobs,
  listPendingPrintJobs,
  formatJobPayload,
  emitPrintJob,
};
