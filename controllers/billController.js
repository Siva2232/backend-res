const Bill = require("../models/Bill");

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
    const bill = new Bill({ orderRef, table, items, totalAmount, status, paymentMethod, notes, billDetails });
    const created = await bill.save();
    // emit socket so dashboard updates
    const io = req.app.get('io');
    if (io) io.emit('billCreated', created);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get bills (admin) – supports ?limit, ?today, ?from params
// @route   GET /api/bills
// @access  Private/Admin
const isNetworkTimeout = (err) =>
  err?.name === "MongoNetworkTimeoutError" ||
  err?.name === "MongoNetworkError" ||
  (err?.code === "ETIMEDOUT") ||
  (err?.errorLabels && err.errorLabels.includes("RetryableWriteError"));

const getBills = async (req, res) => {
  const runQuery = async () => {
    const filter = {};

    if (req.query.today === "true") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      filter.billedAt = { $gte: start };
    } else if (req.query.from) {
      const fromDate = new Date(req.query.from);
      filter.billedAt = { $gte: fromDate };
    }

    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

    return Bill.find(filter)
      .sort({ billedAt: -1 })
      .limit(limit)
      .select("-__v -paymentId -items.product -items.selectedAddons -items.addedAt -items.isNewItem")
      .lean();
  };

  try {
    let bills;
    try {
      bills = await runQuery();
    } catch (firstErr) {
      if (isNetworkTimeout(firstErr)) {
        // One automatic retry after a brief pause so the pool can recover
        console.warn("getBills: network timeout — retrying once...");
        await new Promise((r) => setTimeout(r, 2000));
        bills = await runQuery();
      } else {
        throw firstErr;
      }
    }
    res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=10");
    res.json(bills);
  } catch (error) {
    console.error("getBills error:", error);
    res.status(503).json({ message: "Database temporarily unavailable. Please try again in a moment." });
  }
};


// @desc    Mark bill as paid (cash collected)
// @route   PUT /api/bills/:id/pay
// @access  Private/Admin
const markBillPaid = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    // ensure we have a sessions array
    bill.paymentSessions = bill.paymentSessions || [];

    // compute unpaid cod amount from existing sessions (should include any
    // pending amounts created when order was updated)
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

    // if there were no existing cod sessions but the unpaid amount is still
    // positive (for example, original order was online and then coder added
    // items manually outside of the normal flow), push a new cod payment
    // representing the remaining unpaid sum.  Otherwise we just converted the
    // pending sessions above.
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

    // also sync corresponding order record
    const Order = require("../models/Order");
    const order = await Order.findById(bill.orderRef);
    if (order) {
      // mirror the bill's payment sessions/status onto the order so both stay
      // consistent; we no longer rely on a temporary paidSession variable
      order.paymentSessions = bill.paymentSessions;
      order.paymentStatus = bill.paymentStatus;
      await order.save();
      const io = req.app.get("io");
      if (io) io.emit("orderUpdated", order);
    }

    const io = req.app.get("io");
    if (io) io.emit("billUpdated", bill);
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
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    // A bill can only be closed if it's paid
    if (bill.paymentStatus !== "paid") {
      return res.status(400).json({ message: "Cannot close an unpaid bill" });
    }

    bill.status = "Closed";
    await bill.save();

    // Sync order
    const Order = require("../models/Order");
    const order = await Order.findById(bill.orderRef);
    if (order) {
      order.status = "Closed";
      await order.save();
      const io = req.app.get("io");
      if (io) io.emit("orderUpdated", order);
    }

    const io = req.app.get("io");
    if (io) io.emit("billUpdated", bill);
    res.json(bill);
  } catch (error) {
    console.error("closeBill error", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addBill, getBills, markBillPaid, closeBill };
