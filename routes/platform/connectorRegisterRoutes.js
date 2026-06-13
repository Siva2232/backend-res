const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");
const { protectConnectorJwt } = require("../../middleware/connectorJwtMiddleware");
const {
  createPairingCode,
  registerConnector,
} = require("../../controllers/platform/connectorController");

router.post("/pairing-code", protect, createPairingCode);
router.post("/register", registerConnector);

module.exports = router;
