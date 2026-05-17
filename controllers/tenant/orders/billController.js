const BillModel = require("../../../models/Bill");
const OrderModel = require("../../../models/Order");
const { getModel } = require("../../../utils/getModel");

// Per-request dynamic model helpers (async — returns Promise<Model>)
const Bill  = (req) => getModel("Bill",  BillModel.schema,  req.restaurantId);
const Order = (req) => getModel("Order", OrderModel.schema, req.restaurantId);

const sessionRootFromBill = (bill) =>
  String(bill.sessionRef || bill.orderRef || "");

async function applyToSessionOrders(req, bill, patch) {
  const root = sessionRootFromBill(bill);
  if (!root) return [];
  const OrderM = await Order(req);
  return OrderM.updateMany(
    {
      $or: [{ _id: root }, { sessionRef: root }],
      status: { $ne: "Closed" },
    },
    { $set: patch }
  );
}

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

    const clampLimit = (n) => Math.min(15, Math.max(1, n));
    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isFinite(rawLimit) ? clampLimit(rawLimit) : 40;

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

    const root = sessionRootFromBill(bill);
    await applyToSessionOrders(req, bill, {
      paymentSessions: bill.paymentSessions,
      paymentStatus: bill.paymentStatus,
      status: "Paid",
    });

    const OrderM = await Order(req);
    const sessionOrders = await OrderM.find({
      $or: [{ _id: root }, { sessionRef: root }],
    });

    const io = req.app.get("io");
    if (io) {
      io.to(req.restaurantId).emit("billUpdated", bill);
      for (const orderDoc of sessionOrders) {
        io.to(req.restaurantId).emit("orderUpdated", orderDoc);
        if (orderDoc.table) {
          io.to(`table-${orderDoc.table}`).emit("orderUpdated", orderDoc);
        }
      }
    }

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

    const root = sessionRootFromBill(bill);
    const paidSessions =
      bill.paymentSessions?.map((s) => ({ ...s, status: "paid" })) || [];
    await applyToSessionOrders(req, bill, {
      status: "Closed",
      paymentStatus: "paid",
      paymentSessions: paidSessions,
    });

    const OrderM = await Order(req);
    const sessionOrders = await OrderM.find({
      $or: [{ _id: root }, { sessionRef: root }],
    });

    const io = req.app.get("io");
    if (io) {
      io.to(req.restaurantId).emit("billUpdated", bill);
      for (const order of sessionOrders) {
        io.to(req.restaurantId).emit("orderUpdated", order);
        if (order.table) {
          io.to(`table-${order.table}`).emit("orderUpdated", order);
        }
      }
    }
    res.json(bill);
  } catch (error) {
    console.error("closeBill error", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addBill, getBills, markBillPaid, closeBill };
