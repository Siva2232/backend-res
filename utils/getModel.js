/**
 * Dynamic Multi-Tenant Model Registry
 * =====================================
 * Creates (or retrieves from cache) a Mongoose model bound to a
 * restaurant-specific MongoDB collection.
 *
 * Example:
 *   getModel('Product', productSchema, 'RESTO001')
 *   → mongoose model using collection  "products_RESTO001"
 *
 * Architecture:
 *   - Each restaurant gets its own MongoDB collection per entity.
 *   - NO shared collection with a restaurantId filter field.
 *   - Models are cached in mongoose.models so the schema is compiled only once.
 *
 * Collection naming map  (modelName → base collection prefix):
 *   Product       → products_<RID>
 *   Order         → orders_<RID>
 *   Bill          → bills_<RID>
 *   KitchenBill   → kitchenbills_<RID>
 *   Category      → categories_<RID>
 *   Table         → tables_<RID>
 *   SubItem       → subitems_<RID>
 *   Banner        → banners_<RID>
 *   Offer         → offers_<RID>
 *   Settings      → settings_<RID>
 *   Notification  → notifications_<RID>
 *   Reservation   → reservations_<RID>
 *   HRStaff       → staff_<RID>
 *   HRAttendance  → attendance_<RID>
 *   HRLeave       → leaves_<RID>
 *   HRShift       → shifts_<RID>
 *   HRPayroll     → payroll_<RID>
 *   AccAccount    → acc_accounts_<RID>
 *   AccExpense    → acc_expenses_<RID>
 *   AccLedgerEntry→ acc_ledger_<RID>
 *   AccLoan       → acc_loans_<RID>
 *   AccOrder      → acc_orders_<RID>
 *   AccParty      → acc_parties_<RID>
 *   AccPayment    → acc_payments_<RID>
 *   AccPurchase   → acc_purchases_<RID>
 */

const mongoose = require("mongoose");

// Map from logical model name → MongoDB collection prefix
const COLLECTION_MAP = {
  Product:        "products",
  Order:          "orders",
  Bill:           "bills",
  KitchenBill:    "kitchenbills",
  Category:       "categories",
  Table:          "tables",
  SubItem:        "subitems",
  Banner:         "banners",
  Offer:          "offers",
  Settings:       "settings",
  Notification:   "notifications",
  Reservation:    "reservations",
  HRStaff:        "staff",
  HRAttendance:   "attendance",
  HRLeave:        "leaves",
  HRShift:        "shifts",
  HRPayroll:      "payroll",
  AccAccount:     "acc_accounts",
  AccExpense:     "acc_expenses",
  AccLedgerEntry: "acc_ledger",
  AccLoan:        "acc_loans",
  AccOrder:       "acc_orders",
  AccParty:       "acc_parties",
  AccPayment:     "acc_payments",
  AccPurchase:    "acc_purchases",
};

/**
 * Returns a Mongoose model bound to a restaurant-specific collection.
 *
 * @param {string}           modelName   - Base model name (e.g. 'Product')
 * @param {mongoose.Schema}  schema      - The Mongoose schema for this model
 * @param {string}           restaurantId - Restaurant identifier (e.g. 'RESTO001')
 * @returns {mongoose.Model}
 */
function getModel(modelName, schema, restaurantId) {
  if (!restaurantId) {
    throw new Error(
      `[getModel] restaurantId is required to access model "${modelName}". ` +
      "Ensure the request passes through auth or tenantMiddleware."
    );
  }

  const rid = String(restaurantId).toUpperCase().trim();

  // Unique internal model name — prevents Mongoose from confusing different
  // restaurants' models when they share the same base schema.
  const fullModelName = `${modelName}_${rid}`;

  // Use cached model if already compiled for this restaurant
  if (mongoose.models[fullModelName]) {
    return mongoose.models[fullModelName];
  }

  // Determine the collection name
  const prefix = COLLECTION_MAP[modelName] || modelName.toLowerCase() + "s";
  const collectionName = `${prefix}_${rid}`;

  return mongoose.model(fullModelName, schema, collectionName);
}

module.exports = { getModel, COLLECTION_MAP };
