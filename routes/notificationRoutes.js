const express = require('express');
const router = express.Router();
const NotificationModel = require('../models/Notification');
const { getModel } = require('../utils/getModel');

// @desc    Get all notifications
// @route   GET /api/notifications
// @access  Private/Admin
router.get('/', async (req, res) => {
  try {
    const Notification = await getModel("Notification", NotificationModel.schema, req.restaurantId);
    const notifications = await Notification.find({ status: 'Pending' }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a new notification (Waiter Call)
// @route   POST /api/notifications
// @access  Public
router.post('/', async (req, res) => {
  const { table, type, message } = req.body;

  try {
    const Notification = await getModel("Notification", NotificationModel.schema, req.restaurantId);
    const notification = new Notification({
      table,
      type,
      message,
    });

    const createdNotification = await notification.save();

    // Emit socket event if io is available
    const io = req.app.get('io');
    if (io) {
      io.to(req.restaurantId).emit('newNotification', createdNotification);
    }

    res.status(201).json(createdNotification);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Mark notification as completed
// @route   PUT /api/notifications/:id
// @access  Private/Admin
router.put('/:id', async (req, res) => {
  try {
    const Notification = await getModel("Notification", NotificationModel.schema, req.restaurantId);
    const notification = await Notification.findById(req.params.id);

    if (notification) {
      notification.status = 'Completed';
      const updatedNotification = await notification.save();
      
      const io = req.app.get('io');
      if (io) {
        io.to(req.restaurantId).emit('notificationUpdated', updatedNotification);
      }
      
      res.json(updatedNotification);
    } else {
      res.status(404).json({ message: 'Notification not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Clear all notifications
// @route   DELETE /api/notifications
// @access  Private/Admin
router.delete('/', async (req, res) => {
    try {
      const Notification = await getModel("Notification", NotificationModel.schema, req.restaurantId);
      await Notification.deleteMany({ status: 'Completed' });
      res.json({ message: 'Cleared completed notifications' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

module.exports = router;
