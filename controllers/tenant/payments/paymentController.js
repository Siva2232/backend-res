const Restaurant = require("../../../models/Restaurant");
const { encrypt, decrypt } = require("../../../utils/crypto/encryption");
const {
  getRestaurantRazorpay,
  testConnection,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  getRestaurantWebhookSecret,
} = require("../../../services/payment/razorpayService");
const getModel = require("../../../utils/database/getModel");
const BillModel = require("../../../models/Bill");
const OrderModel = require("../../../models/Order");
const { clearTenantCache } = require("../../../middleware/tenantMiddleware");

async function getBillModel(req) {
  return getModel("Bill", BillModel.schema, req.restaurantId);
}

async function getOrderModel(req) {
  return getModel("Order", OrderModel.schema, req.restaurantId);
}

function assertRestaurantAdmin(req) {
  const rid = String(req.restaurantId || "").toUpperCase();
  const userRid = String(req.user?.restaurantId || "").toUpperCase();
  const isSuperAdmin = req.user?.role === "superadmin";
  if (!isSuperAdmin && (!userRid || userRid !== rid)) {
    const err = new Error("Not authorized for this restaurant");
    err.statusCode = 403;
    throw err;
  }
}

function buildWebhookUrl(restaurantId) {
  const base =
    process.env.API_PUBLIC_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  const root = String(base).replace(/\/$/, "");
  const apiRoot = root.endsWith("/api") ? root : `${root}/api`;
  return `${apiRoot}/payments/webhook?restaurantId=${encodeURIComponent(restaurantId)}`;
}

function sanitizePaymentConfig(restaurant) {
  const ps = restaurant.paymentSettings || {};
  return {
    razorpayEnabled: Boolean(ps.razorpayEnabled),
    razorpayKeyId: ps.razorpayKeyId || "",
    hasKeySecret: Boolean(ps.razorpayKeySecret),
    hasWebhookSecret: Boolean(ps.razorpayWebhookSecret),
    webhookUrl: buildWebhookUrl(restaurant.restaurantId),
  };
}

