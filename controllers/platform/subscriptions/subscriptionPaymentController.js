const SubscriptionPlan = require("../../../models/SubscriptionPlan");
const Restaurant = require("../../../models/Restaurant");
const {
  createOrder,
  verifyPaymentSignature,
} = require("../../../services/payment/razorpayService");
const {
  getPlatformRazorpay,
  getPlatformKeyId,
  resolvePlatformCredentials,
} = require("../../../services/payment/platformPaymentService");
const { activateSubscription } = require("../../../services/payment/subscriptionService");
const PlatformSettings = require("../../../models/PlatformSettings");

function assertSubscriptionAccess(req, restaurantId) {
  const rid = String(restaurantId).toUpperCase();
  const userRid = String(req.user?.restaurantId || "").toUpperCase();
  const isSuperAdmin = req.user?.role === "superadmin";
  if (!isSuperAdmin && (!userRid || userRid !== rid)) {
    const err = new Error("Not authorized for this restaurant");
    err.statusCode = 403;
    throw err;
  }
}

async function getPlatformKeySecret() {
  const doc = await PlatformSettings.findOne({ settingKey: "platform" });
  const { keySecret } = resolvePlatformCredentials(doc);
  return keySecret;
}

const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({}).sort({ price: 1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createSubscriptionOrder = async (req, res) => {
  try {
    const { planId, restaurantId } = req.body;
    if (!planId || !restaurantId) {
      return res.status(400).json({ message: "planId and restaurantId are required" });
    }

    assertSubscriptionAccess(req, restaurantId);

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const client = await getPlatformRazorpay();
    const keyId = await getPlatformKeyId();
    if (!keyId) {
      return res.status(503).json({ message: "Platform Razorpay is not configured. Contact super admin." });
    }

    const razorpayOrder = await createOrder(client, {
      amount: plan.price,
      currency: "INR",
      receipt: `sub_${restaurantId}_${Date.now()}`,
      notes: {
        planId: String(plan._id),
        restaurantId: String(restaurantId).toUpperCase(),
        planName: plan.name,
      },
    });

    res.json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId,
      plan: { _id: plan._id, name: plan.name, price: plan.price },
      provider: "razorpay",
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const verifySubscriptionPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      restaurantId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification fields" });
    }
    if (!planId || !restaurantId) {
      return res.status(400).json({ message: "planId and restaurantId are required" });
    }

    assertSubscriptionAccess(req, restaurantId);

    const keySecret = await getPlatformKeySecret();
    const valid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      keySecret
    );

    if (!valid) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    res.json({
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const activateSubscriptionHandler = async (req, res) => {
  try {
    const {
      planId,
      restaurantId,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!planId || !restaurantId) {
      return res.status(400).json({ message: "planId and restaurantId are required" });
    }

    assertSubscriptionAccess(req, restaurantId);

    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const keySecret = await getPlatformKeySecret();
      const valid = verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        keySecret
      );
      if (!valid) {
        return res.status(400).json({ message: "Payment verification failed" });
      }
    }

    const plan = await SubscriptionPlan.findById(planId);
    const io = req.app.get("io");
    const result = await activateSubscription({
      restaurantId,
      planId,
      amount: amount || plan?.price,
      method: "razorpay",
      transactionId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      io,
    });

    if (io) {
      io.to(String(restaurantId).toUpperCase()).emit("subscriptionActivated", {
        restaurantId: result.restaurant.restaurantId,
        planId: String(planId),
        planName: result.plan.name,
        expiry: result.expiry,
        status: result.status,
        payment: result.payment,
      });
    }

    res.json({
      message: "Subscription activated successfully",
      expiry: result.expiry,
      status: result.status,
      payment: result.payment,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const getRestaurantPaymentHistory = async (req, res) => {
  try {
    const restaurantId = String(req.user?.restaurantId || req.query.restaurantId || "").toUpperCase();
    if (!restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }

    if (req.user?.role !== "superadmin" && String(req.user?.restaurantId || "").toUpperCase() !== restaurantId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const restaurant = await Restaurant.findOne({ restaurantId })
      .select("restaurantId name paymentHistory")
      .populate("paymentHistory.plan", "name price duration")
      .lean();

    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    const history = (restaurant.paymentHistory || [])
      .map((entry) => ({
        amount: entry.amount,
        date: entry.date,
        method: entry.method,
        reference: entry.reference,
        planName: entry.planName || entry.plan?.name || "",
        razorpayOrderId: entry.razorpayOrderId || "",
        razorpayPaymentId: entry.razorpayPaymentId || entry.reference || "",
        planId: entry.plan?._id || entry.plan || null,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalPaid = history.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

    res.json({
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.name,
      history,
      total: history.length,
      totalPaid,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getSubscriptionPlans,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  activateSubscriptionHandler,
  getRestaurantPaymentHistory,
};
