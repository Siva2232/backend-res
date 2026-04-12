const SANotif = require("../models/SuperAdminNotification");
const User = require("../models/User");

// Helper to format a SANotif doc as a ticket object for the frontend
const toTicket = (doc) => {
  const m = doc.meta || {};
  return {
    _id: doc._id,
    restaurantId: doc.restaurantId,
    restaurantName: doc.restaurantName,
    userId: m.userId || null,
    subject: m.subject || doc.title,
    priority: m.priority || "Medium",
    status: m.status || "Open",
    isRead: doc.isRead || false,
    messages: m.messages || [],
    lastMessageAt: m.lastMessageAt || doc.updatedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

// @desc    Create a new support ticket
// @route   POST /api/support-tickets
// @access  Private (Restaurant Owners/Admin)
const createTicket = async (req, res) => {
  try {
    const { subject, priority, message } = req.body;
    const userId = req.user._id;
    const restaurantId = req.user.restaurantId;

    if (!subject || !message) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const messages = [{
      sender: userId,
      senderModel: "User",
      senderName: req.user.name || "Customer",
      text: message,
      createdAt: new Date(),
    }];

    const ticket = await SANotif.create({
      type: "support_ticket",
      title: `[Ticket] ${subject}`,
      message: message.slice(0, 200),
      restaurantId,
      restaurantName: restaurantId,
      isRead: true,
      meta: {
        userId,
        subject,
        priority: priority || "Medium",
        status: "Open",
        messages,
        lastMessageAt: new Date(),
      },
    });

    res.status(201).json(toTicket(ticket));
  } catch (error) {
    console.error("[createTicket]", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all tickets for a specific restaurant
// @route   GET /api/support-tickets
// @access  Private (Restaurant Admin)
const getRestaurantTickets = async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId;
    const tickets = await SANotif.find({ type: "support_ticket", restaurantId })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(tickets.map(toTicket));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all support tickets (for Super Admin / Support Team)
// @route   GET /api/support-tickets/all
// @access  Private (SuperAdmin)
const getAllTickets = async (req, res) => {
  try {
    const tickets = await SANotif.find({ type: "support_ticket" })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(tickets.map(toTicket));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a message to a ticket
// @route   POST /api/support-tickets/:id/messages
// @access  Private (Owner/Admin or SuperAdmin)
const addMessageToTicket = async (req, res) => {
  try {
    const { text } = req.body;
    const ticketDoc = await SANotif.findOne({ _id: req.params.id, type: "support_ticket" });

    if (!ticketDoc) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const isSuperAdmin = req.user.role === "superadmin";
    const isSupport = req.user.role === "support";
    const isTicketOwner = ticketDoc.restaurantId === req.user.restaurantId;

    if (!isSuperAdmin && !isSupport && !isTicketOwner) {
      return res.status(403).json({ message: "Not authorized to reply to this ticket" });
    }

    const meta = ticketDoc.meta || {};
    const messages = meta.messages || [];

    messages.push({
      sender: req.user._id,
      senderModel: isSuperAdmin || isSupport ? "SuperAdmin" : "User",
      senderName: req.user.name || (isSuperAdmin || isSupport ? "Support Team" : "Customer"),
      text,
      createdAt: new Date(),
    });

    let newStatus = meta.status;
    if ((isSuperAdmin || isSupport) && meta.status === "Open") newStatus = "In Progress";

    ticketDoc.meta = {
      ...meta,
      messages,
      status: newStatus,
      lastMessageAt: new Date(),
    };
    ticketDoc.isRead = isSuperAdmin || isSupport ? false : true;
    ticketDoc.markModified("meta");
    await ticketDoc.save();

    res.status(201).json(toTicket(ticketDoc));
  } catch (error) {
    console.error("[addMessageToTicket]", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update ticket status
// @route   PUT /api/support-tickets/:id/status
// @access  Private (SuperAdmin)
const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ticketDoc = await SANotif.findOne({ _id: req.params.id, type: "support_ticket" });

    if (!ticketDoc) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const previousStatus = ticketDoc.meta?.status;
    ticketDoc.meta = { ...(ticketDoc.meta || {}), status };
    ticketDoc.markModified("meta");
    await ticketDoc.save();

    if (previousStatus !== status && status === "Closed") {
      await SANotif.create({
        type: "support_ticket",
        title: `Support Ticket Closed: ${ticketDoc.meta?.subject || ticketDoc.title}`,
        message: `Support ticket from ${ticketDoc.restaurantId} has been closed.`,
        restaurantId: ticketDoc.restaurantId,
        restaurantName: ticketDoc.restaurantName,
        isRead: false,
        meta: {
          ticketId: ticketDoc._id,
          subject: ticketDoc.meta?.subject,
          status,
          closedBy: req.user.name || req.user.role || "Support Team",
        },
      });
    }

    res.json(toTicket(ticketDoc));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const markTicketRead = async (req, res) => {
  try {
    const ticketDoc = await SANotif.findOne({ _id: req.params.id, type: "support_ticket" });
    if (!ticketDoc) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticketDoc.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ message: "Not authorized to mark this ticket read" });
    }

    ticketDoc.isRead = true;
    await ticketDoc.save();
    res.json({ message: "Ticket marked as read" });
  } catch (error) {
    console.error("[markTicketRead]", error);
    res.status(500).json({ message: error.message });
  }
};

const markAllTicketsRead = async (req, res) => {
  try {
    const isSupportAgent = req.user.role === "superadmin" || req.user.role === "support";
    
    if (isSupportAgent) {
      // For support agents, "isRead: false" means a customer replied. Mark all those as read.
      await SANotif.updateMany(
        { type: "support_ticket", isRead: false },
        { isRead: true }
      );
    } else {
      // For restaurant owners, "isRead: false" means support replied. Mark all those for THIS restaurant as read.
      await SANotif.updateMany(
        { type: "support_ticket", restaurantId: req.user.restaurantId, isRead: false },
        { isRead: true }
      );
    }
    res.json({ message: "All support tickets marked as read" });
  } catch (error) {
    console.error("[markAllTicketsRead]", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createTicket,
  getRestaurantTickets,
  getAllTickets,
  addMessageToTicket,
  updateTicketStatus,
  markTicketRead,
  markAllTicketsRead,
};