const getPaymentConfig = async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const ps = restaurant?.paymentSettings || {};
    if (!ps.razorpayEnabled || !ps.razorpayKeyId) {
      return res.json({
        provider: "razorpay",
        enabled: false,
        keyId: null,
      });
    }
    res.json({
      provider: "razorpay",
      enabled: true,
      keyId: ps.razorpayKeyId,
      restaurantName: restaurant.name,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getPaymentConfigAdmin = async (req, res) => {
  try {
    assertRestaurantAdmin(req);
    res.json(sanitizePaymentConfig(req.restaurant));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const updatePaymentConfig = async (req, res) => {
  try {
    assertRestaurantAdmin(req);
    const {
      razorpayEnabled,
      razorpayKeyId,
      razorpayKeySecret,
      razorpayWebhookSecret,
    } = req.body;

    const restaurant = await Restaurant.findOne({
      restaurantId: req.restaurantId.toUpperCase(),
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    if (!restaurant.paymentSettings) {
      restaurant.paymentSettings = {};
    }

    if (typeof razorpayEnabled === "boolean") {
      restaurant.paymentSettings.razorpayEnabled = razorpayEnabled;
    }
    if (razorpayKeyId != null) {
      restaurant.paymentSettings.razorpayKeyId = String(razorpayKeyId).trim();
    }
    if (razorpayKeySecret) {
      restaurant.paymentSettings.razorpayKeySecret = encrypt(razorpayKeySecret);
    }
    if (razorpayWebhookSecret) {
      restaurant.paymentSettings.razorpayWebhookSecret = encrypt(razorpayWebhookSecret);
    }

    const ps = restaurant.paymentSettings;
    if (ps.razorpayEnabled) {
      if (!ps.razorpayKeyId) {
        return res.status(400).json({ message: "Razorpay Key ID is required when payments are enabled" });
      }
      const hasSecret = Boolean(ps.razorpayKeySecret);
      if (!hasSecret) {
        return res.status(400).json({ message: "Razorpay Key Secret is required when payments are enabled" });
      }
    }

    restaurant.markModified("paymentSettings");
    await restaurant.save();
    clearTenantCache(restaurant.restaurantId);

    res.json({
      message: "Payment settings saved",
      config: sanitizePaymentConfig(restaurant),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const testPaymentConfig = async (req, res) => {
  try {
    assertRestaurantAdmin(req);
    const restaurant = await Restaurant.findOne({
      restaurantId: req.restaurantId.toUpperCase(),
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    const client = getRestaurantRazorpay(restaurant);
    const result = await testConnection(client);

    res.json({ success: true, message: "Razorpay connection successful", orderId: result.orderId });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Connection test failed" });
  }
};

const createCustomerOrder = async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const features = restaurant.features || {};
    if (features.customerOnlinePayment === false) {
      return res.status(403).json({ message: "Online payment is not enabled for this restaurant" });
    }

    const { amount, currency = "INR", billId, orderId, table, customerName } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const client = getRestaurantRazorpay(restaurant);
    const receipt = billId ? `bill_${billId}` : orderId ? `ord_${orderId}` : `pay_${Date.now()}`;

    const razorpayOrder = await createOrder(client, {
      amount: Number(amount),
      currency,
      receipt,
      notes: {
        restaurantId: restaurant.restaurantId,
        billId: billId || "",
        orderId: orderId || "",
        table: table || "",
        customerName: customerName || "",
      },
    });

    res.json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: restaurant.paymentSettings.razorpayKeyId,
      provider: "razorpay",
    });
  } catch (err) {
    res.status(err.message?.includes("not enabled") ? 400 : 500).json({ message: err.message });
  }
};

async function markBillAsPaid(req, bill, paymentId, orderId) {
  bill.paymentMethod = "online";
  bill.paymentStatus = "paid";
  bill.paymentId = paymentId;
  bill.paymentSessions = bill.paymentSessions || [];
  bill.paymentSessions.push({
    method: "online",
    status: "paid",
    amount: bill.totalAmount,
    id: paymentId,
    addedAt: new Date(),
  });
  await bill.save();

  const OrderM = await getOrderModel(req);
  const rootId = bill.sessionRef || bill.orderRef;
  const sessionOrders = await OrderM.find({
    $or: [{ _id: rootId }, { sessionRef: rootId }],
  });

  for (const orderDoc of sessionOrders) {
    orderDoc.paymentMethod = "online";
    orderDoc.paymentStatus = "paid";
    orderDoc.paymentId = paymentId;
    orderDoc.status = "Paid";
    await orderDoc.save();
  }

  const io = req.app.get("io");
  if (io) {
    io.to(req.restaurantId).emit("billPaid", bill);
    io.to(req.restaurantId).emit("paymentSuccess", {
      billId: bill._id,
      paymentId,
      orderId: orderId || "",
      amount: bill.totalAmount,
    });
    io.to(req.restaurantId).emit("billUpdated", bill);
    for (const orderDoc of sessionOrders) {
      io.to(req.restaurantId).emit("orderUpdated", orderDoc);
    }
  }
}

const verifyCustomerPayment = async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      billId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification fields" });
    }

    const keySecret = decrypt(restaurant.paymentSettings.razorpayKeySecret);
    const valid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      keySecret
    );

    if (!valid) {
      const io = req.app.get("io");
      if (io) {
        io.to(req.restaurantId).emit("paymentFailed", {
          orderId: razorpay_order_id,
          reason: "Invalid signature",
        });
      }
      return res.status(400).json({ message: "Payment verification failed" });
    }

    if (billId) {
      const BillM = await getBillModel(req);
      const bill = await BillM.findById(billId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      await markBillAsPaid(req, bill, razorpay_payment_id, razorpay_order_id);
    }

    res.json({
      success: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      billId: billId || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handlePaymentWebhook = async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = getRestaurantWebhookSecret(restaurant);

    if (!webhookSecret) {
      return res.status(400).json({ message: "Webhook secret not configured" });
    }

    const rawBody = req.body;
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    const eventType = event.event;
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;

    if (eventType === "payment.captured" && paymentEntity) {
      const billId = paymentEntity.notes?.billId;
      if (billId) {
        const BillM = await getBillModel(req);
        const bill = await BillM.findById(billId);
        if (bill && bill.paymentStatus !== "paid") {
          await markBillAsPaid(
            req,
            bill,
            paymentEntity.id,
            paymentEntity.order_id || orderEntity?.id
          );
        }
      }
    }

    if (eventType === "payment.failed") {
      const io = req.app.get("io");
      if (io) {
        io.to(req.restaurantId).emit("paymentFailed", {
          paymentId: paymentEntity?.id,
          orderId: paymentEntity?.order_id,
          reason: paymentEntity?.error_description || "Payment failed",
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPaymentConfig,
  getPaymentConfigAdmin,
  updatePaymentConfig,
  testPaymentConfig,
  createCustomerOrder,
  verifyCustomerPayment,
  handlePaymentWebhook,
};
