const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");
const { protectConnectorJwt } = require("../../middleware/connectorJwtMiddleware");
const {
  connectorHeartbeat,
  listConnectors,
  revokeConnector,
  updateConnectorPrinterSettings,
} = require("../../controllers/platform/connectorController");

router.post("/heartbeat", protectConnectorJwt, connectorHeartbeat);
router.put("/printer-settings", protectConnectorJwt, updateConnectorPrinterSettings);
router.get("/", protect, listConnectors);
router.get("/:restaurantId", protect, listConnectors);
router.delete("/:connectorId", protect, revokeConnector);

module.exports = router;
