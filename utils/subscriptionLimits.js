/**
 * Caps come from the Super Admin–managed SubscriptionPlan (maxTables, maxProducts).
 * Used by tenant controllers so limits cannot be bypassed from the admin panel.
 */

function safeIntEnv(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getPlanLimits(restaurant) {
  const fallbackTables = safeIntEnv("DEFAULT_PLAN_MAX_TABLES", 20);
  const fallbackProducts = safeIntEnv("DEFAULT_PLAN_MAX_PRODUCTS", 100);

  const plan = restaurant && restaurant.subscriptionPlan;
  if (!plan || typeof plan !== "object") {
    return { maxTables: fallbackTables, maxProducts: fallbackProducts };
  }

  const mt = Number(plan.maxTables);
  const mp = Number(plan.maxProducts);

  return {
    maxTables: Number.isFinite(mt) && mt > 0 ? Math.floor(mt) : fallbackTables,
    maxProducts: Number.isFinite(mp) && mp > 0 ? Math.floor(mp) : fallbackProducts,
  };
}

module.exports = { getPlanLimits };
