/**
 * Required when running behind nginx, Render, Railway, etc., so rate limiting and IPs are correct.
 */
function applyTrustProxy(app) {
  if (process.env.NODE_ENV === "production") {
    const hops = Number(process.env.TRUST_PROXY_HOPS);
    app.set("trust proxy", Number.isFinite(hops) && hops >= 0 ? hops : 1);
  }
}

module.exports = { applyTrustProxy };
