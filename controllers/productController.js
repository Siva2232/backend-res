const ProductModel = require("../models/Product");
const { getModel } = require("../utils/getModel");

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  // allow browser/client caching for a short period
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');

  try {
    const Product = await getModel("Product", ProductModel.schema, req.restaurantId);
    const { category, isAvailable, limit, fields } = req.query;
    let queryObj = {};

    if (category) queryObj.category = category;
    if (isAvailable !== undefined) queryObj.isAvailable = isAvailable === 'true';

    let query = Product.find(queryObj).lean();

    // Field selection to reduce payload size
    if (fields) {
      query = query.select(fields.split(',').join(' '));
    }

    if (limit) {
      const limitVal = parseInt(limit, 10);
      if (!isNaN(limitVal)) query = query.limit(limitVal);
    }

    // Sort by name or newest by default
    query = query.sort({ createdAt: -1 });

    const products = await query;
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Server Error fetching products" });
  }
};

// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  const Product = await getModel("Product", ProductModel.schema, req.restaurantId);
  const product = await Product.findById(req.params.id);

  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ message: "Product not found" });
  }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const Product = await getModel("Product", ProductModel.schema, req.restaurantId);
    const { name, price, image, category, description, type, isAvailable, available,
            hasPortions, portions, addonGroups } = req.body;

    if (!name || !price || !image || !category) {
      res.status(400);
      throw new Error("Missing required product fields");
    }

    const product = new Product({
      name,
      price,
      image,
      category,
      description,
      type: type || "",
      stock: req.body.stock || 0,
      isAvailable: isAvailable !== undefined ? isAvailable : (available !== undefined ? available : true),
      hasPortions: hasPortions || false,
      portions: hasPortions && Array.isArray(portions) ? portions : [],
      addonGroups: Array.isArray(addonGroups) ? addonGroups : [],
    });

    const createdProduct = await product.save();

    // Broadcast creation to all clients
    const io = req.app.get('io');
    if (io) {
      io.to(req.restaurantId).emit('productUpdated', createdProduct);
      io.to(req.restaurantId).emit('productsUpdated');
    }

    res.status(201).json(createdProduct);
  } catch (error) {
    console.error("Create product error:", error);
    res.status(res.statusCode === 200 ? 500 : res.statusCode);
    res.json({ message: error.message });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const Product = await getModel("Product", ProductModel.schema, req.restaurantId);
    const { name, price, image, category, description, isAvailable, available, type,
            hasPortions, portions, addonGroups } = req.body;

    // Use findByIdAndUpdate to avoid VersionError (No matching document found for id/version)
    // and bypass Mongoose __v versioning checks which can fail during rapid updates.
    const updatedData = {
      name: name !== undefined ? name : undefined,
      price: price !== undefined ? price : undefined,
      image: image !== undefined ? image : undefined,
      category: category !== undefined ? category : undefined,
      description: description !== undefined ? description : undefined,
      type: type !== undefined ? type : undefined,
      stock: req.body.stock !== undefined ? req.body.stock : undefined,
      isAvailable: isAvailable !== undefined 
        ? isAvailable 
        : (available !== undefined ? available : undefined),
      hasPortions: hasPortions !== undefined ? hasPortions : undefined,
      portions: hasPortions !== undefined ? (hasPortions ? portions : []) : undefined,
      addonGroups: addonGroups !== undefined ? addonGroups : undefined
    };

    // Remove undefined fields so they don't overwrite with null/undefined
    Object.keys(updatedData).forEach(key => updatedData[key] === undefined && delete updatedData[key]);

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updatedData },
      { returnDocument: "after", runValidators: true }
    );

    if (product) {
      // Broadcast update to all clients to refresh products instantly
      const io = req.app.get('io');
      if (io) {
        io.to(req.restaurantId).emit('productUpdated', product); // Emit the specific product that was updated
        io.to(req.restaurantId).emit('productsUpdated'); // General event for bulk refresh if needed
      }

      res.json(product);
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error) {
    console.error("Update product error:", error);
    res.status(res.statusCode === 200 ? 500 : res.statusCode).json({ message: error.message });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  const Product = await getModel("Product", ProductModel.schema, req.restaurantId);
  const product = await Product.findById(req.params.id);

  if (product) {
    const productId = product._id;
    await Product.deleteOne({ _id: productId });
    
    // Broadcast deletion to all clients
    const io = req.app.get('io');
    if (io) {
      io.to(req.restaurantId).emit('productDeleted', productId);
      io.to(req.restaurantId).emit('productsUpdated');
    }
    
    res.json({ message: "Product removed" });
  } else {
    res.status(404).json({ message: "Product not found" });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
