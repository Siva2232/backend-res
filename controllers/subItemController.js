const SubItem = require("../models/SubItem");
const Product = require("../models/Product");

// @desc    Get all sub-items (portions + addon groups)
// @route   GET /api/sub-items
const getSubItems = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.category) filter.category = req.query.category;

    const items = await SubItem.find(filter).sort({ type: 1, name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create a sub-item (supports single or bulk via category)
// @route   POST /api/sub-items
const createSubItem = async (req, res) => {
  try {
    const { type, name, price, maxSelections, addons, category, items } = req.body;

    // Bulk creation mode
    if (items && Array.isArray(items) && category) {
      if (!type) {
        return res.status(400).json({ message: "Type is required for bulk creation" });
      }

      const createdItems = await Promise.all(
        items.map((item) => {
          const payload = {
            type,
            name: item.name.trim(),
            category: category.trim(),
            isAvailable: true,
          };

          if (type === "portion") {
            payload.price = Number(item.price) || 0;
          } else if (type === "addonGroup") {
            // Bulk adding addon groups from library:
            // "item" in the bulk loop represents a single row from the modal.
            // The user enters name (e.g. "Ketchup") and price (e.g. 10).
            // This should be an addon entry INSIDE the group.
            payload.name = category.trim(); // The group name is the bulk category
            payload.category = ""; // Clear category so it doesn't group itself
            payload.addons = [{ name: item.name.trim(), price: Number(item.price) || 0 }];
            payload.maxSelections = 0;
          }

          return SubItem.create(payload);
        })
      );
      
      const io = req.app.get('io');
      if (io) io.emit('subItemsUpdated');

      return res.status(201).json(createdItems);
    }

    if (!type || !name?.trim()) {
      return res.status(400).json({ message: "Type and name are required" });
    }
    const item = await SubItem.create({
      type,
      name: name.trim(),
      price: Number(price) || 0,
      maxSelections: Number(maxSelections) || 0,
      addons: addons || [],
      category: category ? category.trim() : undefined,
    });
    
    const io = req.app.get('io');
    if (io) io.emit('subItemsUpdated');
    
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update a sub-item
// @route   PUT /api/sub-items/:id
const updateSubItem = async (req, res) => {
  try {
    const { name, price, maxSelections, addons, isAvailable, type, category } = req.body;
    
    // Previous original sub-item
    const originalItem = await SubItem.findById(req.params.id);
    if (!originalItem) return res.status(404).json({ message: "Sub-item not found" });

    // Prepare update object
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (price !== undefined) update.price = Number(price) || 0;
    if (maxSelections !== undefined) update.maxSelections = Number(maxSelections) || 0;
    if (addons !== undefined) update.addons = addons;
    if (isAvailable !== undefined) update.isAvailable = isAvailable;
    if (type !== undefined) update.type = type;
    if (category !== undefined) update.category = category ? category.trim() : undefined;

    const updated = await SubItem.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: "after", runValidators: true }
    );

    // Sync with existing products 
    // If availability changed or name/price changed, we need to reflect that in all products that use this library item
    if (isAvailable !== undefined || name || price !== undefined || addons || maxSelections !== undefined) {
      const oldName = originalItem.name;
      const newName = (name && name.trim()) || oldName;

      // 1. Handle Portions
      if (originalItem.type === "portion") {
        const updateFields = {};
        if (isAvailable !== undefined) updateFields["portions.$.isAvailable"] = isAvailable;
        if (name) updateFields["portions.$.name"] = newName;
        if (price !== undefined) updateFields["portions.$.price"] = Number(price);

        if (Object.keys(updateFields).length > 0) {
          await Product.updateMany(
            { "portions.name": oldName },
            { $set: updateFields }
          );
        }
      }

      // 2. Handle Addon Groups
      if (originalItem.type === "addonGroup") {
        const updateFields = {};
        if (isAvailable !== undefined) updateFields["addonGroups.$.isAvailable"] = isAvailable;
        if (name) updateFields["addonGroups.$.name"] = newName;
        if (maxSelections !== undefined) updateFields["addonGroups.$.maxSelections"] = Number(maxSelections);
        if (addons !== undefined) updateFields["addonGroups.$.addons"] = addons;

        if (Object.keys(updateFields).length > 0) {
          await Product.updateMany(
            { "addonGroups.name": oldName },
            { $set: updateFields }
          );
        }
      }

      // Broadcast update to all clients to refresh products instantly
      const io = req.app.get('io');
      if (io) {
        io.emit('subItemUpdated', updated);
        io.emit('productsUpdated');
        io.emit('subItemsUpdated');
      }
    }

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

    // Sync: Remove/Update from all products before deleting from library
    const oldName = item.name;
    const type = item.type;
    
    if (type === "portion") {
      await Product.updateMany(
        { "portions.name": oldName },
        { $pull: { portions: { name: oldName } } }
      );
    } else {
      await Product.updateMany(
        { "addonGroups.name": oldName },
        { $pull: { addonGroups: { name: oldName } } }
      );
    }

    await item.deleteOne();

    // Broadcast update to all clients to refresh products instantly
    const io = req.app.get('io');
    if (io) {
      io.emit('subItemDeleted', { id: req.params.id, type, name: oldName });
      io.emit('productsUpdated');
      io.emit('subItemsUpdated');
    }

    res.json({ message: "Sub-item removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateSubItemStatus = async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const item = await SubItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Sub-item not found" });

    const updated = await SubItem.findByIdAndUpdate(
      req.params.id,
      { $set: { isAvailable } },
      { returnDocument: "after" }
    );

    const oldName = item.name;
    if (item.type === "portion") {
      await Product.updateMany(
        { "portions.name": oldName },
        { $set: { "portions.$.isAvailable": isAvailable } }
      );
    } else {
      await Product.updateMany(
        { "addonGroups.name": oldName },
        { $set: { "addonGroups.$.isAvailable": isAvailable } }
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('subItemUpdated', updated);
      io.emit('productsUpdated');
      io.emit('subItemsUpdated');
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSubItems, createSubItem, updateSubItem, deleteSubItem, updateSubItemStatus };
