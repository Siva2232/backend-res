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

let _allSchemas;

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
  AccLedger:      "acc_ledgers",
  AccTransaction: "acc_transactions",
};

// Lazily-loaded map of all model schemas.
function _getSchemas() {
  if (_allSchemas) return _allSchemas;
  _allSchemas = {
    Product:        require('../models/Product').schema,
    Order:          require('../models/Order').schema,
    Bill:           require('../models/Bill').schema,
    KitchenBill:    require('../models/KitchenBill').schema,
    Category:       require('../models/Category').schema,
    Table:          require('../models/Table').schema,
    SubItem:        require('../models/SubItem').schema,
    Banner:         require('../models/Banner').schema,
    Offer:          require('../models/Offer').schema,
    Settings:       require('../models/Settings').schema,
    Notification:   require('../models/Notification').schema,
    Reservation:    require('../models/Reservation').schema,
    HRStaff:        require('../models/HRStaff').schema,
    HRAttendance:   require('../models/HRAttendance').schema,
    HRLeave:        require('../models/HRLeave').schema,
    HRShift:        require('../models/HRShift').schema,
    HRPayroll:      require('../models/HRPayroll').schema,
    AccLedger:      require('../models/AccLedger').schema,
    AccTransaction: require('../models/AccTransaction').schema,
  };
  return _allSchemas;
}

/**
 * Bootstrap all known schemas onto a tenant connection the first time it is used.
 *
 * This is REQUIRED for Mongoose populate() to work across model references on a
 * per-restaurant (non-default) connection.  Example: HRStaff.currentShift has
 * ref: 'HRShift'.  When populate('currentShift') is called on the tenant
 * connection, Mongoose looks for model 'HRShift' on THAT connection — not on the
 * global default connection.  Without this bootstrap, only the one model
 * explicitly requested by the controller exists on the connection, causing
 * populate() to throw MissingSchemaError → HTTP 500.
 *
 * The bootstrap runs exactly once per active connection (guarded by _bootstrapped).
 */
function _bootstrapConn(conn) {
  if (conn._bootstrapped) return;
  conn._bootstrapped = true;
  const schemas = _getSchemas();
  for (const [name, schema] of Object.entries(schemas)) {
    if (!conn.models[name]) {
      const col = COLLECTION_MAP[name] || name.toLowerCase() + "s";
      conn.model(name, schema, col);
    }
  }
}

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

  // Register ALL schemas on this connection once — needed for populate() refs
  _bootstrapConn(conn);

  // Return the model (guaranteed to be registered after bootstrap)
  if (conn.models[modelName]) {
    return conn.models[modelName];
  }

  // Fallback: register on-demand for any model not in COLLECTION_MAP
  const collectionName = COLLECTION_MAP[modelName] || modelName.toLowerCase() + "s";
  return conn.model(modelName, schema, collectionName);
}

module.exports = { getModel, COLLECTION_MAP };
