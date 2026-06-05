const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const { protectConnector } = require("../../middleware/connectorAuthMiddleware");
const {
  createPrintJob,
  ackPrintJob,
  listPrintJobs,
  listPendingPrintJobs,
} = require("../../controllers/printJobController");

// Connector polls queued jobs (must be before /:id routes)
router.get("/pending", protectConnector, listPendingPrintJobs);

// Restaurant app (mobile/desktop) creates jobs via HTTPS
router.route("/")
  .post(protect, createPrintJob)
  .get(protect, listPrintJobs);

// Connector acks outcomes
router.post("/:id/ack", protectConnector, ackPrintJob);

module.exports = router;

