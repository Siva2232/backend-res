const PlatformSettings = require("../../models/PlatformSettings");
const { encrypt, decrypt } = require("../../utils/crypto/encryption");
const { createRazorpayClient, testConnection } = require("./razorpayService");

let cachedDoc = null;
let cacheTs = 0;
const CACHE_TTL = 30_000;

async function getPlatformSettingsDoc() {
  if (cachedDoc && Date.now() - cacheTs < CACHE_TTL) {
    return cachedDoc;
  }
  let doc = await PlatformSettings.findOne({ settingKey: "platform" });
  if (!doc) {
    doc = await PlatformSettings.create({ settingKey: "platform" });
  }
  cachedDoc = doc;
  cacheTs = Date.now();
  return doc;
}

function clearPlatformSettingsCache() {
  cachedDoc = null;
  cacheTs = 0;
}

function resolvePlatformCredentials(doc) {
  const ps = doc?.paymentSettings || {};
  const envKeyId = process.env.RAZORPAY_PLATFORM_KEY_ID || "";
  const envSecret = process.env.RAZORPAY_PLATFORM_KEY_SECRET || "";

  if (ps.razorpayEnabled && ps.razorpayKeyId && ps.razorpayKeySecret) {
    const keySecret = decrypt(ps.razorpayKeySecret);
    if (keySecret) {
      return { keyId: ps.razorpayKeyId, keySecret, source: "database" };
    }
  }

  if (envKeyId && envSecret) {
    return { keyId: envKeyId, keySecret: envSecret, source: "env" };
  }

  return { keyId: "", keySecret: "", source: "none" };
}

async function getPlatformRazorpay() {
  const doc = await getPlatformSettingsDoc();
  const { keyId, keySecret } = resolvePlatformCredentials(doc);
  return createRazorpayClient(keyId, keySecret);
}

async function getPlatformKeyId() {
  const doc = await getPlatformSettingsDoc();
  const { keyId } = resolvePlatformCredentials(doc);
  return keyId;
}

function sanitizePlatformPaymentConfig(doc) {
  const ps = doc?.paymentSettings || {};
  const { source } = resolvePlatformCredentials(doc);
  return {
    razorpayEnabled: Boolean(ps.razorpayEnabled),
    razorpayKeyId: ps.razorpayKeyId || "",
    hasKeySecret: Boolean(ps.razorpayKeySecret),
    hasWebhookSecret: Boolean(ps.razorpayWebhookSecret),
    credentialSource: source,
    configured: source !== "none",
  };
}

async function getPlatformPaymentConfigAdmin() {
  const doc = await getPlatformSettingsDoc();
  return sanitizePlatformPaymentConfig(doc);
}

async function updatePlatformPaymentConfig(updates) {
  const doc = await getPlatformSettingsDoc();
  if (!doc.paymentSettings) doc.paymentSettings = {};

  const {
    razorpayEnabled,
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret,
  } = updates;

  if (typeof razorpayEnabled === "boolean") {
    doc.paymentSettings.razorpayEnabled = razorpayEnabled;
  }
  if (razorpayKeyId != null) {
    doc.paymentSettings.razorpayKeyId = String(razorpayKeyId).trim();
  }
  if (razorpayKeySecret) {
    doc.paymentSettings.razorpayKeySecret = encrypt(razorpayKeySecret);
  }
  if (razorpayWebhookSecret) {
    doc.paymentSettings.razorpayWebhookSecret = encrypt(razorpayWebhookSecret);
  }

  const ps = doc.paymentSettings;
  if (ps.razorpayEnabled) {
    if (!ps.razorpayKeyId) {
      const err = new Error("Razorpay Key ID is required when platform payments are enabled");
      err.statusCode = 400;
      throw err;
    }
    if (!ps.razorpayKeySecret && !process.env.RAZORPAY_PLATFORM_KEY_SECRET) {
      const err = new Error("Razorpay Key Secret is required when platform payments are enabled");
      err.statusCode = 400;
      throw err;
    }
  }

  doc.markModified("paymentSettings");
  await doc.save();
  clearPlatformSettingsCache();
  return sanitizePlatformPaymentConfig(doc);
}

async function testPlatformPaymentConfig() {
  const client = await getPlatformRazorpay();
  return testConnection(client);
}

module.exports = {
  getPlatformRazorpay,
  getPlatformKeyId,
  getPlatformPaymentConfigAdmin,
  updatePlatformPaymentConfig,
  testPlatformPaymentConfig,
  clearPlatformSettingsCache,
  resolvePlatformCredentials,
};
