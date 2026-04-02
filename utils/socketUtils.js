/**
 * Socket.io Real-time Utility for HR & Accounting
 * Emits events to all connected clients when data changes
 */
const emitUpdate = (req, event, data) => {
  const io = req.app.get('io');
  if (io) {
    io.emit(event, data);
    console.log(`[Socket] Emitted ${event}`);
  }
};

module.exports = { emitUpdate };
