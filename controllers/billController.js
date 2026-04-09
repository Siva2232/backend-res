const BillModel = require("../models/Bill");
const OrderModel = require("../models/Order");
const { getModel } = require("../utils/getModel");

// Per-request dynamic model helpers (async — returns Promise<Model>)
const Bill  = (req) => getModel("Bill",  BillModel.schema,  req.restaurantId);
const Order = (req) => getModel("Order", OrderModel.schema, req.restaurantId);

// @desc    Create new bill
// @route   POST /api/bills
// @access  Public (we rely on backend to auto-create, but endpoint exists)
const addBill = async (req, res) => {
  try {
    const { orderRef, table, items, totalAmount, status, paymentMethod, notes, billDetails } = req.body;
    if (!orderRef) {
      res.status(400).json({ message: "Missing order reference" });
      return;
    }
    const BillM = await Bill(req);
    const bill = new BillM({ orderRef, table, items, totalAmount, status, paymentMethod, notes, billDetails });
    const created = await bill.save();
    const io = req.app.get('io');
    if (io) io.to(req.restaurantId).emit('billCreated', created);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get bills (admin) – supports ?limit, ?today, ?from params
// @route   GET /api/bills
// @access  Private/Admin
const getBills = async (req, res) => {
  try {
    const filter = {};

    if (req.query.today === "true") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      filter.billedAt = { $gte: start };
    } else if (req.query.from) {
      const fromDate = new Date(req.query.from);
      filter.billedAt = { $gte: fromDate };
    }

    const limit = Math.min(parseInt(req.query.limit) || 40, 100);

    const query = { ...filter };
    if (!req.query.today && !req.query.from) {
      query.$or = [
        { status: { $ne: "Closed" } }, 
        { billedAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } }
      ];
    }

    const bills = await (await Bill(req)).find(query)
      .sort({ billedAt: -1, _id: -1 })
      .limit(limit)
      .select("-__v -paymentId -items.product -items.addedAt -items.isNewItem -items.image")
      .lean();

    res.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
    res.json(bills);
  } catch (error) {
    console.error("getBills error:", error);
    res.status(500).json({ message: error.message });
  }
};


// @desc    Mark bill as paid (cash collected)
// @route   PUT /api/bills/:id/pay
// @access  Private/Admin
const markBillPaid = async (req, res) => {
  try {
    const bill = await (await Bill(req)).findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    bill.paymentSessions = bill.paymentSessions || [];

    let unpaidCodAmount = 0;
    bill.paymentSessions = bill.paymentSessions.map((s) => {
      if (
        s.method === "cod" &&
        !["paid", "succeeded", "success"].includes(
          (s.status || "").toLowerCase()
        )
      ) {
        unpaidCodAmount += s.amount || 0;
        return { ...s, status: "paid" };
      }
      return s;
    });

    if (unpaidCodAmount <= 0) {
      unpaidCodAmount = (bill.totalAmount || 0) -
        (bill.paymentSessions
          .filter(s => ['paid','succeeded','success'].includes((s.status||'').toLowerCase()))
          .reduce((acc,s)=>acc + (s.amount || 0), 0));
      if (unpaidCodAmount > 0) {
        bill.paymentSessions.push({ method: "cod", status: "paid", amount: unpaidCodAmount });
      }
    }

    bill.paymentStatus = "paid";
    await bill.save();

    const order = await (await Order(req)).findById(bill.orderRef);
    if (order) {
      order.paymentSessions = bill.paymentSessions;
      order.paymentStatus = bill.paymentStatus;
      if (order.status !== "Closed") order.status = "Paid";
      await order.save();
      const io = req.app.get("io");
      if (io) {
        io.to(req.restaurantId).emit("orderUpdated", order);
        io.to(`table-${order.table}`).emit("orderUpdated", order);
      }
    }

    const io = req.app.get("io");
    if (io) io.to(req.restaurantId).emit("billUpdated", bill);
    res.json(bill);
  } catch (error) {
    console.error("markBillPaid error", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Close bill/order
// @route   PUT /api/bills/:id/close
// @access  Private/Admin
const closeBill = async (req, res) => {
  try {
    const bill = await (await Bill(req)).findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (bill.status === "Closed") return res.json(bill);

    if (bill.paymentStatus !== "paid") {
      return res.status(400).json({ message: "Cannot close an unpaid bill" });
    }

    bill.status = "Closed";
    if (bill.paymentSessions && bill.paymentSessions.length > 0) {
      bill.paymentSessions = bill.paymentSessions.map(s => ({ ...s, status: 'paid' }));
    }
    await bill.save();

    const order = await (await Order(req)).findById(bill.orderRef);
    if (order) {
      order.status = "Closed";
      order.paymentStatus = "paid";
      if (order.paymentSessions && order.paymentSessions.length > 0) {
        order.paymentSessions = order.paymentSessions.map(s => ({ ...s, status: 'paid' }));
      }
      await order.save();
      const io = req.app.get("io");
      if (io) {
        io.to(req.restaurantId).emit("orderUpdated", order);
        io.to(`table-${order.table}`).emit("orderUpdated", order);
      }
    }

    const io = req.app.get("io");
    if (io) io.to(req.restaurantId).emit("billUpdated", bill);
    res.json(bill);
  } catch (error) {
    console.error("closeBill error", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addBill, getBills, markBillPaid, closeBill };
