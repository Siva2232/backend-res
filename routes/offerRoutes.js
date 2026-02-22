const express = require("express");
const router = express.Router();
const { getOffers, createOffer, updateOffer, deleteOffer } = require("../controllers/offerController");
const { protect, admin } = require("../middleware/authMiddleware");

router.route("/").get(getOffers).post(protect, admin, createOffer);
router.route("/:id").put(protect, admin, updateOffer).delete(protect, admin, deleteOffer);

module.exports = router;
