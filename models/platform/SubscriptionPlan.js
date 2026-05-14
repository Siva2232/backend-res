const mongoose = require("mongoose");
const {
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_DEFAULTS,
  PLAN_FEATURE_INVENTORY_DEFAULT,
  normalizePlanFeaturesObject,
} = require("../../constants/subscriptionFeatureFlags");

const planFeaturesShape = {
  inventory: { type: Boolean, default: PLAN_FEATURE_INVENTORY_DEFAULT },
};
for (const key of PLAN_FEATURE_KEYS) {
  planFeaturesShape[key] = {
    type: Boolean,
    default: PLAN_FEATURE_DEFAULTS[key],
  };
}

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true, default: 30 },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },

    features: planFeaturesShape,

    maxTables: { type: Number, default: 20 },
    maxProducts: { type: Number, default: 100 },
    maxStaff: { type: Number, default: 10 },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

subscriptionPlanSchema.pre("validate", function () {
  this.features = normalizePlanFeaturesObject(this.features);
});

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
