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
  const isTakeawayOrder = tableNo === "TAKEAWAY";

  // ONLY MERGE if existingOrderId is provided and it is still ACTIVE
  let existingOrder = null;
  if (existingOrderId) {
    existingOrder = await Order.findOne({
      _id: existingOrderId,
      status: { $in: ["Pending", "New", "Preparing", "Ready"] },
    });
  }

  // automatic merge heuristics when no explicit id given
  // skip these extra queries when existingOrderId was provided (even if not found)
  if (!existingOrder && !existingOrderId) {
    // run customerName and table lookups in parallel to save time
    const mergeQueries = [];

    if (customerName && customerName.trim()) {
      mergeQueries.push(
        Order.findOne({
          customerName: customerName.trim(),
          status: { $in: ["Pending", "New", "Preparing", "Ready"] },
        }).sort({ createdAt: -1 })
      );
    } else {
      mergeQueries.push(Promise.resolve(null));
    }

    if (tableNo && tableNo !== "TAKEAWAY") {
      mergeQueries.push(
        Order.findOne({
          table: tableNo,
          status: { $in: ["Pending", "New", "Preparing", "Ready"] },
        }).sort({ createdAt: -1 })
      );
    } else {
      mergeQueries.push(Promise.resolve(null));
    }

    const [byName, byTable] = await Promise.all(mergeQueries);
    existingOrder = byName || byTable;
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
      selectedPortion: x.selectedPortion || undefined,
      selectedAddons: x.selectedAddons || [],
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
    
    // Reset bill request state when new items are added to an existing order
    existingOrder.isBillRequested = false;
    
    if (notes) existingOrder.notes = (existingOrder.notes ? existingOrder.notes + " | " : "") + notes;
    
    // Update customer info if provided and was missing
    if (customerName) existingOrder.customerName = customerName;
    if (customerAddress) existingOrder.customerAddress = customerAddress;
    if (deliveryTime) existingOrder.deliveryTime = deliveryTime;
    // Update hasTakeaway flag if provided (can upgrade dine-in to dine-in+takeaway)
    if (hasTakeaway) existingOrder.hasTakeaway = true;

    // Set isTakeawayOrder flag if it's a takeaway order
    if (isTakeawayOrder) existingOrder.isTakeawayOrder = true;

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

    // RESPOND IMMEDIATELY — don't make the client wait for bill/kitchen updates
    res.status(200).json(updatedOrder);

    // Fire-and-forget: update bill, create kitchen bill, emit socket events
    // These run in the background after the response is sent
    (async () => {
      try {
        const io = req.app.get("io");

        // Run bill update and kitchen bill creation in parallel
        const billUpdatePromise = (async () => {
          const bill = await Bill.findOne({ orderRef: updatedOrder._id });
          if (bill) {
            bill.items = updatedOrder.items;
            bill.totalAmount = updatedOrder.totalAmount;
            bill.billDetails = updatedOrder.billDetails;
            bill.customerName = updatedOrder.customerName;
            bill.customerAddress = updatedOrder.customerAddress;
            bill.deliveryTime = updatedOrder.deliveryTime;
            bill.hasTakeaway = updatedOrder.hasTakeaway;
            bill.isTakeawayOrder = updatedOrder.isTakeawayOrder;
            bill.tokenNumber = updatedOrder.tokenNumber;
            bill.notes = updatedOrder.notes;
            bill.paymentSessions = updatedOrder.paymentSessions;

            // Reset bill request state on the existing bill as well
            bill.isBillRequested = false;
            
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
            if (io) io.emit("billUpdated", bill);
          }
        })();

        const kitchenBillPromise = (async () => {
          const lastBatch = await KitchenBill.findOne({ orderRef: updatedOrder._id })
            .sort({ batchNumber: -1 })
            .select("batchNumber")
            .lean();
          const nextBatchNumber = lastBatch ? lastBatch.batchNumber + 1 : 2;
          
          const batchTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
          
          const kitchenBill = await KitchenBill.create({
            orderRef: updatedOrder._id,
            batchNumber: nextBatchNumber,
            table: updatedOrder.table,
            hasTakeaway: updatedOrder.hasTakeaway,
            isTakeawayOrder: updatedOrder.isTakeawayOrder,
            tokenNumber: updatedOrder.tokenNumber,
            customerName: updatedOrder.customerName,
            customerAddress: updatedOrder.customerAddress,
            deliveryTime: updatedOrder.deliveryTime,
            items: newItems,
            batchTotal: batchTotal,
            status: "Pending",
            notes: notes || "",
          });
          
          if (io && kitchenBill) io.emit("kitchenBillCreated", kitchenBill);
        })();

        await Promise.all([billUpdatePromise, kitchenBillPromise]);

        if (io) {
          io.emit("orderUpdated", updatedOrder);
          io.emit("orderItemsAdded", {
            order: updatedOrder,
            newItems: newItems,
            table: updatedOrder.table,
            addedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("Background bill/kitchen update error:", err);
      }
    })();

    return;
  }

  // If no existing active order, create a new one
  let tokenNumber;
  if (isTakeawayOrder) {
    // Generate a simple token number based on today's count or just random
    // For simplicity, let's use a 4 digit random number or sequence
    // A better way would be count orders for today + 1
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const count = await Order.countDocuments({
      isTakeawayOrder: true,
      createdAt: { $gte: today },
    });
    tokenNumber = count + 1;
  }

  const orderData = {
    items: orderItems.map((x) => ({
      ...x,
      product: x._id,
      _id: undefined,
      selectedPortion: x.selectedPortion || undefined,
      selectedAddons: x.selectedAddons || [],
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
    isTakeawayOrder: isTakeawayOrder,
    tokenNumber: tokenNumber,
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
      const authUser = await User.findById(decoded.id).select("_id isWaiter").lean();
      if (authUser && authUser.isWaiter) {
        orderData.waiter = authUser._id;
      }
    } catch (err) {
      // ignore invalid token
    }
  }

  const order = new Order(orderData);
  const createdOrder = await order.save();

  // Create bill and kitchen bill
  const batchTotal = createdOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const [newBill, kitchenBill] = await Promise.all([
    Bill.create({
      orderRef: createdOrder._id,
      table: createdOrder.table,
      hasTakeaway: createdOrder.hasTakeaway,
      isTakeawayOrder: createdOrder.isTakeawayOrder,
      tokenNumber: createdOrder.tokenNumber,
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
    }),
    KitchenBill.create({
      orderRef: createdOrder._id,
      batchNumber: 1,
      table: createdOrder.table,
      hasTakeaway: createdOrder.hasTakeaway,
      isTakeawayOrder: createdOrder.isTakeawayOrder,
      tokenNumber: createdOrder.tokenNumber,
      customerName: createdOrder.customerName,
      customerAddress: createdOrder.customerAddress,
      deliveryTime: createdOrder.deliveryTime,
      items: createdOrder.items,
      batchTotal: batchTotal,
      status: createdOrder.status,
      notes: createdOrder.notes,
    }),
  ]);

  // BROADCAST IMMEDIATELY
  const io = req.app.get("io");
  if (io) {
    if (newBill) io.emit("billCreated", newBill);
    if (createdOrder) io.emit("orderCreated", createdOrder);
    if (kitchenBill) io.emit("kitchenBillCreated", kitchenBill);
  }

  // RESPOND with created order
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

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const { status, isBillRequested } = req.body;
  
  if (status) order.status = status;
  if (isBillRequested !== undefined) order.isBillRequested = isBillRequested;
  
  const updatedOrder = await order.save();

  // Sync with bill state
  if (isBillRequested !== undefined) {
    await Bill.updateMany(
      { orderRef: order._id },
      { $set: { isBillRequested: isBillRequested } }
    );
  }

  // When an order is closed, also mark the related bills as Closed.
  // This ensures admin order list and customer summary remain consistent
  // after reload/polling.
  if (newStatus === "Closed") {
    try {
      const updated = await Bill.updateMany(
        { orderRef: order._id },
        { $set: { status: "Closed" } }
      );
      // emit billUpdated events for any changed bills
      if (updated.modifiedCount > 0) {
        const bills = await Bill.find({ orderRef: order._id });
        const io = req.app.get('io');
        if (io) {
          bills.forEach((bill) => io.emit('billUpdated', bill));
        }
      }
    } catch (billError) {
      console.error("Failed to update related bill status:", billError);
      // continue, not fatal for order status
    }
  }

  // emit update event so frontends can react immediately
  const io = req.app.get('io');
  if (io) {
    io.emit('orderUpdated', updatedOrder);
  }

  res.json(updatedOrder);
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  // enable client-side caching for 10 seconds to handle rapid re-rendering
  res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=5');

  try {
    let filter = {};
    if (req.query.status) {
      const statuses = req.query.status.split(",");
      filter.status = { $in: statuses };
    }

    // performance optimization: if we have "today" param, filter to current day
    if (req.query.today === "true") {
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      filter.createdAt = { $gte: startOfDay };
    }

    // default to 50 if no limit provided
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;

    // optimization: only fetch necessary fields for the order list
    const orders = await Order.find(filter)
      .select('table status totalAmount createdAt customerName hasTakeaway deliveryTime items.name items.qty items.price items.image isTakeawayOrder tokenNumber')
      .sort({ createdAt: -1 })
      .skip(skip > 0 ? skip : 0)
      .limit(limit > 200 ? 200 : limit)
      .lean();

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
  const orders = await Order.find({
    table: req.params.tableNum,
    status: { $in: ["Pending", "New", "Preparing", "Ready", "Served"] },
  })
    .select('-items.product -waiter -paymentId -__v')
    .sort({ createdAt: -1 })
    .limit(20)
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
