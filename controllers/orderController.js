const Order = require("../models/Order");
const Bill = require("../models/Bill");
const KitchenBill = require("../models/KitchenBill");
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
    paymentStatus,
    paymentId,
    status,
    customerName,
    customerAddress,
    deliveryTime,
    existingOrderId, // New field to specifically target an order for merging
    hasTakeaway, // Flag indicating dine-in order also has takeaway items
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

  // automatic merge heuristics when no explicit id given
  if (!existingOrder) {
    // if customer provided, try by name first (useful for takeaways)
    if (customerName && customerName.trim()) {
      existingOrder = await Order.findOne({
        customerName: customerName.trim(),
        status: { $in: ["Pending", "Preparing", "Ready"] },
      }).sort({ createdAt: -1 }); // Get the latest active order for this name
    }
    
    // if still no match and a specific table (non-takeaway) is given,
    // merge into that table's active order
    if (!existingOrder && tableNo && tableNo !== "TAKEAWAY") {
      existingOrder = await Order.findOne({
        table: tableNo,
        status: { $in: ["Pending", "Preparing", "Ready"] },
      }).sort({ createdAt: -1 });
    }
  }

  if (existingOrder) {
    // Merge new items into existing order - mark them with addedAt timestamp
    const addedAt = new Date().toISOString();
    const newItems = orderItems.map((x) => ({
      ...x,
      product: x._id,
      _id: undefined,
      addedAt: addedAt, // Mark as newly added for kitchen visibility
      isNewItem: true,
    }));

    existingOrder.items = [...existingOrder.items, ...newItems];
    
    // Recalculate totals from all items (existing + new)
    const newSubtotal = existingOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const newCgst = newSubtotal * 0.025;
    const newSgst = newSubtotal * 0.025;
    const newGrandTotal = newSubtotal + newCgst + newSgst;
    
    existingOrder.totalAmount = newGrandTotal;
    existingOrder.billDetails = {
      subtotal: newSubtotal,
      cgst: newCgst,
      sgst: newSgst,
      grandTotal: newGrandTotal,
    };
    
    if (notes) existingOrder.notes = (existingOrder.notes ? existingOrder.notes + " | " : "") + notes;
    
    // Update customer info if provided and was missing
    if (customerName) existingOrder.customerName = customerName;
    if (customerAddress) existingOrder.customerAddress = customerAddress;
    if (deliveryTime) existingOrder.deliveryTime = deliveryTime;
    // Update hasTakeaway flag if provided (can upgrade dine-in to dine-in+takeaway)
    if (hasTakeaway) existingOrder.hasTakeaway = true;

    // Track payment session for this specific batch
    const currentBatchTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const batchGrandTotal = currentBatchTotal * 1.05; // Incl 5% GST for this batch
    
    if (!existingOrder.paymentSessions) existingOrder.paymentSessions = [];
    
    // Normalize status (ensure "paid" instead of "Paid" or "PAID" etc)
    const normalizedStatus = (paymentStatus || "pending").toLowerCase();
    
    existingOrder.paymentSessions.push({
      method: paymentMethod || "cod",
      status: normalizedStatus,
      amount: batchGrandTotal,
      id: paymentId || null,
      addedAt: new Date()
    });

    const updatedOrder = await existingOrder.save();

    // Update the corresponding bill with recalculated totals
    const bill = await Bill.findOne({ orderRef: updatedOrder._id });
    if (bill) {
      bill.items = updatedOrder.items;
      bill.totalAmount = updatedOrder.totalAmount;
      bill.billDetails = updatedOrder.billDetails;
      bill.customerName = updatedOrder.customerName;
      bill.customerAddress = updatedOrder.customerAddress;
      bill.deliveryTime = updatedOrder.deliveryTime;
      bill.hasTakeaway = updatedOrder.hasTakeaway;
      bill.notes = updatedOrder.notes;
      bill.paymentSessions = updatedOrder.paymentSessions;
      
      // Overall payment status logic for the whole bill
      const allPaid = bill.paymentSessions.every(s => s.status === "paid");
      const anyPaid = bill.paymentSessions.some(s => s.status === "paid");
      
      if (allPaid) {
        bill.paymentStatus = "paid";
      } else if (anyPaid) {
        bill.paymentStatus = "partially_paid";
      } else {
        bill.paymentStatus = "pending";
      }
      
      await bill.save();
    }

    // Create a NEW KitchenBill for this batch of items (separate ticket for kitchen/waiter)
    try {
      // Find the highest existing batch number for this order
      const existingKitchenBills = await KitchenBill.find({ orderRef: updatedOrder._id }).sort({ batchNumber: -1 });
      const nextBatchNumber = existingKitchenBills.length > 0 ? existingKitchenBills[0].batchNumber + 1 : 2;
      
      // Calculate batch total for just the new items
      const batchTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
      
      const kitchenBill = await KitchenBill.create({
        orderRef: updatedOrder._id,
        batchNumber: nextBatchNumber,
        table: updatedOrder.table,
        hasTakeaway: updatedOrder.hasTakeaway,
        customerName: updatedOrder.customerName,
        customerAddress: updatedOrder.customerAddress,
        deliveryTime: updatedOrder.deliveryTime,
        items: newItems,
        batchTotal: batchTotal,
        status: "Pending",
        notes: notes || "",
      });
      
      const io = req.app.get("io");
      if (io && kitchenBill) {
        io.emit("kitchenBillCreated", kitchenBill);
      }
    } catch (err) {
      console.error("Failed to create kitchen bill for added items:", err);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("orderUpdated", updatedOrder);
      if (bill) io.emit("billUpdated", bill);
      // Emit special event for "Add More Items" notification in admin panel
      io.emit("orderItemsAdded", {
        order: updatedOrder,
        newItems: newItems,
        table: updatedOrder.table,
        addedAt: new Date().toISOString(),
      });
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
    paymentMethod: paymentMethod || "cod",
    paymentStatus: paymentStatus || "pending",
    paymentId: paymentId || null,
    status: status || "Pending",
    customerName,
    customerAddress,
    deliveryTime,
    hasTakeaway: hasTakeaway || false, // Include takeaway flag for dine-in orders
    paymentSessions: [
      {
        method: paymentMethod || "cod",
        status: (paymentStatus || "pending").toLowerCase(),
        amount: totalAmount,
        id: paymentId || null,
        addedAt: new Date(),
      },
    ],
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
      hasTakeaway: createdOrder.hasTakeaway, // Include takeaway flag in bill
      customerName: createdOrder.customerName,
      customerAddress: createdOrder.customerAddress,
      deliveryTime: createdOrder.deliveryTime,
      items: createdOrder.items,
      totalAmount: createdOrder.totalAmount,
      status: createdOrder.status,
      paymentMethod: createdOrder.paymentMethod,
      paymentStatus: createdOrder.paymentStatus,
      paymentId: createdOrder.paymentId,
      paymentSessions: createdOrder.paymentSessions,
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

  // Create initial KitchenBill (batch 1) for kitchen/waiter view
  try {
    const batchTotal = createdOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const kitchenBill = await KitchenBill.create({
      orderRef: createdOrder._id,
      batchNumber: 1,
      table: createdOrder.table,
      hasTakeaway: createdOrder.hasTakeaway,
      customerName: createdOrder.customerName,
      customerAddress: createdOrder.customerAddress,
      deliveryTime: createdOrder.deliveryTime,
      items: createdOrder.items,
      batchTotal: batchTotal,
      status: createdOrder.status,
      notes: createdOrder.notes,
    });
    if (io && kitchenBill) {
      io.emit("kitchenBillCreated", kitchenBill);
    }
  } catch (err) {
    console.error("Failed to create kitchen bill:", err);
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
