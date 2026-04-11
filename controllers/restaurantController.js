const Restaurant = require("../models/Restaurant");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;
const { seedAccountsForRestaurant } = require("../utils/accSeeder");
const { clearTenantCache } = require("../middleware/tenantMiddleware");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: auto-generate next restaurantId (RESTO001, RESTO002 …)
// ─────────────────────────────────────────────────────────────────────────────
const generateRestaurantId = async () => {
  const last = await Restaurant.findOne({}, {}, { sort: { createdAt: -1 } });
  if (!last) return "RESTO001";
  const match = last.restaurantId.match(/\d+$/);
  const nextNum = match ? parseInt(match[0], 10) + 1 : 1;
  return `RESTO${String(nextNum).padStart(3, "0")}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all restaurants (Super Admin)
// @route   GET /api/restaurants
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const getRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({})
      .populate("subscriptionPlan", "name price duration")
      .sort({ createdAt: -1 });
    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single restaurant by restaurantId
// @route   GET /api/restaurants/:restaurantId
// @access  Private (own restaurant) or SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const getRestaurantById = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      restaurantId: req.params.restaurantId.toUpperCase(),
    }).populate("subscriptionPlan");
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get branding for a restaurant (public — used for theme injection)
// @route   GET /api/restaurants/:restaurantId/branding
// @access  Public (visual fields only); features included only for authenticated admins
// ─────────────────────────────────────────────────────────────────────────────
const getRestaurantBranding = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne(
      { restaurantId: req.params.restaurantId.toUpperCase() },
      "restaurantId name logo primaryColor secondaryColor accentColor theme fontFamily features"
    );
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    // Base visual-only response — safe for unauthenticated customers
    const response = {
      restaurantId:  restaurant.restaurantId,
      name:          restaurant.name,
      logo:          restaurant.logo,
      primaryColor:  restaurant.primaryColor,
      secondaryColor: restaurant.secondaryColor,
      accentColor:   restaurant.accentColor,
      theme:         restaurant.theme,
      fontFamily:    restaurant.fontFamily,
    };

    // Only include feature flags when the request carries a valid auth token
    // (admin/kitchen/waiter panels need these for navigation gating)
    // For customers, we ONLY expose public flags like qrMenu/onlineOrders
    const jwt = require("jsonwebtoken");
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
        response.features = restaurant.features;
      } catch (_) {
        // invalid/expired token — treat as public request
        response.features = {
          qrMenu: restaurant.features?.qrMenu ?? false,
          onlineOrders: restaurant.features?.onlineOrders ?? false
        };
      }
    } else {
      // Public guest - only expose essential flags
      response.features = {
        qrMenu: restaurant.features?.qrMenu ?? false,
        onlineOrders: restaurant.features?.onlineOrders ?? false
      };
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create restaurant  (Super Admin)
// @route   POST /api/restaurants
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const createRestaurant = async (req, res) => {
  try {
    const {
      restaurantId: customId,
      name,
      primaryColor,
      secondaryColor,
      accentColor,
      theme,
      fontFamily,
      customDomain,
      features,
      subscriptionPlan,
      subscriptionStatus,
      subscriptionExpiry,
      ownerName,
      ownerEmail,
      ownerPassword,
      ownerPhone,
      address,
      logoBase64,
    } = req.body;

    if (!name) return res.status(400).json({ message: "Restaurant name is required" });

    const restaurantId = customId
      ? customId.toUpperCase().replace(/\s/g, "_")
      : await generateRestaurantId();

    const existing = await Restaurant.findOne({ restaurantId });
    if (existing) return res.status(400).json({ message: `restaurantId '${restaurantId}' already exists` });

    // Upload logo to Cloudinary if base64 provided
    let logoUrl = "";
    if (logoBase64) {
      const uploaded = await cloudinary.uploader.upload(logoBase64, {
        folder: "restaurant_logos",
        public_id: `logo_${restaurantId}`,
        overwrite: true,
      });
      logoUrl = uploaded.secure_url;
    }

    const restaurant = await Restaurant.create({
      restaurantId,
      name,
      logo: logoUrl,
      primaryColor:   primaryColor   || "#f72585",
      secondaryColor: secondaryColor || "#0f172a",
      accentColor:    accentColor    || "#7209b7",
      theme:          theme          || "light",
      fontFamily:     fontFamily     || "Inter",
      customDomain:   customDomain   || "",
      features:       features       || {},
      subscriptionPlan: subscriptionPlan || null,
      subscriptionStatus: subscriptionStatus || "trial",
      subscriptionExpiry: subscriptionExpiry || null,
      ownerName:  ownerName  || "",
      ownerEmail: ownerEmail || "",
      ownerPhone: ownerPhone || "",
      address:    address    || "",
    });

    // Create the owner admin User account if email + password provided
    // NOTE: Do NOT pre-hash the password — User model's pre-save hook handles bcrypt automatically
    let ownerUser = null;
    if (ownerEmail && ownerPassword) {
      const existingUser = await User.findOne({ email: ownerEmail.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: `A user with email '${ownerEmail}' already exists` });
      }
      ownerUser = await User.create({
        name: ownerName || (name + " Admin"),
        email: ownerEmail.toLowerCase(),
        password: ownerPassword,   // plain — pre-save hook hashes it
        role: "admin",
        restaurantId,
      });
    }

    // Seed the new restaurant's database with default Chart of Accounts
    try {
      await seedAccountsForRestaurant(restaurantId);
    } catch (seedErr) {
      console.error(`[createRestaurant] Failed to seed accounts for ${restaurantId}:`, seedErr.message);
    }

    res.status(201).json({
      ...restaurant.toObject(),
      ownerCreated: !!ownerUser,
      ownerEmail: ownerUser ? ownerUser.email : undefined,
    });
  } catch (err) {
    console.error("[createRestaurant]", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update restaurant branding (Super Admin or Restaurant Admin)
// @route   PUT /api/restaurants/:restaurantId/branding
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const updateBranding = async (req, res) => {
  try {
    const { primaryColor, secondaryColor, accentColor, theme, fontFamily, customDomain, logoBase64 } = req.body;

    const restaurant = await Restaurant.findOne({
      restaurantId: req.params.restaurantId.toUpperCase(),
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    if (primaryColor)   restaurant.primaryColor   = primaryColor;
    if (secondaryColor) restaurant.secondaryColor = secondaryColor;
    if (accentColor)    restaurant.accentColor    = accentColor;
    if (theme)          restaurant.theme          = theme;
    if (fontFamily)     restaurant.fontFamily     = fontFamily;
    if (customDomain !== undefined) restaurant.customDomain = customDomain;

    // New logo upload
    if (logoBase64) {
      const uploaded = await cloudinary.uploader.upload(logoBase64, {
        folder: "restaurant_logos",
        public_id: `logo_${restaurant.restaurantId}`,
        overwrite: true,
      });
      restaurant.logo = uploaded.secure_url;
    }

    await restaurant.save();
    res.json({ message: "Branding updated", restaurant });
  } catch (err) {
    console.error("[updateBranding]", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Assign / update feature flags  (Super Admin ONLY)
// @route   PUT /api/restaurants/:restaurantId/features
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const updateFeatures = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      restaurantId: req.params.restaurantId.toUpperCase(),
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    // Merge incoming features (only update provided keys)
    const allowed = ["hr", "accounting", "inventory", "reports", "qrMenu", "onlineOrders", "kitchenPanel", "waiterPanel"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        restaurant.features[key] = Boolean(req.body[key]);
      }
    }
    restaurant.markModified("features");
    await restaurant.save();
    res.json({ message: "Features updated", features: restaurant.features });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Assign subscription plan  (Super Admin)
// @route   PUT /api/restaurants/:restaurantId/plan
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const assignPlan = async (req, res) => {
  try {
    const { planId, paymentAmount, paymentMethod, paymentReference } = req.body;

    const [restaurant, plan] = await Promise.all([
      Restaurant.findOne({ restaurantId: req.params.restaurantId.toUpperCase() }),
      SubscriptionPlan.findById(planId),
    ]);

    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    if (!plan)       return res.status(404).json({ message: "Plan not found" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.duration);

    // Enable features included in the plan
    const planFeatures = plan.features.toObject ? plan.features.toObject() : plan.features;
    for (const key of Object.keys(planFeatures)) {
      if (planFeatures[key]) restaurant.features[key] = true;
    }
    restaurant.markModified("features");

    restaurant.subscriptionPlan   = plan._id;
    restaurant.subscriptionStatus = "active";
    restaurant.subscriptionExpiry = expiry;

    if (paymentAmount) {
      restaurant.paymentHistory.push({
        amount:    paymentAmount,
        method:    paymentMethod    || "manual",
        reference: paymentReference || "",
        plan:      plan._id,
      });
    }

    await restaurant.save();
    clearTenantCache(restaurant.restaurantId); // Instantly propagate plan/status change
    res.json({ message: "Plan assigned", restaurant });
  } catch (err) {
    console.error("[assignPlan]", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update general restaurant info  (Super Admin)
// @route   PUT /api/restaurants/:restaurantId
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const updateRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      restaurantId: req.params.restaurantId.toUpperCase(),
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    const fields = ["name", "ownerEmail", "ownerPhone", "address", "isActive", "subscriptionStatus", "subscriptionExpiry"];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        restaurant[f] = req.body[f];
      }
    }

    // Auto-set status to 'active' if a plan is assigned and status is still 'trial'
    // (don't override 'suspended' or 'expired' set by the Super Admin manually)
    if (
      restaurant.subscriptionPlan &&
      restaurant.subscriptionStatus === "trial" &&
      req.body.subscriptionStatus === undefined
    ) {
      restaurant.subscriptionStatus = "active";
    }

    await restaurant.save();
    clearTenantCache(restaurant.restaurantId); // Instantly propagate status changes
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Delete restaurant  (Super Admin)
// @route   DELETE /api/restaurants/:restaurantId
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOneAndDelete({
      restaurantId: req.params.restaurantId.toUpperCase(),
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    res.json({ message: "Restaurant removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Super Admin analytics dashboard numbers
// @route   GET /api/restaurants/analytics/overview
// @access  Private/SuperAdmin
// ─────────────────────────────────────────────────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const total        = await Restaurant.countDocuments();
    const active       = await Restaurant.countDocuments({ subscriptionStatus: "active" });
    const trial        = await Restaurant.countDocuments({ subscriptionStatus: "trial" });
    const expired      = await Restaurant.countDocuments({ subscriptionStatus: "expired" });
    const suspended    = await Restaurant.countDocuments({ subscriptionStatus: "suspended" });

    // Revenue = sum of all paymentHistory amounts
    const revenueAgg = await Restaurant.aggregate([
      { $unwind: { path: "$paymentHistory", preserveNullAndEmptyArrays: false } },
      { $group: { _id: null, total: { $sum: "$paymentHistory.amount" } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Feature usage stats
    const featureUsage = {
      hr:           await Restaurant.countDocuments({ "features.hr":           true }),
      accounting:   await Restaurant.countDocuments({ "features.accounting":   true }),
      inventory:    await Restaurant.countDocuments({ "features.inventory":    true }),
      onlineOrders: await Restaurant.countDocuments({ "features.onlineOrders": true }),
      qrMenu:       await Restaurant.countDocuments({ "features.qrMenu":       true }),
      kitchenPanel: await Restaurant.countDocuments({ "features.kitchenPanel": true }),
      waiterPanel:  await Restaurant.countDocuments({ "features.waiterPanel":  true }),
    };

    res.json({ total, active, trial, expired, suspended, totalRevenue, featureUsage });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getRestaurants,
  getRestaurantById,
  getRestaurantBranding,
  createRestaurant,
  updateRestaurant,
  updateBranding,
  updateFeatures,
  assignPlan,
  deleteRestaurant,
  getAnalytics,
};
