const TableModel = require("../models/Table");
const { getModel } = require("../utils/getModel");

const Table = (req) => getModel("Table", TableModel.schema, req.restaurantId);

// @desc    Get all tables
// @route   GET /api/tables
// @access  Private/Admin
const getTables = async (req, res) => {
  const tables = await Table(req).find({ isActive: true }).sort({ tableId: 1 });
  res.json(tables.map(t => ({ id: t.tableId, capacity: t.capacity })));
};

// @desc    Add a new table
// @route   POST /api/tables
// @access  Private/Admin
const addTable = async (req, res) => {
  const { id, capacity } = req.body;

  const tableExists = await Table(req).findOne({ tableId: id });

  if (tableExists) {
    if (tableExists.isActive) {
      res.status(400);
      throw new Error("Table already exists");
    } else {
      tableExists.isActive = true;
      tableExists.capacity = capacity || 4;
      const updatedTable = await tableExists.save();
      res.status(201).json({ id: updatedTable.tableId, capacity: updatedTable.capacity });
      return;
    }
  }

  const table = await Table(req).create({
    tableId: id,
    capacity: capacity || 4,
  });

  if (table) {
    res.status(201).json({ id: table.tableId, capacity: table.capacity });
  } else {
    res.status(400);
    throw new Error("Invalid table data");
  }
};

// @desc    Remove a table (soft delete)
// @route   DELETE /api/tables/:id
// @access  Private/Admin
const removeTable = async (req, res) => {
  const tableId = Number(req.params.id);
  if (Number.isNaN(tableId)) {
    res.status(400);
    throw new Error("Invalid table id");
  }

  const table = await Table(req).findOne({ tableId });

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
  addTable,
  removeTable,
};
