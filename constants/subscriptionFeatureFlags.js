/**
 * Single source of truth for plan ↔ tenant module flags.
 * SubscriptionPlan schema, plan→restaurant merge, and superadmin feature PUT must use this list.
 *
 * Adding a module: extend PLAN_FEATURE_DEFAULTS here, add the same path on `Restaurant.features`
 * in `models/platform/Restaurant.js`, and update superadmin/admin UI feature lists.
 */

/** Defaults for new/updated subscription *plans* (template tiers). */
const PLAN_FEATURE_DEFAULTS = Object.freeze({
  hr: false,
  reports: true,
  qrMenu: true,
  onlineOrders: false,
  kitchenPanel: true,
  waiterPanel: true,
  waiterCall: true,
  billRequest: true,
  accounting: true,
  hrStaff: true,
  hrAttendance: true,
  hrLeaves: true,
  reservations: true,
});

/** Keys merged from plan → restaurant (stable key order). */
const PLAN_FEATURE_KEYS = Object.freeze(Object.keys(PLAN_FEATURE_DEFAULTS));

/** Legacy plan-only flag (not applied by mergePlanFeaturesIntoRestaurant). */
const PLAN_FEATURE_INVENTORY_DEFAULT = false;

/**
 * Always returns a full `features` map for SubscriptionPlan (no partial objects).
 * Prevents Mongoose strict drops and keeps GET /plans payloads complete for every tenant.
 *
 * @param {Record<string, unknown>|null|undefined} partial
 */
function normalizePlanFeaturesObject(partial) {
  const out = { ...PLAN_FEATURE_DEFAULTS, inventory: PLAN_FEATURE_INVENTORY_DEFAULT };
  if (partial && typeof partial === "object") {
    for (const k of PLAN_FEATURE_KEYS) {
      if (partial[k] !== undefined) out[k] = Boolean(partial[k]);
    }
    if (partial.inventory !== undefined) out.inventory = Boolean(partial.inventory);
  }
  return out;
}

/** Defaults when serializing `Restaurant.features` (tenant differs from plan templates). */
const TENANT_FEATURE_READ_DEFAULTS = Object.freeze({
  hr: true,
  reports: true,
  qrMenu: true,
  onlineOrders: false,
  kitchenPanel: true,
  waiterPanel: true,
  waiterCall: true,
  billRequest: true,
  accounting: true,
  hrStaff: true,
  hrAttendance: true,
  hrLeaves: true,
  reservations: true,
});

/**
 * Stable GET /restaurants/:id/features payload (one key per plan-merge flag).
 * @param {Record<string, unknown>|null|undefined} featuresDoc
 */
function tenantFeaturesApiPayload(featuresDoc) {
  const f = featuresDoc && typeof featuresDoc === "object" ? featuresDoc : {};
  const out = {};
  for (const k of PLAN_FEATURE_KEYS) {
    out[k] = f[k] ?? TENANT_FEATURE_READ_DEFAULTS[k];
  }
  return out;
}

module.exports = {
  PLAN_FEATURE_DEFAULTS,
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_INVENTORY_DEFAULT,
  TENANT_FEATURE_READ_DEFAULTS,
  normalizePlanFeaturesObject,
  tenantFeaturesApiPayload,
};
