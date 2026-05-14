const mongoose = require("mongoose");
const OrderModel = require("../../../models/Order");
const BillModel = require("../../../models/Bill");
const KitchenBillModel = require("../../../models/KitchenBill");
const SettingsModel = require("../../../models/Settings");
const jwt = require("jsonwebtoken");
const User = require("../../../models/User");
const { getModel } = require("../../../utils/getModel");
const {
  GST_CGST_RATE,
  GST_SGST_RATE,
  GST_INCLUSIVE_MULTIPLIER,
} = require("../../../utils/gstRates");

// Per-request dynamic model helpers (now async — returns Promise<Model>)
const Order       = (req) => getModel("Order",       OrderModel.schema,       req.restaurantId);
const Bill        = (req) => getModel("Bill",        BillModel.schema,        req.restaurantId);
const KitchenBill = (req) => getModel("KitchenBill", KitchenBillModel.schema, req.restaurantId);
const Settings    = (req) => getModel("Settings",    SettingsModel.schema,    req.restaurantId);

// ── In-memory cache to avoid a DB hit on every token / stats request ──────────
let _cachedTokenResetAt = null; // updated when resetTokenCount is called
/** @type {Map<string, { data: object, expiry: number }>} keyed by restaurantId — never share stats across tenants */
const _statsCacheByRestaurant = new Map();

