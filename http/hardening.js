/**
 * Baseline Express hardening (Helmet is applied separately).
 */
function applyHardening(app) {
  app.disable("x-powered-by");
}

module.exports = { applyHardening };
