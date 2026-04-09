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
      console.warn(`[socketUtils] emitUpdate called without restaurantId for event "${event}"`);
    }
  }
};

module.exports = { emitUpdate };
