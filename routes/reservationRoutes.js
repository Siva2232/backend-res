const express = require('express');
const router = express.Router();
const ReservationModel = require('../models/Reservation');
const { getModel } = require('../utils/getModel');

// @desc    Get all reservations
// @route   GET /api/reservations
// @access  Private/Staff
router.get('/', async (req, res) => {
  try {
    const Reservation = await getModel("Reservation", ReservationModel.schema, req.restaurantId);
    const { date, status } = req.query;
    let query = {};
    
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.reservationTime = { $gte: start, $lte: end };
    }
    
    if (status) {
      query.status = status;
    }

    const reservations = await Reservation.find(query).sort({ reservationTime: 1 });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a new reservation
// @route   POST /api/reservations
// @access  Public (or Private)
router.post('/', async (req, res) => {
  const { table, customerName, customerPhone, guests, reservationTime, notes } = req.body;

  try {
    const Reservation = await getModel("Reservation", ReservationModel.schema, req.restaurantId);
    const reservation = new Reservation({
      table,
      customerName,
      customerPhone,
      guests,
      reservationTime,
      notes,
    });

    const createdReservation = await reservation.save();

    // Emit socket event if io is available
    const io = req.app.get('io');
    if (io) {
      io.to(req.restaurantId).emit('newReservation', createdReservation);
    }

    res.status(201).json(createdReservation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update reservation status or details
// @route   PUT /api/reservations/:id
// @access  Private/Staff
router.put('/:id', async (req, res) => {
  try {
    const Reservation = await getModel("Reservation", ReservationModel.schema, req.restaurantId);
    const reservation = await Reservation.findById(req.params.id);

    if (reservation) {
      reservation.status = req.body.status || reservation.status;
      reservation.table = req.body.table || reservation.table;
      reservation.guests = req.body.guests || reservation.guests;
      reservation.reservationTime = req.body.reservationTime || reservation.reservationTime;
      reservation.notes = req.body.notes || reservation.notes;

      const updatedReservation = await reservation.save();
      
      const io = req.app.get('io');
      if (io) {
        io.to(req.restaurantId).emit('reservationUpdated', updatedReservation);
      }
      
      res.json(updatedReservation);
    } else {
      res.status(404).json({ message: 'Reservation not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete/Cancel a reservation
// @route   DELETE /api/reservations/:id
// @access  Private/Staff
router.delete('/:id', async (req, res) => {
  try {
    const Reservation = await getModel("Reservation", ReservationModel.schema, req.restaurantId);
    const reservation = await Reservation.findById(req.params.id);
    if (reservation) {
      await reservation.deleteOne();
      
      const io = req.app.get('io');
      if (io) {
        io.to(req.restaurantId).emit('reservationDeleted', req.params.id);
      }
      
      res.json({ message: 'Reservation removed' });
    } else {
      res.status(404).json({ message: 'Reservation not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
