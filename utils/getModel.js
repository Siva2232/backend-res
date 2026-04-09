/**
 * Dynamic Multi-Tenant Model Registry  (Separate-Database Architecture)
 * ======================================================================
 * Each restaurant gets its OWN MongoDB database:
 *   aktech_RESTO001, aktech_RESTO002, etc.
 *
 * Inside each database, collections use standard names:
 *   products, orders, bills, kitchenbills, tables, etc.
 *
 * Models are bound to the restaurant's connection via getConnection().
 * No data is shared between restaurants — FULL isolation.
 *
 * Usage (async — controllers must await):
 *   const Product = await getModel('Product', productSchema, 'RESTO001');
 *   const products = await Product.find();
 */

const { getConnection } = require("./dbConnection");

// Map from logical model name → MongoDB collection name
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
 * Returns a Mongoose model bound to the restaurant's own database.
 *
 * @param {string}           modelName    - Base model name (e.g. 'Product')
 * @param {mongoose.Schema}  schema       - The Mongoose schema for this model
 * @param {string}           restaurantId - Restaurant identifier (e.g. 'RESTO001')
 * @returns {Promise<mongoose.Model>}     - NOTE: returns a Promise now
 */
async function getModel(modelName, schema, restaurantId) {
  if (!restaurantId) {
    throw new Error(
      `[getModel] restaurantId is required to access model "${modelName}". ` +
      "Ensure the request passes through auth or tenantMiddleware."
    );
  }

  const rid = String(restaurantId).toUpperCase().trim();

  // Get (or create) the connection to this restaurant's database
  const conn = await getConnection(rid);

  // Return cached model if already compiled on this connection
  if (conn.models[modelName]) {
    return conn.models[modelName];
  }

  // Determine the collection name
  const collectionName = COLLECTION_MAP[modelName] || modelName.toLowerCase() + "s";

  return conn.model(modelName, schema, collectionName);
}

module.exports = { getModel, COLLECTION_MAP };
