const Order = require("../models/Order");
const Bill = require("../models/Bill");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

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
    customerName,
    customerAddress,
    deliveryTime,
    existingOrderId, // New field to specifically target an order for merging
  } = req.body;

  if (orderItems && orderItems.length === 0) {
    res.status(400).json({ message: "No order items" });
    return;
  }

  const tableNo = table && table.trim() ? table : "TAKEAWAY";

  // ONLY MERGE if existingOrderId is provided and it is still ACTIVE
  let existingOrder = null;
  if (existingOrderId) {
    existingOrder = await Order.findOne({
      _id: existingOrderId,
      status: { $in: ["Pending", "Preparing", "Ready"] },
    });
  }

  if (existingOrder) {
    // Merge new items into existing order
    const newItems = orderItems.map((x) => ({
      ...x,
      product: x._id,
      _id: undefined,
    }));

    existingOrder.items = [...existingOrder.items, ...newItems];
    existingOrder.totalAmount += totalAmount;
    if (notes) existingOrder.notes = (existingOrder.notes ? existingOrder.notes + " | " : "") + notes;
    
    // Update customer info if provided and was missing
    if (customerName) existingOrder.customerName = customerName;
    if (customerAddress) existingOrder.customerAddress = customerAddress;
    if (deliveryTime) existingOrder.deliveryTime = deliveryTime;

    const updatedOrder = await existingOrder.save();

    // Update the corresponding bill
    const bill = await Bill.findOne({ orderRef: updatedOrder._id });
    if (bill) {
      bill.items = updatedOrder.items;
      bill.totalAmount = updatedOrder.totalAmount;
      bill.customerName = updatedOrder.customerName;
      bill.customerAddress = updatedOrder.customerAddress;
      bill.deliveryTime = updatedOrder.deliveryTime;
      bill.notes = updatedOrder.notes;
      await bill.save();
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("orderUpdated", updatedOrder);
      if (bill) io.emit("billUpdated", bill);
    }

    return res.status(200).json(updatedOrder);
  }

  // If no existing active order, create a new one
  const orderData = {
    items: orderItems.map((x) => ({
      ...x,
      product: x._id,
      _id: undefined,
    })),
    table: tableNo,
    totalAmount,
    notes,
    billDetails,
    paymentMethod,
    status: status || "Pending",
    customerName,
    customerAddress,
    deliveryTime,
  };

  // attach waiter from authenticated session if available
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const authUser = await User.findById(decoded.id);
      if (authUser && authUser.isWaiter) {
        orderData.waiter = authUser._id;
      }
    } catch (err) {
      // ignore invalid token
    }
  }

  const order = new Order(orderData);
  const createdOrder = await order.save();

  const io = req.app.get("io");
  if (io) {
    io.emit("orderCreated", createdOrder);
  }

  // Create initial bill
  try {
    const newBill = await Bill.create({
      orderRef: createdOrder._id,
      table: createdOrder.table,
      customerName: createdOrder.customerName,
      customerAddress: createdOrder.customerAddress,
      deliveryTime: createdOrder.deliveryTime,
      items: createdOrder.items,
      totalAmount: createdOrder.totalAmount,
      status: createdOrder.status,
      paymentMethod: createdOrder.paymentMethod,
      notes: createdOrder.notes,
      billDetails: createdOrder.billDetails,
      billedAt: createdOrder.createdAt,
    });
    if (io && newBill) {
      io.emit("billCreated", newBill);
    }
  } catch (err) {
    console.error("Failed to create bill:", err);
  }

  res.status(201).json(createdOrder);
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
  try {
    // allow an optional ?limit= parameter for pagination
    let query = Order.find({}).sort({ createdAt: -1 }).lean();
    if (req.query.limit) {
      const limit = parseInt(req.query.limit, 10);
      if (!isNaN(limit)) query = query.limit(limit);
    }
    const orders = await query;
    res.json(orders);
  } catch (error) {
    console.error("getOrders error", error);
    res.status(500).json({ message: "Server error getting orders" });
  }
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


// wrapper for administrative/manual creation that enforces authentication
// and allows additional validation if needed in future.
const addManualOrder = async (req, res) => {
  // ensure this route is only used by logged-in admins or waiters
  // (middleware applied on route)
  // we can reuse the addOrderItems logic directly as it already handles
  // splitting on existingOrderId and building the order/bill.
  return addOrderItems(req, res);
};

module.exports = {
  addOrderItems,
  addManualOrder,
  getOrderById,
  updateOrderStatus,
  getOrders,
  getTableOrders,
};
