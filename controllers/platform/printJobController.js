const PrintJob = require("../../models/PrintJob");

function upperRid(rid) {
  return String(rid || "").toUpperCase().trim();
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

    // Best-effort immediate delivery if connector is online.
    const io = req.app.get("io");
    const connectorMap = req.app.get("printConnectorMap");
    const socketId = connectorMap?.get?.(restaurantId);
    if (io && socketId) {
      io.to(socketId).emit("printJob", {
        jobId: String(job._id),
        restaurantId,
        printerHost: job.printerHost,
        printerPort: job.printerPort,
        text: job.text,
        printerTarget: job.printerTarget,
      });
      job.status = "delivered";
      job.deliveredAt = new Date();
      job.connectorSocketId = socketId;
      await job.save();
    }

    res.status(201).json({
      jobId: job._id,
      status: job.status,
      queued: job.status === "queued",
      delivered: job.status === "delivered",
    });
  } catch (error) {
    console.error("[createPrintJob]", error);
    res.status(500).json({ message: error.message || "Failed to create print job" });
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
      job.status = "failed";
      job.failedAt = new Date();
      job.errorMessage = String(errorMessage || "Print failed");
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
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to load print jobs" });
  }
}

module.exports = { createPrintJob, ackPrintJob, listPrintJobs };

