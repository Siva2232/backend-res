const SubscriptionPlan = require("../../models/SubscriptionPlan");

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
      name, price, duration: normalizeDurationDays(duration), description,
      features: features || {}, maxTables, maxProducts, maxStaff,
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
    const patch = { ...req.body };
    if (patch.duration !== undefined) {
      patch.duration = normalizeDurationDays(patch.duration);
    }
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
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
