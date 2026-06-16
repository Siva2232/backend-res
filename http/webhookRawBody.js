const express = require("express");
const { restaurantContextMiddleware } = require("../middleware/restaurantContext");
const { tenantMiddleware } = require("../middleware/tenantMiddleware");
const { handlePaymentWebhook } = require("../controllers/tenant/payments/paymentController");

/**
 * Razorpay webhooks require the raw request body for signature verification.
 * Must be registered before express.json() middleware.
 */
function applyWebhookRawBody(app) {
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json" }),
    restaurantContextMiddleware,
    tenantMiddleware,
    handlePaymentWebhook
  );
}

module.exports = { applyWebhookRawBody };
