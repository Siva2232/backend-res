const express = require("express");
const router = express.Router();

// Lazy-load Stripe to ensure env vars are loaded
let stripe;
const getStripe = () => {
  if (!stripe) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// Create a payment intent for Stripe checkout
router.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "inr", orderId, customerDetails } = req.body;

    console.log('🔵 [Stripe Backend] Creating payment intent...');
    console.log('   Amount:', amount, currency.toUpperCase());
    console.log('   Order ID:', orderId);
    console.log('   Customer:', customerDetails);

    // Validate amount
    if (!amount || amount <= 0) {
      console.log('🔴 [Stripe Backend] Invalid amount:', amount);
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Create payment intent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to smallest currency unit (paise for INR)
      currency: currency,
      metadata: {
        orderId: orderId || "",
        table: customerDetails?.table || "",
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('🟢 [Stripe Backend] Payment intent created successfully!');
    console.log('   Payment Intent ID:', paymentIntent.id);
    console.log('   Client Secret:', paymentIntent.client_secret?.substring(0, 20) + '...');

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("🔴 [Stripe Backend] Payment intent error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Verify payment status
router.get("/verify-payment/:paymentIntentId", async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);

    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.error("Stripe payment verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get Stripe publishable key for frontend
router.get("/config", (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

module.exports = router;
