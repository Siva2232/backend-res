const KitchenBill = require("../models/KitchenBill");

// @desc    Get all kitchen bills (for kitchen/waiter view)
// @route   GET /api/kitchen-bills
// @access  Private (Kitchen/Waiter/Admin)
const getKitchenBills = async (req, res) => {
  try {
    // Support optional query params: limit, status, table
    let query = KitchenBill.find({});
    
    // Filter by status if provided
    if (req.query.status) {
      const statuses = req.query.status.split(",");
      query = query.where("status").in(statuses);
    }
    
    // Filter by table if provided
    if (req.query.table) {
      query = query.where("table").equals(req.query.table);
    }
    
    // Sort by newest first
    query = query.sort({ createdAt: -1 });
    
    // Limit results if specified
    if (req.query.limit) {
      const limit = parseInt(req.query.limit, 10);
      if (!isNaN(limit)) query = query.limit(limit);
    }
    
    query = query.select("-__v -items.image -items.product -items.addedAt -items.isNewItem");
    const kitchenBills = await query.lean();
    res.json(kitchenBills);
  } catch (error) {
    console.error("Error fetching kitchen bills:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get kitchen bills for a specific order
// @route   GET /api/kitchen-bills/order/:orderId
// @access  Private
const getKitchenBillsByOrder = async (req, res) => {
  try {
    const kitchenBills = await KitchenBill.find({ orderRef: req.params.orderId })
      .sort({ batchNumber: 1 })
      .lean();
    res.json(kitchenBills);
  } catch (error) {
    console.error("Error fetching kitchen bills by order:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get kitchen bills for a specific table
// @route   GET /api/kitchen-bills/table/:tableNum
// @access  Private
const getKitchenBillsByTable = async (req, res) => {
  try {
    const kitchenBills = await KitchenBill.find({ 
      table: req.params.tableNum,
      status: { $ne: "Served" } // Only show non-served bills
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json(kitchenBills);
  } catch (error) {
    console.error("Error fetching kitchen bills by table:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update kitchen bill status
// @route   PUT /api/kitchen-bills/:id/status
// @access  Private (Kitchen/Admin)
const updateKitchenBillStatus = async (req, res) => {
  try {
    const kitchenBill = await KitchenBill.findById(req.params.id);
    
    if (!kitchenBill) {
      return res.status(404).json({ message: "Kitchen bill not found" });
    }
    
    kitchenBill.status = req.body.status || kitchenBill.status;
    const updatedKitchenBill = await kitchenBill.save();
    
    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("kitchenBillUpdated", updatedKitchenBill);
    }
    
    res.json(updatedKitchenBill);
  } catch (error) {
    console.error("Error updating kitchen bill status:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get active (non-served) kitchen bills
// @route   GET /api/kitchen-bills/active
// @access  Private
const getActiveKitchenBills = async (req, res) => {
  try {
    const kitchenBills = await KitchenBill.find({
      status: { $in: ["Pending", "New", "Preparing", "Ready"] }
    })
      .select("-__v -items.image -items.product -items.addedAt -items.isNewItem")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=5');
    res.json(kitchenBills);
  } catch (error) {
    console.error("Error fetching active kitchen bills:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getKitchenBills,
  getKitchenBillsByOrder,
  getKitchenBillsByTable,
  updateKitchenBillStatus,
  getActiveKitchenBills,
};
