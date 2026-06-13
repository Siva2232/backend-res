const express = require("express");
const router = express.Router();
const { protectConnectorJwt } = require("../../middleware/connectorJwtMiddleware");
const { acquirePrintLock } = require("../../controllers/platform/connectorController");

router.post("/lock", protectConnectorJwt, acquirePrintLock);

module.exports = router;
