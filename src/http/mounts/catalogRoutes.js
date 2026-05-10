const productRoutes = require("../../../routes/productRoutes");
const categoryRoutes = require("../../../routes/categoryRoutes");
const bannerRoutes = require("../../../routes/bannerRoutes");
const offerRoutes = require("../../../routes/offerRoutes");
const subItemRoutes = require("../../../routes/subItemRoutes");
const { tenantMiddleware } = require("../../../middleware/tenantMiddleware");

function mountCatalogRoutes(app) {
  app.use("/api/products", tenantMiddleware, productRoutes);
  app.use("/api/categories", tenantMiddleware, categoryRoutes);
  app.use("/api/banners", tenantMiddleware, bannerRoutes);
  app.use("/api/offers", tenantMiddleware, offerRoutes);
  app.use("/api/sub-items", tenantMiddleware, subItemRoutes);
}

module.exports = { mountCatalogRoutes };
