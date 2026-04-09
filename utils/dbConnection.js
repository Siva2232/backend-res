/**
 * Dynamic Per-Restaurant Database Connection Manager
 * ====================================================
 * Each restaurant gets its own MongoDB database:
 *   aktech_RESTO001, aktech_RESTO002, etc.
 *
 * Platform-level models (User, Restaurant, SuperAdmin, SubscriptionPlan)
 * remain on the default mongoose connection (main "aktech" database).
 *
 * Usage:
 *   const conn = await getConnection('RESTO001');
 *   // conn is a mongoose.Connection bound to aktech_RESTO001
 */

const mongoose = require("mongoose");

// Cache of active connections: { "RESTO001": connection }
const connections = {};

// Max concurrent restaurant connections to prevent resource exhaustion
const MAX_CONNECTIONS = 100;

/**
 * Returns a cached (or new) Mongoose connection for the given restaurant.
 *
 * @param {string} restaurantId - e.g. "RESTO001"
 * @returns {Promise<mongoose.Connection>}
 */
async function getConnection(restaurantId) {
  if (!restaurantId) {
    throw new Error("[getConnection] restaurantId is required");
  }

  const rid = String(restaurantId).toUpperCase().trim();

  // Return cached connection if it's still open
  if (connections[rid] && connections[rid].readyState === 1) {
    return connections[rid];
  }

  // If the cached connection exists but is disconnected, clean it up
  if (connections[rid]) {
    try { await connections[rid].close(); } catch (_) { /* ignore */ }
    delete connections[rid];
  }

  // Guard against too many open connections
  const activeKeys = Object.keys(connections);
  if (activeKeys.length >= MAX_CONNECTIONS) {
    // Evict the oldest idle connection (simple LRU-like approach)
    const oldest = activeKeys[0];
    try { await connections[oldest].close(); } catch (_) { /* ignore */ }
    delete connections[oldest];
  }

  // Build the database name: aktech_RESTO001
  const dbName = `aktech_${rid}`;

  // Derive the connection URI from MONGO_URI
  // MONGO_URI is expected to end with /aktech or /dbname
  // We replace the last path segment with our per-restaurant DB name
  const baseUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aktech";
  const uri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);

  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 5,
    minPoolSize: 1,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
    serverSelectionTimeoutMS: 15000,
  }).asPromise();

  connections[rid] = conn;

  console.log(`[dbConnection] Connected to database: ${dbName}`);
  return conn;
}

/**
 * Close all cached restaurant connections (for graceful shutdown).
 */
async function closeAllConnections() {
  const entries = Object.entries(connections);
  for (const [rid, conn] of entries) {
    try {
      await conn.close();
      console.log(`[dbConnection] Closed connection for ${rid}`);
    } catch (_) { /* ignore */ }
    delete connections[rid];
  }
}

/**
 * Get the number of active connections (for monitoring / health checks).
 */
function getActiveConnectionCount() {
  return Object.keys(connections).filter(
    (k) => connections[k] && connections[k].readyState === 1
  ).length;
}

module.exports = { getConnection, closeAllConnections, getActiveConnectionCount };
