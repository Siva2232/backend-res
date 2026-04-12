const AccPartyBaseModel = require('../models/AccParty');
const { getModel } = require('../utils/getModel');

const AccParty = async (req) => getModel('AccParty', AccPartyBaseModel.schema, req.restaurantId);

// @desc  Get all parties
// @route GET /api/acc/parties
const getParties = async (req, res) => {
  try {
    const { search, type, page = 1, limit = 50 } = req.query;
    const query = {};
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    if (type) query.type = type;
    const total = await (await AccParty(req)).countDocuments(query);
    const parties = await (await AccParty(req)).find(query)
      .sort({ name: 1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ parties, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/parties/:id
const getParty = async (req, res) => {
  try {
    const party = await (await AccParty(req)).findById(req.params.id);
    if (!party) return res.status(404).json({ message: 'Party not found' });
    res.json(party);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/parties
const createParty = async (req, res) => {
  try {
    const Party = await AccParty(req);
    const party = await Party.create({
      ...req.body,
      balance: req.body.openingBalance || 0,
    });
    res.status(201).json(party);
  } catch (err) {
    console.error("Create party error:", err);
    res.status(400).json({ message: err.message });
  }
};

// @route PUT /api/acc/parties/:id
const updateParty = async (req, res) => {
  try {
    const party = await (await AccParty(req)).findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!party) return res.status(404).json({ message: 'Party not found' });
    res.json(party);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/parties/:id
const deleteParty = async (req, res) => {
  try {
    const party = await (await AccParty(req)).findByIdAndDelete(req.params.id);
    if (!party) return res.status(404).json({ message: 'Party not found' });
    res.json({ message: 'Party deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getParties, getParty, createParty, updateParty, deleteParty };
