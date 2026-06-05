/** In-memory registry of online print connectors per restaurant. */

const connectorSets = new Map();
const roundRobinIndex = new Map();

function upperRid(rid) {
  return String(rid || "").toUpperCase().trim();
}

function addConnector(restaurantId, socketId) {
  const rid = upperRid(restaurantId);
  if (!rid || !socketId) return;
  if (!connectorSets.has(rid)) connectorSets.set(rid, new Set());
  connectorSets.get(rid).add(socketId);
}

function removeConnector(restaurantId, socketId) {
  const rid = upperRid(restaurantId);
  if (!rid || !socketId) return;
  const set = connectorSets.get(rid);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    connectorSets.delete(rid);
    roundRobinIndex.delete(rid);
  }
}

function getConnectorCount(restaurantId) {
  const rid = upperRid(restaurantId);
  return connectorSets.get(rid)?.size ?? 0;
}

function isConnectorOnline(restaurantId) {
  return getConnectorCount(restaurantId) > 0;
}

/** Pick one connector socket (round-robin) to avoid duplicate prints. */
function pickConnectorSocketId(restaurantId) {
  const rid = upperRid(restaurantId);
  const set = connectorSets.get(rid);
  if (!set || set.size === 0) return null;

  const ids = [...set];
  const idx = roundRobinIndex.get(rid) ?? 0;
  const socketId = ids[idx % ids.length];
  roundRobinIndex.set(rid, idx + 1);
  return socketId;
}

module.exports = {
  addConnector,
  removeConnector,
  getConnectorCount,
  isConnectorOnline,
  pickConnectorSocketId,
};
