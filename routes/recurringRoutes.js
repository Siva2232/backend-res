const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getRecurring, createRecurring, updateRecurring, deleteRecurring,
} = require("../controllers/recurringController");

router.use(protect);
router.route("/").get(getRecurring).post(admin, createRecurring);
router.route("/:id").put(admin, updateRecurring).delete(admin, deleteRecurring);

module.exports = router;