const statsCacheKey = (req) => String(req.restaurantId || "").toUpperCase();

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
    existingOrder = await (await Order(req)).findOne({
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
        (await Order(req)).findOne({
          customerName: customerName.trim(),
          status: { $in: ["Pending", "New", "Preparing", "Ready"] },
        }).sort({ createdAt: -1 })
      );
    } else {
      mergeQueries.push(Promise.resolve(null));
    }

    if (tableNo && tableNo !== "TAKEAWAY") {
      mergeQueries.push(
        (await Order(req)).findOne({
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
    const newCgst = newSubtotal * GST_CGST_RATE;
    const newSgst = newSubtotal * GST_SGST_RATE;
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
    const batchGrandTotal = currentBatchTotal * GST_INCLUSIVE_MULTIPLIER; // incl. GST on batch
    
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
          const bill = await (await Bill(req)).findOne({ orderRef: updatedOrder._id });
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
            if (io) io.to(req.restaurantId).emit("billUpdated", bill);
          }
        })();

        const kitchenBillPromise = (async () => {
          const lastBatch = await (await KitchenBill(req)).findOne({ orderRef: updatedOrder._id })
            .sort({ batchNumber: -1 })
            .select("batchNumber")
            .lean();
          const nextBatchNumber = lastBatch ? lastBatch.batchNumber + 1 : 2;
          
          const batchTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
          
          const kitchenBill = await (await KitchenBill(req)).create({
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
          
          if (io && kitchenBill) io.to(req.restaurantId).emit("kitchenBillCreated", kitchenBill);
        })();

        await Promise.all([billUpdatePromise, kitchenBillPromise]);

        if (io) {
          io.to(req.restaurantId).emit("orderUpdated", updatedOrder);
          io.to(req.restaurantId).emit("orderItemsAdded", {
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Respect manual reset: count only orders created after the last reset (or start of day)
    const resetSetting = await (await Settings(req)).findOne({ key: "tokenResetAt" }).lean();
    const resetAt = resetSetting ? new Date(resetSetting.value) : null;
    const since = (resetAt && resetAt > today) ? resetAt : today;
    const count = await (await Order(req)).countDocuments({
      isTakeawayOrder: true,
      createdAt: { $gte: since },
    });
    tokenNumber = count + 101; // start takeaway token sequence from 101
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
    // New POS / QR / manual tickets always enter the queue as "New" (ignore client status)
    status: "New",
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
      // Scope to the current restaurant to prevent cross-tenant waiter assignment
      const authUser = await User.findOne({
        _id: decoded.id,
        restaurantId: req.restaurantId,
      }).select("_id isWaiter").lean();
      if (authUser && authUser.isWaiter) {
        orderData.waiter = authUser._id;
      }
    } catch (err) {
      // ignore invalid token
    }
  }

  const order = new (await Order(req))(orderData);
  const createdOrder = await order.save();

  // BROADCAST ORDER IMMEDIATELY after save — don't wait for bill/kitchen creation
  // This removes the 3-5s delay caused by waiting for Bill + KitchenBill DB writes
  const io = req.app.get("io");
  if (io) {
    io.to(req.restaurantId).emit("orderCreated", createdOrder);
  }

  // RESPOND immediately so the client gets the token without waiting
  res.status(201).json(createdOrder);

  // Create bill and kitchen bill in the background (fire-and-forget)
  const batchTotal = createdOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  (async () => {
    try {
      const [newBill, kitchenBill] = await Promise.all([
    (await Bill(req)).create({
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
    (await KitchenBill(req)).create({
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

      if (io) {
        if (newBill) io.to(req.restaurantId).emit("billCreated", newBill);
        if (kitchenBill) io.to(req.restaurantId).emit("kitchenBillCreated", kitchenBill);
      }
    } catch (bgErr) {
      console.error("Background bill/kitchen creation error:", bgErr);
    }
  })();
};

// @desc    Get order by ID (public — customer status page; lean + narrow projection, no populate)
// @route   GET /api/orders/:id
// @access  Public
const getOrderById = async (req, res) => {
  const rawId = String(req.params.id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }

  res.set("Cache-Control", "private, max-age=4, stale-while-revalidate=15");

  try {
    const order = await (await Order(req))
      .findById(rawId)
      .select(
        "table status totalAmount createdAt updatedAt customerName hasTakeaway deliveryTime items.name items.qty items.price items.image items.isTakeaway isTakeawayOrder tokenNumber billDetails paymentStatus paymentMethod notes"
      )
      .lean();

    if (order) {
      return res.json(order);
    }
    return res.status(404).json({ message: "Order not found" });
  } catch (err) {
    console.error("getOrderById error:", err);
    return res.status(500).json({ message: "Server error loading order" });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  const order = await (await Order(req)).findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const { status, isBillRequested } = req.body;
  
  if (status) order.status = status;
  if (isBillRequested !== undefined) order.isBillRequested = isBillRequested;
  
  const updatedOrder = await order.save();

  // Sync with bill state
  if (isBillRequested !== undefined) {
    await (await Bill(req)).updateMany(
      { orderRef: order._id },
      { $set: { isBillRequested: isBillRequested } }
    );
  }

  // When an order is closed, also mark the related bills as Closed.
  // This ensures admin order list and customer summary remain consistent
  // after reload/polling.
  if (status === "Closed") {
    try {
      await (await Bill(req)).updateMany(
        { orderRef: order._id },
        { $set: { status: "Closed" } }
      );
      // emit billUpdated events for any changed bills
      const bills = await (await Bill(req)).find({ orderRef: order._id });
      const io = req.app.get('io');
      if (io) {
        bills.forEach((bill) => io.to(req.restaurantId).emit('billUpdated', bill));
      }
    } catch (billError) {
      console.error("Failed to update related bill status:", billError);
      // continue, not fatal for order status
    }
  }

  // emit update event so frontends can react immediately
  const io = req.app.get('io');
  if (io) {
    io.to(req.restaurantId).emit('orderUpdated', updatedOrder);
  }

  res.json(updatedOrder);
};

const resetTokenCount = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Close all currently active takeaway tokens so the board clears
    await (await Order(req)).updateMany(
      {
        isTakeawayOrder: true,
        status: { $in: ["Pending", "New", "Preparing", "Ready"] },
        createdAt: { $gte: today },
      },
      { $set: { status: "Closed" } }
    );

    // 2. Persist the reset timestamp — new tokens will count from now
    await (await Settings(req)).findOneAndUpdate(
      { key: "tokenResetAt" },
      { value: now.toISOString() },
      { upsert: true, new: true }
    );

    // Invalidate in-memory cache so getTokens picks up the new reset time
    _cachedTokenResetAt = now.toISOString();
    _statsCacheByRestaurant.delete(statsCacheKey(req)); // bust stats cache for this tenant

    // 3. Emit socket event so all connected frontends refresh instantly
    const io = req.app.get("io");
    if (io) io.to(req.restaurantId).emit("tokenReset", { resetAt: now.toISOString() });

    res.json({ message: "Token counter reset successfully", resetAt: now.toISOString() });
  } catch (error) {
    console.error("resetTokenCount error:", error);
    res.status(500).json({ message: "Failed to reset tokens" });
  }
};

// @desc    Get takeaway tokens for the token board
// @route   GET /api/orders/tokens
// @access  Private/Admin
const getTokens = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use in-memory cached resetAt to avoid Settings DB hit on every request
    // The cache is invalidated by resetTokenCount (same process)
    let since;
    if (_cachedTokenResetAt !== null) {
      const resetAt = new Date(_cachedTokenResetAt);
      since = (resetAt > today) ? resetAt : today;
    } else {
      // First cold call: fetch from DB and cache it
      const resetSetting = await (await Settings(req)).findOne({ key: "tokenResetAt" }).lean();
      _cachedTokenResetAt = resetSetting ? resetSetting.value : null;
      const resetAt = _cachedTokenResetAt ? new Date(_cachedTokenResetAt) : null;
      since = (resetAt && resetAt > today) ? resetAt : today;
    }

    const clampLimit = (n) => Math.min(15, Math.max(1, n));
    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isFinite(rawLimit) ? clampLimit(rawLimit) : null;
    const rawPage = req.query.page ? parseInt(req.query.page, 10) : null;
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const skip = limit ? (page - 1) * limit : 0;

    let query = (await Order(req)).find({
      isTakeawayOrder: true,
      tokenNumber: { $exists: true },
      createdAt: { $gte: since, $lt: new Date(today.getTime() + 86400000) },
      status: { $ne: "Cancelled" },
    })
      .select("table status totalAmount createdAt customerName items.name items.qty items.price items.image isTakeawayOrder tokenNumber")
      .sort({ tokenNumber: -1 });

    if (skip > 0) query = query.skip(skip);
    if (limit) query = query.limit(limit);

    const tokens = await query.lean();

    res.set('Cache-Control', 'private, max-age=8');
    res.json({ tokens, resetAt: since.toISOString() });
  } catch (error) {
    console.error("getTokens error:", error);
    res.status(500).json({ message: "Server error fetching tokens" });
  }
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
      const statuses = String(req.query.status)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) {
        filter.status = { $in: statuses };
      }
    }

    // performance optimization: if we have "today" param, filter to current day
    if (req.query.today === "true") {
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      filter.createdAt = { $gte: startOfDay };
    }

    // Pagination (optional). If a UI passes limit, clamp it to 1–15.
    const clampLimit = (n) => Math.min(15, Math.max(1, n));
    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isFinite(rawLimit) ? clampLimit(rawLimit) : 50;

    const rawPage = req.query.page ? parseInt(req.query.page, 10) : null;
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : null;
    const rawSkip = req.query.skip ? parseInt(req.query.skip, 10) : null;
    const skip = page ? (page - 1) * limit : (Number.isFinite(rawSkip) ? rawSkip : 0);

    // optimization: only fetch necessary fields for the order list
    const orders = await (await Order(req)).find(filter)
      .select('table status totalAmount createdAt customerName hasTakeaway deliveryTime items.name items.qty items.price items.image items.isTakeaway isTakeawayOrder tokenNumber')
      .sort({ createdAt: -1 })
      .skip(skip > 0 ? skip : 0)
      .limit(limit)
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
  const orders = await (await Order(req)).find({
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

// @desc    Get aggregated dashboard stats (today count + revenue + best sellers) in one shot
// @route   GET /api/orders/stats
// @access  Private/Admin
const getOrderStats = async (req, res) => {
  try {
    const now = Date.now();

    const cacheKey = statsCacheKey(req);
    const cached = _statsCacheByRestaurant.get(cacheKey);
    // Serve from in-memory cache if fresh (30s TTL for low DB pressure)
    if (cached && now < cached.expiry) {
      res.set('Cache-Control', 'private, max-age=30');
      return res.json(cached.data);
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Run today-count and all-time revenue+sellers in parallel
    const [todayCount, revenueAgg] = await Promise.all([
      (await Order(req)).countDocuments({ createdAt: { $gte: startOfDay } }),
      (await Order(req)).aggregate([
        { $match: { status: { $in: ["Paid", "Closed"] } } },
        {
          $addFields: {
            // Per order: prefer bill grand total when set & positive; else POS totalAmount (matches dashboard reality)
            _orderGross: {
              $cond: [
                { $gt: [{ $ifNull: ["$billDetails.grandTotal", 0] }, 0] },
                "$billDetails.grandTotal",
                { $ifNull: ["$totalAmount", 0] },
              ],
            },
          },
        },
        { $group: { _id: null, totalRevenue: { $sum: "$_orderGross" } } },
      ]),
    ]);

    // Best sellers: unwind items → group by name → sort
    const sellersAgg = await (await Order(req)).aggregate([
      { $match: { status: { $in: ["Paid", "Closed"] } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", qty: { $sum: "$items.qty" } } },
      { $sort: { qty: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: "$_id", qty: 1 } },
    ]);

    const revRow = revenueAgg[0] || {};
    const totalRevenue = Number(revRow.totalRevenue) || 0;

    const stats = { todayCount, totalRevenue, bestSellers: sellersAgg };

    // Store in memory cache for 30s (scoped to this restaurant)
    _statsCacheByRestaurant.set(cacheKey, { data: stats, expiry: now + 30000 });

    res.set('Cache-Control', 'private, max-age=30');
    res.json(stats);
  } catch (error) {
    console.error("getOrderStats error:", error);
    res.status(500).json({ message: "Server error fetching stats" });
  }
};

module.exports = {
  addOrderItems,
  addManualOrder,
  getOrderById,
  updateOrderStatus,
  getOrders,
  getTableOrders,
  resetTokenCount,
  getTokens,
  getOrderStats,
};
