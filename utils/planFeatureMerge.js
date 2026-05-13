/**
 * Plan ↔ restaurant feature flags (keys from constants/subscriptionFeatureFlags).
 */
const { PLAN_FEATURE_KEYS } = require("../constants/subscriptionFeatureFlags");

function mergePlanFeaturesIntoRestaurant(restaurant, plan) {
  if (!restaurant.features || typeof restaurant.features !== "object") {
    restaurant.features = {};
  }
  const planFeatures = plan.features?.toObject ? plan.features.toObject() : plan.features || {};
  for (const key of PLAN_FEATURE_KEYS) {
    if (planFeatures[key]) restaurant.features[key] = true;
  }
  restaurant.markModified("features");
}

module.exports = { PLAN_FEATURE_KEYS, mergePlanFeaturesIntoRestaurant };
