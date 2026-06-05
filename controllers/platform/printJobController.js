const PrintJob = require("../../models/PrintJob");
const {
  pickConnectorSocketId,
  getConnectorCount,
} = require("../../utils/printConnectorRegistry");

function upperRid(rid) {
  return String(rid || "").toUpperCase().trim();
}

function emitPrintJob(io, socketId, job) {
  if (!io || !socketId || !job) return false;
  io.to(socketId).emit("printJob", {
    jobId: String(job._id),
    restaurantId: upperRid(job.restaurantId),
    printerHost: job.printerHost,
    printerPort: job.printerPort,
    text: job.text,
    printerTarget: job.printerTarget,
  });
  return true;
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

    const { printerTarget, printerHost, printerPort, text } = req.body || {};
    if (!printerHost || !String(printerHost).trim()) {
      return res.status(400).json({ message: "printerHost is required" });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "text is required" });
    }

    const job = await PrintJob.create({
      restaurantId,
      createdByUserId: req.user?._id,
      printerTarget: printerTarget || "custom",
      printerHost: String(printerHost).trim(),
      printerPort: Number(printerPort) || 9100,
      text: String(text),
      status: "queued",
    });

    const delivered = await tryDeliverJob(job, req);

    res.status(201).json({
      jobId: job._id,
      status: job.status,
      queued: job.status === "queued",
      delivered: delivered || job.status === "delivered",
      connectorsOnline: getConnectorCount(restaurantId),
    });
  } catch (error) {
    console.error("[createPrintJob]", error);
    res.status(500).json({ message: error.message || "Failed to create print job" });
  }
}

/**
 * @desc    Connector polls queued jobs (drain when coming online)
 * @route   GET /api/print-jobs/pending
 * @access  Private (Connector token)
 */
async function listPendingPrintJobs(req, res) {
  try {
    const restaurantId = upperRid(req.connectorRestaurantId);
    if (!restaurantId) {
      return res.status(401).json({ message: "Invalid connector session" });
    }

    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    const jobs = await PrintJob.find({ restaurantId, status: "queued" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    const io = req.app.get("io");
    const claimed = [];

    for (const row of jobs) {
      const job = await PrintJob.findOneAndUpdate(
        { _id: row._id, status: "queued" },
        {
          $set: {
            status: "delivered",
            deliveredAt: new Date(),
            connectorSocketId: "pending-poll",
          },
        },
        { new: true }
      );
      if (!job) continue;

      claimed.push({
        jobId: String(job._id),
        restaurantId,
        printerHost: job.printerHost,
        printerPort: job.printerPort,
        text: job.text,
        printerTarget: job.printerTarget,
      });
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
 * @access  Private (Connector token)
 */
async function ackPrintJob(req, res) {
  try {
    const restaurantId = upperRid(req.connectorRestaurantId);
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
    } else {
      job.status = "queued";
      job.failedAt = new Date();
      job.errorMessage = String(errorMessage || "Print failed");
      job.deliveredAt = undefined;
      job.connectorSocketId = undefined;
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

    res.json({
      jobs,
      connectorsOnline: getConnectorCount(restaurantId),
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
};
