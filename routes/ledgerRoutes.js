const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getLedgers, getLedger, createLedger, updateLedger, deleteLedger, getLedgerStatement,
} = require("../controllers/ledgerController");

router.use(protect);

router.route("/").get(getLedgers).post(admin, createLedger);
router.route("/:id").get(getLedger).put(admin, updateLedger).delete(admin, deleteLedger);
router.get("/:id/statement", getLedgerStatement);

module.exports = router;
