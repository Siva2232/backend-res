/**
 * Socket.io Real-time Utility for HR & Accounting
 * Emits events scoped to the restaurant room.
 */
const emitUpdate = (req, event, data) => {
  const io = req.app.get('io');
  if (io) {
    const room = req.restaurantId;
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }
};

module.exports = { emitUpdate };
