const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "messages.senderModel",
      required: true,
    },
    senderModel: {
      type: String,
      required: true,
      enum: ["User", "SuperAdmin"],
    },
    text: { type: String, required: true },
    attachments: [{ type: String }],
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      enum: ["Technical Issue", "Billing Inquiry", "Feature Request", "Other"],
    },
    priority: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      required: true,
      enum: ["Open", "In Progress", "Resolved", "Closed"],
      default: "Open",
    },
    messages: [messageSchema],
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
