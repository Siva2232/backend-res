const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { superAdminOnly } = require("../middleware/featureMiddleware");
const {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
} = require("../controllers/saNotificationController");

router.get("/",              protect, superAdminOnly, getNotifications);
router.patch("/read-all",    protect, superAdminOnly, markAllRead);
router.patch("/:id/read",   protect, superAdminOnly, markRead);
router.delete("/:id",        protect, superAdminOnly, deleteNotification);

module.exports = router;
