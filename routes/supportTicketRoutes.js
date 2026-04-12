const express = require("express");
const router = express.Router();
const {
  createTicket,
  getRestaurantTickets,
  getAllTickets,
  addMessageToTicket,
  updateTicketStatus,
  markTicketRead,
  markAllTicketsRead,
} = require("../controllers/supportTicketController");
const { protect, admin } = require("../middleware/authMiddleware");

// @route   POST /api/support-tickets
// @route   GET /api/support-tickets
// @access  Private (Restaurant Admin/User)
router.route("/")
  .post(protect, createTicket)
  .get(protect, admin, getRestaurantTickets);

// @route   GET /api/support-tickets/all
// @access  Private (SuperAdmin or Support)
router.get("/all", protect, (req, res, next) => {
    if (req.user.role === "superadmin" || req.user.role === "support") {
        next();
    } else {
        res.status(403).json({ message: "Not authorized as Support Team" });
    }
}, getAllTickets);

// @route   POST /api/support-tickets/:id/messages
// @access  Private (Owner/Admin or SuperAdmin)
router.post("/:id/messages", protect, addMessageToTicket);

// @route   PATCH /api/support-tickets/:id/read
// @access  Private (Restaurant Admin)
router.patch("/:id/read", protect, markTicketRead);

// @route   PATCH /api/support-tickets/read-all
// @access  Private (Restaurant Admin)
router.patch("/read-all", protect, markAllTicketsRead);

// @route   PUT /api/support-tickets/:id/status
// @access  Private (SuperAdmin or Support)
router.put("/:id/status", protect, (req, res, next) => {
    if (req.user.role === "superadmin" || req.user.role === "support") {
        next();
    } else {
        res.status(403).json({ message: "Not authorized as Support Team" });
    }
}, updateTicketStatus);

module.exports = router;
