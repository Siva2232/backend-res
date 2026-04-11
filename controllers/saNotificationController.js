const SuperAdminNotification = require("../models/SuperAdminNotification");

// GET /api/sa-notifications — all notifications, newest first
const getNotifications = async (req, res) => {
  try {
    const notifications = await SuperAdminNotification.find({})
      .sort({ createdAt: -1 })
      .limit(100);
    const unreadCount = await SuperAdminNotification.countDocuments({ isRead: false });
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/sa-notifications/:id/read — mark single notification read
const markRead = async (req, res) => {
  try {
    await SuperAdminNotification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/sa-notifications/read-all — mark all as read
const markAllRead = async (req, res) => {
  try {
    await SuperAdminNotification.updateMany({ isRead: false }, { isRead: true });
    res.json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/sa-notifications/:id — delete one
const deleteNotification = async (req, res) => {
  try {
    await SuperAdminNotification.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getNotifications, markRead, markAllRead, deleteNotification };
