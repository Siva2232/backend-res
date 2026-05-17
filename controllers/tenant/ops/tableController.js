const TableModel = require("../../../models/Table");
const TableCategoryModel = require("../../../models/TableCategory");
const { getModel } = require("../../../utils/getModel");
const { getPlanLimits } = require("../../../utils/subscriptionLimits");

function mapTableDoc(t) {
  const cat = t.category;
  const categoryId =
    cat && typeof cat === "object" && cat._id != null
      ? String(cat._id)
      : cat
        ? String(cat)
        : null;
  const categoryName =
    cat && typeof cat === "object" && cat.name != null ? cat.name : null;
  return {
    id: t.tableId,
    capacity: t.capacity,
    categoryId,
    categoryName,
  };
}

// @desc    Get all tables and area categories
// @route   GET /api/tables
// @access  Public (tenant-scoped)
const getTables = async (req, res) => {
  const Table = await getModel("Table", TableModel.schema, req.restaurantId);
  const TableCategory = await getModel(
    "TableCategory",
    TableCategoryModel.schema,
    req.restaurantId
  );

  const [categories, tables] = await Promise.all([
    TableCategory.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean(),
    Table.find({ isActive: true })
      .populate("category", "name")
      .sort({ tableId: 1 }),
  ]);

  res.json({
    categories: categories.map((c) => ({
      id: String(c._id),
      name: c.name,
      sortOrder: c.sortOrder ?? 0,
    })),
    tables: tables.map(mapTableDoc),
  });
};

// @desc    Create a table area (Floor, Outdoor, etc.)
// @route   POST /api/tables/categories
// @access  Private/Admin or Waiter
const createTableCategory = async (req, res) => {
  const TableCategory = await getModel(
    "TableCategory",
    TableCategoryModel.schema,
    req.restaurantId
  );
  const name = String(req.body.name || "").trim();

  if (!name) {
    res.status(400);
    throw new Error("Area name is required");
  }

  const existing = await TableCategory.findOne({
    name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (existing) {
    if (existing.isActive) {
      res.status(400);
      throw new Error("Area already exists");
    }
    existing.isActive = true;
    existing.name = name;
    const restored = await existing.save();
    return res.status(201).json({
      id: String(restored._id),
      name: restored.name,
      sortOrder: restored.sortOrder ?? 0,
    });
  }

  const count = await TableCategory.countDocuments({ isActive: true });
  const created = await TableCategory.create({
    name,
    sortOrder: count,
  });

  res.status(201).json({
    id: String(created._id),
    name: created.name,
    sortOrder: created.sortOrder ?? 0,
  });
};

// @desc    Delete a table area (tables in this area become uncategorized)
// @route   DELETE /api/tables/categories/:id
// @access  Private/Admin
const deleteTableCategory = async (req, res) => {
  const Table = await getModel("Table", TableModel.schema, req.restaurantId);
  const TableCategory = await getModel(
    "TableCategory",
    TableCategoryModel.schema,
    req.restaurantId
  );

  const category = await TableCategory.findById(req.params.id);
  if (!category || !category.isActive) {
    res.status(404);
    throw new Error("Area not found");
  }

  category.isActive = false;
  await category.save();
  await Table.updateMany({ category: category._id }, { $unset: { category: "" } });

  res.json({ message: "Area removed" });
};

// @desc    Add a new table
// @route   POST /api/tables
// @access  Private/Admin or Waiter
const addTable = async (req, res) => {
  const Table = await getModel("Table", TableModel.schema, req.restaurantId);
  const TableCategory = await getModel(
    "TableCategory",
    TableCategoryModel.schema,
    req.restaurantId
  );
  const { id, capacity, categoryId } = req.body;

  let category = null;
  if (categoryId) {
    category = await TableCategory.findOne({
      _id: categoryId,
      isActive: true,
    });
    if (!category) {
      res.status(400);
      throw new Error("Invalid table area");
    }
  }

  const limits = getPlanLimits(req.restaurant);
  const activeCount = await Table.countDocuments({ isActive: true });

  const tableExists = await Table.findOne({ tableId: id });

  if (tableExists) {
    if (tableExists.isActive) {
      res.status(400);
      throw new Error("Table already exists");
    }
    if (activeCount >= limits.maxTables) {
      res.status(403);
      throw new Error(
        `Your plan allows up to ${limits.maxTables} tables. Remove a table or upgrade your subscription.`
      );
    }
    tableExists.isActive = true;
    tableExists.capacity = capacity || 4;
    tableExists.category = category ? category._id : null;
    const updatedTable = await tableExists.save();
    const saved = await Table.findById(updatedTable._id).populate(
      "category",
      "name"
    );
    res.status(201).json(mapTableDoc(saved));
    return;
  }

  if (activeCount >= limits.maxTables) {
    res.status(403);
    throw new Error(
      `Your plan allows up to ${limits.maxTables} tables. Remove a table or upgrade your subscription.`
    );
  }

  const table = await Table.create({
    tableId: id,
    capacity: capacity || 4,
    category: category ? category._id : null,
  });

  if (table) {
    const populated = await Table.findById(table._id).populate(
      "category",
      "name"
    );
    res.status(201).json(mapTableDoc(populated));
  } else {
    res.status(400);
    throw new Error("Invalid table data");
  }
};

// @desc    Update table (area or capacity)
// @route   PATCH /api/tables/:id
// @access  Private/Admin or Waiter
const updateTable = async (req, res) => {
  const Table = await getModel("Table", TableModel.schema, req.restaurantId);
  const TableCategory = await getModel(
    "TableCategory",
    TableCategoryModel.schema,
    req.restaurantId
  );
  const tableId = Number(req.params.id);
  if (Number.isNaN(tableId)) {
    res.status(400);
    throw new Error("Invalid table id");
  }

  const table = await Table.findOne({ tableId, isActive: true });
  if (!table) {
    res.status(404);
    throw new Error("Table not found");
  }

  if (req.body.capacity !== undefined) {
    const cap = Number(req.body.capacity);
    if (!Number.isFinite(cap) || cap < 1) {
      res.status(400);
      throw new Error("Invalid capacity");
    }
    table.capacity = cap;
  }

  if (req.body.categoryId !== undefined) {
    if (req.body.categoryId === null || req.body.categoryId === "") {
      table.category = null;
    } else {
      const category = await TableCategory.findOne({
        _id: req.body.categoryId,
        isActive: true,
      });
      if (!category) {
        res.status(400);
        throw new Error("Invalid table area");
      }
      table.category = category._id;
    }
  }

  await table.save();
  const populated = await Table.findById(table._id).populate("category", "name");
  res.json(mapTableDoc(populated));
};

// @desc    Remove a table (soft delete)
// @route   DELETE /api/tables/:id
// @access  Private/Admin
const removeTable = async (req, res) => {
  const Table = await getModel("Table", TableModel.schema, req.restaurantId);
  const tableId = Number(req.params.id);
  if (Number.isNaN(tableId)) {
    res.status(400);
    throw new Error("Invalid table id");
  }

  const table = await Table.findOne({ tableId });

  if (table) {
    table.isActive = false;
    await table.save();
    res.json({ message: "Table removed" });
  } else {
    res.status(404);
    throw new Error("Table not found");
  }
};

module.exports = {
  getTables,
  createTableCategory,
  deleteTableCategory,
  addTable,
  updateTable,
  removeTable,
};
