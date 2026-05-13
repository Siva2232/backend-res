const SubscriptionPlan = require("../../models/SubscriptionPlan");
const Restaurant = require("../../models/Restaurant");
const { clearTenantCache } = require("../../middleware/tenantMiddleware");
const { mergePlanFeaturesIntoRestaurant } = require("../../utils/planFeatureMerge");
const { normalizePlanFeaturesObject } = require("../../constants/subscriptionFeatureFlags");

const normalizeDurationDays = (duration) => {
  const raw = duration !== undefined && duration !== null ? Number(duration) : 30;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
};

// @desc    Get all plans
// @route   GET /api/plans
// @access  Public (shown on pricing page) / SuperAdmin
const getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single plan
// @route   GET /api/plans/:id
// @access  Public
const getPlanById = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create plan  (Super Admin)
// @route   POST /api/plans
// @access  Private/SuperAdmin
const createPlan = async (req, res) => {
  try {
    const { name, price, duration, description, features, maxTables, maxProducts, maxStaff, sortOrder } = req.body;
    if (!name || price === undefined) return res.status(400).json({ message: "name and price are required" });

    const plan = await SubscriptionPlan.create({
      name,
      price,
      duration: normalizeDurationDays(duration),
      description,
      features: normalizePlanFeaturesObject(features),
      maxTables,
      maxProducts,
      maxStaff,
      sortOrder: sortOrder || 0,
    });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update plan  (Super Admin)
// @route   PUT /api/plans/:id
// @access  Private/SuperAdmin
const updatePlan = async (req, res) => {
  try {
    const allowed = [
      "name",
      "price",
      "duration",
      "description",
      "features",
      "maxTables",
      "maxProducts",
      "maxStaff",
      "sortOrder",
      "isActive",
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.duration !== undefined) {
      patch.duration = normalizeDurationDays(patch.duration);
    }
    if (patch.features !== undefined) {
      patch.features = normalizePlanFeaturesObject(patch.features);
    }
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    // Re-merge plan-included modules into every tenant on this plan, then bust cache.
    try {
      const tenants = await Restaurant.find({ subscriptionPlan: plan._id });
      for (const r of tenants) {
        mergePlanFeaturesIntoRestaurant(r, plan);
        await r.save();
        if (r.restaurantId) clearTenantCache(r.restaurantId);
      }
    } catch (_) {}
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete plan  (Super Admin)
// @route   DELETE /api/plans/:id
// @access  Private/SuperAdmin
const deletePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ message: "Plan removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPlans, getPlanById, createPlan, updatePlan, deletePlan };
