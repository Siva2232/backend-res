/**
 * Dynamic Per-Restaurant Database Connection Manager
 * ====================================================
 * Each restaurant has its own MongoDB database: aktech_RESTO001, aktech_RESTO002, …
 *
 * Connections are cached in-process. With many restaurants, cache size is bounded
 * by TENANT_DB_MAX_CONNECTIONS; least-recently-used tenants are evicted (LRU),
 * not arbitrary map order (which previously caused instability under load).
 */

const mongoose = require("mongoose");

/** @type {Record<string, import('mongoose').Connection>} */
const connections = {};

/** @type {Record<string, number>} Last successful use time (ms) for LRU eviction */
const lastUsed = {};

function maxTenantConnections() {
  const n = parseInt(process.env.TENANT_DB_MAX_CONNECTIONS || "128", 10);
  return Number.isFinite(n) && n >= 8 ? n : 128;
}

function tenantPoolMax() {
  const n = parseInt(process.env.TENANT_DB_POOL_MAX || "5", 10);
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : 5;
}

function touch(rid) {
  lastUsed[rid] = Date.now();
}

/**
 * Evict the tenant connection that was used longest ago (true LRU among cached keys).
 */
async function evictLeastRecentlyUsed() {
  let oldestRid = null;
  let oldestT = Infinity;
  for (const k of Object.keys(connections)) {
    const t = lastUsed[k] ?? 0;
    if (t < oldestT) {
      oldestT = t;
      oldestRid = k;
    }
  }
  if (!oldestRid) return;
  try {
    await connections[oldestRid].close();
  } catch (_) {
    /* ignore */
  }
  delete connections[oldestRid];
  delete lastUsed[oldestRid];
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[dbConnection] LRU evicted idle tenant DB connection: ${oldestRid}`);
  }
}

function wireConnectionLifecycle(conn, rid) {
  conn.on("error", (err) => {
    console.error(`[dbConnection] tenant ${rid} Mongo error:`, err.message);
  });
  conn.on("close", () => {
    if (connections[rid] === conn) {
      delete connections[rid];
      delete lastUsed[rid];
    }
  });
}

/**
 * Returns a cached (or new) Mongoose connection for the given restaurant.
 *
 * @param {string} restaurantId - e.g. "RESTO001"
 * @returns {Promise<import('mongoose').Connection>}
 */
async function getConnection(restaurantId) {
  if (!restaurantId) {
    throw new Error("[getConnection] restaurantId is required");
  }

  const rid = String(restaurantId).toUpperCase().trim();
  const maxConn = maxTenantConnections();

  if (connections[rid] && connections[rid].readyState === 1) {
    touch(rid);
    return connections[rid];
  }

  if (connections[rid]) {
    try {
      await connections[rid].close();
    } catch (_) {
      /* ignore */
    }
    delete connections[rid];
    delete lastUsed[rid];
  }

  if (Object.keys(connections).length >= maxConn) {
    await evictLeastRecentlyUsed();
  }

  const dbName = `aktech_${rid}`;
  const baseUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aktech";
  const uri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);

  const poolMax = tenantPoolMax();
  const conn = await mongoose
    .createConnection(uri, {
      maxPoolSize: poolMax,
      minPoolSize: 1,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      serverSelectionTimeoutMS: 15000,
      heartbeatFrequencyMS: 10000,
      retryReads: true,
      retryWrites: true,
    })
    .asPromise();

  wireConnectionLifecycle(conn, rid);
  connections[rid] = conn;
  touch(rid);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[dbConnection] Connected to database: ${dbName} (cached tenants: ${Object.keys(connections).length}/${maxConn})`);
  }
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
      if (process.env.NODE_ENV !== "production") {
        console.log(`[dbConnection] Closed connection for ${rid}`);
      }
    } catch (_) {
      /* ignore */
    }
    delete connections[rid];
    delete lastUsed[rid];
  }
}

function getActiveConnectionCount() {
  return Object.keys(connections).filter((k) => connections[k] && connections[k].readyState === 1).length;
}

/** Introspection for ops / health dashboards */
function getTenantConnectionStats() {
  const maxConn = maxTenantConnections();
  const keys = Object.keys(connections);
  return {
    cachedTenantCount: keys.length,
    activeReadyCount: getActiveConnectionCount(),
    maxTenantConnections: maxConn,
    poolMaxPerTenant: tenantPoolMax(),
  };
}

module.exports = {
  getConnection,
  closeAllConnections,
  getActiveConnectionCount,
  getTenantConnectionStats,
};
