const mongoose = require('mongoose');

const reservationSchema = mongoose.Schema(
  {
    table: {
      type: Number,
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    guests: {
      type: Number,
      required: true,
      default: 1,
    },
    reservationTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Confirmed', 'Seated', 'Cancelled', 'Completed'],
      default: 'Pending',
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Reservation = mongoose.model('Reservation', reservationSchema);

module.exports = Reservation;
