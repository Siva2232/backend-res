const Restaurant = require("../../models/Restaurant");
const SubscriptionPlan = require("../../models/SubscriptionPlan");
const SuperAdminNotification = require("../../models/SuperAdminNotification");
const NotificationModel = require("../../models/Notification");
const { clearTenantCache } = require("../../middleware/tenantMiddleware");
const getModel = require("../../utils/database/getModel");

function getPlanDurationDays(plan) {
  const n = Number(plan?.duration);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

async function createAdminPaymentNotification(restaurantId, message, io) {
  try {
    const Notification = await getModel("Notification", NotificationModel.schema, restaurantId);
    const doc = await Notification.create({
      table: "Subscription",
      type: "SubscriptionPayment",
      message,
      status: "Pending",
    });
    const payload = doc.toObject ? doc.toObject() : doc;
    if (io) io.to(String(restaurantId).toUpperCase()).emit("newNotification", payload);
  } catch (err) {
    console.error("[createAdminPaymentNotification]", err.message);
  }
}

async function activateSubscription({
  restaurantId,
  planId,
  amount,
  method = "razorpay",
  transactionId = "",
  razorpayOrderId = "",
  razorpayPaymentId = "",
  io = null,
}) {
  const restaurant = await Restaurant.findOne({
    restaurantId: String(restaurantId).toUpperCase(),
  });
  if (!restaurant) {
    const err = new Error("Restaurant not found");
    err.statusCode = 404;
    throw err;
  }

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) {
    const err = new Error("Invalid subscription plan");
    err.statusCode = 404;
    throw err;
  }

  let newExpiry = new Date();
  if (
    restaurant.subscriptionExpiry &&
    restaurant.subscriptionExpiry > new Date() &&
    (restaurant.subscriptionStatus === "active" || restaurant.subscriptionStatus === "trial")
  ) {
    newExpiry = new Date(restaurant.subscriptionExpiry);
  }
  newExpiry.setDate(newExpiry.getDate() + getPlanDurationDays(plan));

  restaurant.subscriptionPlan = plan._id;
  restaurant.subscriptionExpiry = newExpiry;

  if (restaurant.subscriptionStatus !== "suspended") {
    restaurant.subscriptionStatus = "active";
  }

  const planFeatures = plan.features?.toObject ? plan.features.toObject() : plan.features || {};
  for (const key of Object.keys(planFeatures)) {
    if (planFeatures[key]) restaurant.features[key] = true;
  }
  restaurant.markModified("features");

  const paidAmount = amount || plan.price;
  const paymentRef = razorpayPaymentId || transactionId || razorpayOrderId || "";

  restaurant.paymentHistory.push({
    amount: paidAmount,
    date: new Date(),
    method: method || "razorpay",
    reference: paymentRef,
    plan: plan._id,
    planName: plan.name,
    razorpayOrderId: razorpayOrderId || "",
    razorpayPaymentId: razorpayPaymentId || paymentRef,
  });

  await restaurant.save();
  clearTenantCache(restaurant.restaurantId);

  const expiryLabel = newExpiry.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  await SuperAdminNotification.create({
    type: "payment",
    title: "Subscription payment received",
    message: `${restaurant.name} (${restaurant.restaurantId}) paid ₹${paidAmount} for ${plan.name}. Active until ${expiryLabel}.`,
    restaurantId: restaurant.restaurantId,
    restaurantName: restaurant.name,
    amount: paidAmount,
    planName: plan.name,
    meta: {
      method: method || "razorpay",
      transactionId: paymentRef,
      razorpayOrderId: razorpayOrderId || "",
      razorpayPaymentId: razorpayPaymentId || paymentRef,
      planId: String(plan._id),
      expiry: newExpiry,
      paidAt: new Date(),
    },
  });

  await createAdminPaymentNotification(
    restaurant.restaurantId,
    `Payment successful: ₹${paidAmount} for ${plan.name} plan. Subscription active until ${expiryLabel}. Ref: ${paymentRef || "—"}.`,
    io
  );

  return {
    restaurant,
    plan,
    expiry: newExpiry,
    status: restaurant.subscriptionStatus,
    payment: {
      amount: paidAmount,
      reference: paymentRef,
      planName: plan.name,
      razorpayOrderId: razorpayOrderId || "",
      razorpayPaymentId: razorpayPaymentId || paymentRef,
    },
  };
}

module.exports = { activateSubscription, getPlanDurationDays, createAdminPaymentNotification };
