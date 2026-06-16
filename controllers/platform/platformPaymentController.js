const {
  getPlatformPaymentConfigAdmin,
  updatePlatformPaymentConfig,
  testPlatformPaymentConfig,
} = require("../../services/payment/platformPaymentService");
const Restaurant = require("../../models/Restaurant");

const getPlatformPaymentSettings = async (req, res) => {
  try {
    const config = await getPlatformPaymentConfigAdmin();
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updatePlatformPaymentSettings = async (req, res) => {
  try {
    const config = await updatePlatformPaymentConfig(req.body);
    res.json({ message: "Platform payment settings saved", config });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const testPlatformPaymentSettings = async (req, res) => {
  try {
    const result = await testPlatformPaymentConfig();
    res.json({ success: true, message: "Razorpay connection successful", orderId: result.orderId });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Connection test failed" });
  }
};

const getAllPaymentHistory = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({})
      .select("restaurantId name paymentHistory")
      .populate("paymentHistory.plan", "name price duration")
      .lean();

    const history = [];
    for (const r of restaurants) {
      for (const entry of r.paymentHistory || []) {
        history.push({
          restaurantId: r.restaurantId,
          restaurantName: r.name,
          amount: entry.amount,
          date: entry.date,
          method: entry.method,
          reference: entry.reference,
          planName: entry.planName || entry.plan?.name || "",
          razorpayOrderId: entry.razorpayOrderId || "",
          razorpayPaymentId: entry.razorpayPaymentId || entry.reference || "",
          planId: entry.plan?._id || entry.plan || null,
        });
      }
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalRevenue = history.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

    res.json({
      history,
      total: history.length,
      totalRevenue,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPlatformPaymentSettings,
  updatePlatformPaymentSettings,
  testPlatformPaymentSettings,
  getAllPaymentHistory,
};
