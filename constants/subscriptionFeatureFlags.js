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
  customerPayLater: true,
  customerOnlinePayment: true,
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
  customerPayLater: true,
  customerOnlinePayment: true,
});

/**
 * Stable GET /restaurants/:id/features payload (one key per plan-merge flag).
 * @param {Record<string, unknown>|null|undefined} featuresDoc
 */
function tenantFeaturesApiPayload(featuresDoc) {
  const raw =
    featuresDoc && typeof featuresDoc === "object"
      ? featuresDoc.toObject
        ? featuresDoc.toObject()
        : featuresDoc
      : {};
  const out = {};
  for (const k of PLAN_FEATURE_KEYS) {
    out[k] =
      typeof raw[k] === "boolean" ? raw[k] : TENANT_FEATURE_READ_DEFAULTS[k];
  }
  if (typeof raw.inventory === "boolean") out.inventory = raw.inventory;
  return out;
}

/** Full module snapshot for Super Admin PUT /features (every key explicit). */
function normalizeTenantFeatureUpdate(incoming) {
  const src = incoming && typeof incoming === "object" ? incoming : {};
  const out = {};
  for (const k of PLAN_FEATURE_KEYS) {
    out[k] = Boolean(src[k]);
  }
  if (src.inventory !== undefined) out.inventory = Boolean(src.inventory);
  return out;
}

/**
 * Effective flags for admin/customer UI: restaurant overrides (Super Admin Module Access)
 * win over the subscription plan template.
 *
 * @param {Record<string, unknown>|null|undefined} restaurantFeatures
 * @param {Record<string, unknown>|null|undefined} planFeatures
 */
function resolveTenantEffectiveFeatures(restaurantFeatures, planFeatures) {
  const r =
    restaurantFeatures && typeof restaurantFeatures === "object" ? restaurantFeatures : {};
  const p = planFeatures && typeof planFeatures === "object" ? planFeatures : {};
  const out = {};
  for (const k of PLAN_FEATURE_KEYS) {
    if (typeof r[k] === "boolean") out[k] = r[k];
    else if (typeof p[k] === "boolean") out[k] = p[k];
    else out[k] = TENANT_FEATURE_READ_DEFAULTS[k];
  }
  if (typeof r.inventory === "boolean") out.inventory = r.inventory;
  else if (typeof p.inventory === "boolean") out.inventory = p.inventory;
  else out.inventory = PLAN_FEATURE_INVENTORY_DEFAULT;
  return out;
}

module.exports = {
  PLAN_FEATURE_DEFAULTS,
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_INVENTORY_DEFAULT,
  TENANT_FEATURE_READ_DEFAULTS,
  normalizePlanFeaturesObject,
  tenantFeaturesApiPayload,
  normalizeTenantFeatureUpdate,
  resolveTenantEffectiveFeatures,
};
