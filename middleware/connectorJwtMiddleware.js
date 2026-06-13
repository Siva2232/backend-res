const jwt = require("jsonwebtoken");
const ConnectorDevice = require("../models/ConnectorDevice");

function upperRid(rid) {
  return String(rid || "").toUpperCase().trim();
}

function signConnectorToken(connector) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign(
    {
      type: "connector",
      connectorId: connector.connectorId,
      restaurantId: upperRid(connector.restaurantId),
    },
    process.env.JWT_SECRET,
    { expiresIn: "365d" }
  );
}

function verifyConnectorToken(token) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== "connector" || !decoded.connectorId) {
    throw new Error("Invalid connector token");
  }
  return decoded;
}

async function protectConnectorJwt(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing connector authorization" });
    }

    const token = auth.split(" ")[1];
    const decoded = verifyConnectorToken(token);

    const connector = await ConnectorDevice.findOne({
      connectorId: decoded.connectorId,
      isRevoked: false,
    });

    if (!connector) {
      return res.status(401).json({ message: "Connector not found or revoked" });
    }

    if (upperRid(connector.restaurantId) !== upperRid(decoded.restaurantId)) {
      return res.status(403).json({ message: "Connector restaurant mismatch" });
    }

    req.connector = connector;
    req.connectorJwt = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: err.message || "Invalid connector token" });
  }
}

module.exports = {
  protectConnectorJwt,
  signConnectorToken,
  verifyConnectorToken,
  upperRid,
};
