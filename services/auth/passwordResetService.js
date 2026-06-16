const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Restaurant = require("../../models/Restaurant");
const User = require("../../models/User");
const PasswordResetOtp = require("../../models/PasswordResetOtp");
const { sendPasswordResetOtpEmail } = require("../email/emailService");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const GENERIC_SEND_MESSAGE = "If this email is registered, an OTP has been sent.";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function hashOtp(otp) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(otp), salt);
}

async function findEligibleOwner(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const restaurant = await Restaurant.findOne({
    ownerEmail: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  }).lean();
  if (!restaurant) return null;

  const user = await User.findOne({
    restaurantId: restaurant.restaurantId,
    $or: [{ isAdmin: true }, { role: "admin" }],
  });
  if (!user) return null;

  return { restaurant, user };
}

async function requestOtp(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { message: GENERIC_SEND_MESSAGE, sent: false };
  }

  const eligible = await findEligibleOwner(normalized);
  if (!eligible) {
    return { message: GENERIC_SEND_MESSAGE, sent: false };
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("[PasswordReset] SMTP not configured — cannot send OTP");
    return { message: GENERIC_SEND_MESSAGE, sent: false };
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await PasswordResetOtp.deleteMany({ email: normalized, usedAt: null });

  await PasswordResetOtp.create({
    email: normalized,
    otpHash,
    restaurantId: eligible.restaurant.restaurantId,
    expiresAt,
    attempts: 0,
  });

  try {
    await sendPasswordResetOtpEmail(
      normalized,
      otp,
      eligible.restaurant.name || eligible.restaurant.restaurantId
    );
  } catch (err) {
    console.error("[PasswordReset] Failed to send OTP email:", err.message);
    await PasswordResetOtp.deleteMany({ email: normalized, usedAt: null });
    return { message: GENERIC_SEND_MESSAGE, sent: false };
  }

  return { message: GENERIC_SEND_MESSAGE, sent: true };
}

async function resetPassword(email, otp, newPassword) {
  const normalized = normalizeEmail(email);
  const otpStr = String(otp || "").trim();

  if (!normalized || !otpStr) {
    const err = new Error("Email and OTP are required");
    err.statusCode = 400;
    throw err;
  }

  if (!newPassword || String(newPassword).length < 6) {
    const err = new Error("New password must be at least 6 characters");
    err.statusCode = 400;
    throw err;
  }

  const eligible = await findEligibleOwner(normalized);
  if (!eligible) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  const record = await PasswordResetOtp.findOne({
    email: normalized,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!record) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    const err = new Error("Too many failed attempts. Request a new OTP.");
    err.statusCode = 429;
    throw err;
  }

  const match = await bcrypt.compare(otpStr, record.otpHash);
  if (!match) {
    record.attempts += 1;
    await record.save();
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(eligible.user._id);
  if (!user) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }

  user.password = newPassword;
  await user.save();

  record.usedAt = new Date();
  await record.save();
  await PasswordResetOtp.deleteMany({ email: normalized, usedAt: null, _id: { $ne: record._id } });

  return { message: "Password reset successfully. You can log in with your new password." };
}

module.exports = {
  requestOtp,
  resetPassword,
  GENERIC_SEND_MESSAGE,
};
