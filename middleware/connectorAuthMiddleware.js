/**
 * Very small auth layer for on-prem print connector clients.
 *
 * The connector runs in a restaurant LAN and must authenticate to receive jobs.
 * We use a shared secret token per restaurant (issued by your SaaS) and the restaurantId.
 *
 * Headers supported:
 * - X-Connector-Token: <token>
 * - X-Restaurant-Id: <restaurantId>
 */

function upperRid(rid) {
  return String(rid || "").toUpperCase().trim();
}

function protectConnector(req, res, next) {
  const token = String(req.headers["x-connector-token"] || "").trim();
  const rid = upperRid(req.headers["x-restaurant-id"]);

  const expected = String(process.env.PRINT_CONNECTOR_TOKEN || "").trim();
  if (!expected) {
    return res.status(500).json({ message: "Connector auth not configured" });
  }

  if (!token || token !== expected) {
    return res.status(401).json({ message: "Invalid connector token" });
  }
  if (!rid) {
    return res.status(400).json({ message: "Missing X-Restaurant-Id" });
  }

  req.connectorRestaurantId = rid;
  next();
}

module.exports = { protectConnector };

