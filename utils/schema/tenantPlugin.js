/**
 * Multi-Tenant Mongoose Plugin + AsyncLocalStorage
 * -------------------------------------------------
 * Provides automatic per-restaurant data isolation.
 *
 * HOW IT WORKS:
 *   1. Adds `restaurantId` field to every schema that uses this plugin.
 *   2. Auth middleware wraps request in `tenantStorage.run({ restaurantId })`.
 *   3. All Mongoose queries (find, findOne, update, delete, aggregate, etc.)
 *      automatically filter by `restaurantId` — NO controller changes needed.
 *   4. New documents auto-get `restaurantId` on save.
 *
 * IMPORTANT:
 *   - Do NOT apply this plugin to platform-level models:
 *     User, Restaurant, SubscriptionPlan, SuperAdmin.
 *   - SuperAdmin requests have NO tenant context → queries return ALL data.
 */

const { AsyncLocalStorage } = require("async_hooks");

const tenantStorage = new AsyncLocalStorage();

function tenantPlugin(schema) {
  // ── 1. Add restaurantId field ──────────────────────────────────────────────
  schema.add({
    restaurantId: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
      default: null,
    },
  });

  // ── 2. Auto-set restaurantId on new documents ─────────────────────────────
  schema.pre("save", function () {
    if (this.isNew && !this.restaurantId) {
      const store = tenantStorage.getStore();
      if (store?.restaurantId) {
        this.restaurantId = store.restaurantId;
      }
    }
  });

  // ── 3. Auto-filter queries ─────────────────────────────────────────────────
  function applyTenantFilter() {
    const store = tenantStorage.getStore();
    if (store?.restaurantId) {
      const existing = this.getQuery();
      // Don't override if restaurantId is already set explicitly
      if (!existing.restaurantId) {
        this.where({ restaurantId: store.restaurantId });
      }
    }
  }

  const queryHooks = [
    "find",
    "findOne",
    "countDocuments",
    "findOneAndUpdate",
    "findOneAndDelete",
    "findOneAndReplace",
    "deleteOne",
    "deleteMany",
    "updateOne",
    "updateMany",
  ];

  queryHooks.forEach((hook) => {
    schema.pre(hook, applyTenantFilter);
  });

  // ── 4. Auto-filter aggregation pipelines ───────────────────────────────────
  schema.pre("aggregate", function () {
    const store = tenantStorage.getStore();
    if (store?.restaurantId) {
      // Prepend a $match stage so every aggregation is tenant-scoped
      this.pipeline().unshift({
        $match: { restaurantId: store.restaurantId },
      });
    }
  });
}

module.exports = { tenantPlugin, tenantStorage };
