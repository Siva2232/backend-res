const Order = require("../models/Order");
const Bill = require("../models/Bill");

// @desc    Create new order
// @route   POST /api/orders
// @access  Public
const addOrderItems = async (req, res) => {
  const {
    orderItems,
    table,
    totalAmount,
    notes,
    billDetails,
    paymentMethod,
    status,
  } = req.body;

  if (orderItems && orderItems.length === 0) {
    res.status(400).json({ message: "No order items" });
    return;
  } else {
    const order = new Order({
      items: orderItems.map((x) => ({
        ...x,
        product: x._id,
        _id: undefined,
      })),
      table,
      totalAmount,
      // optional fields
      notes,
      billDetails,
      paymentMethod,
      status: status || "Pending",
    });

    const createdOrder = await order.save();

    // notify any connected clients that a new order has arrived
    const io = req.app.get('io');
    if (io) {
      io.emit('orderCreated', createdOrder);
    }

    // also persist a copy as a bill for invoicing / audit purposes
    try {
      await Bill.create({
        orderRef: createdOrder._id,
        table: createdOrder.table,
        items: createdOrder.items,
        totalAmount: createdOrder.totalAmount,
        status: createdOrder.status,
        paymentMethod: createdOrder.paymentMethod,
        notes: createdOrder.notes,
        billDetails: createdOrder.billDetails,
        billedAt: createdOrder.createdAt,
      });
    } catch (err) {
      console.error("Failed to create bill:", err);
      // we don't fail the request if bill creation fails
    }

    res.status(201).json(createdOrder);
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Public
const getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.id).populate("items.product", "name price image");

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ message: "Order not found" });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.status = req.body.status || order.status;
    const updatedOrder = await order.save();

    // emit update event so frontends can react immediately
    const io = req.app.get('io');
    if (io) {
      io.emit('orderUpdated', updatedOrder);
    }

    res.json(updatedOrder);
  } else {
    res.status(404).json({ message: "Order not found" });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  // allow an optional ?limit= parameter for pagination
  let query = Order.find({}).sort({ createdAt: -1 }).lean();
  if (req.query.limit) {
    const limit = parseInt(req.query.limit, 10);
    if (!isNaN(limit)) query = query.limit(limit);
  }
  const orders = await query;
  res.json(orders);
};

// @desc    Get orders for a specific table
// @route   GET /api/orders/table/:tableNum
// @access  Public
const getTableOrders = async (req, res) => {
  const orders = await Order.find({ table: req.params.tableNum })
    .sort({ createdAt: -1 })
    .lean();
  res.json(orders);
};

module.exports = {
  addOrderItems,
  getOrderById,
  updateOrderStatus,
  getOrders,
  getTableOrders,
};
