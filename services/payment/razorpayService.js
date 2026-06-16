const crypto = require("crypto");
const Razorpay = require("razorpay");
const { decrypt } = require("../../utils/crypto/encryption");

function createRazorpayClient(keyId, keySecret) {
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function getPlatformRazorpay() {
  // Deprecated: use platformPaymentService.getPlatformRazorpay() for DB + env resolution
  const keyId = process.env.RAZORPAY_PLATFORM_KEY_ID;
  const keySecret = process.env.RAZORPAY_PLATFORM_KEY_SECRET;
  return createRazorpayClient(keyId, keySecret);
}

function getRestaurantRazorpay(restaurant) {
  const settings = restaurant?.paymentSettings;
  if (!settings?.razorpayEnabled || !settings?.razorpayKeyId) {
    throw new Error("Razorpay is not enabled for this restaurant");
  }
  const keySecret = decrypt(settings.razorpayKeySecret);
  if (!keySecret) {
    throw new Error("Restaurant Razorpay secret is missing");
  }
  return createRazorpayClient(settings.razorpayKeyId, keySecret);
}

function getRestaurantWebhookSecret(restaurant) {
  const encrypted = restaurant?.paymentSettings?.razorpayWebhookSecret;
  return encrypted ? decrypt(encrypted) : "";
}

function verifyPaymentSignature(orderId, paymentId, signature, keySecret) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
  if (!signature || expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function createOrder(client, { amount, currency = "INR", receipt, notes = {} }) {
  const amountPaise = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error("Invalid payment amount");
  }
  return client.orders.create({
    amount: amountPaise,
    currency: currency.toUpperCase(),
    receipt: receipt || `rcpt_${Date.now()}`,
    notes,
  });
}

async function testConnection(client) {
  const order = await client.orders.create({
    amount: 100,
    currency: "INR",
    receipt: `test_${Date.now()}`,
    notes: { purpose: "connection_test" },
  });
  return { success: true, orderId: order.id };
}

module.exports = {
  createRazorpayClient,
  getPlatformRazorpay,
  getRestaurantRazorpay,
  getRestaurantWebhookSecret,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createOrder,
  testConnection,
};
