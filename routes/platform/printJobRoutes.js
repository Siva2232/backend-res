const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const { protectConnector } = require("../../middleware/connectorAuthMiddleware");
const { protectConnectorJwt } = require("../../middleware/connectorJwtMiddleware");
const {
  createPrintJob,
  ackPrintJob,
  listPrintJobs,
  listPendingPrintJobs,
} = require("../../controllers/platform/printJobController");

function protectConnectorAny(req, res, next) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return protectConnectorJwt(req, res, next);
  }
  return protectConnector(req, res, next);
}

router.get("/pending", protectConnectorAny, listPendingPrintJobs);

router.route("/")
  .post(protect, createPrintJob)
  .get(protect, listPrintJobs);

router.post("/:id/ack", protectConnectorAny, ackPrintJob);

module.exports = router;
