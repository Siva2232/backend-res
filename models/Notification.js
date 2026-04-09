const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema(
  {
    table: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['WaiterCall', 'BillRequest', 'BillRequested', 'Other'],
      default: 'WaiterCall',
    },
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Completed'],
      default: 'Pending',
    },
    message: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);


const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
