const SubItem = require("../models/SubItem");

// @desc    Get all sub-items (portions + addon groups)
// @route   GET /api/sub-items
const getSubItems = async (req, res) => {
  try {
    const items = await SubItem.find({}).sort({ type: 1, name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create a sub-item
// @route   POST /api/sub-items
const createSubItem = async (req, res) => {
  try {
    const { type, name, price, maxSelections, addons } = req.body;
    if (!type || !name?.trim()) {
      return res.status(400).json({ message: "Type and name are required" });
    }
    const item = await SubItem.create({
      type,
      name: name.trim(),
      price: Number(price) || 0,
      maxSelections: Number(maxSelections) || 0,
      addons: addons || [],
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update a sub-item
// @route   PUT /api/sub-items/:id
const updateSubItem = async (req, res) => {
  try {
    const { name, price, maxSelections, addons, isAvailable, type } = req.body;
    
    // Prepare update object
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (price !== undefined) update.price = Number(price) || 0;
    if (maxSelections !== undefined) update.maxSelections = Number(maxSelections) || 0;
    if (addons !== undefined) update.addons = addons;
    if (isAvailable !== undefined) update.isAvailable = isAvailable;
    if (type !== undefined) update.type = type;

    const updated = await SubItem.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: "after", runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Sub-item not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a sub-item
// @route   DELETE /api/sub-items/:id
const deleteSubItem = async (req, res) => {
  try {
    const item = await SubItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Sub-item not found" });
    await item.deleteOne();
    res.json({ message: "Sub-item removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSubItems, createSubItem, updateSubItem, deleteSubItem };
