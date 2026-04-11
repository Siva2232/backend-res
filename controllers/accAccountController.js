const AccAccountBaseModel = require('../models/AccAccount');
const { getModel } = require('../utils/getModel');

const AccAccount = async (req) => getModel('AccAccount', AccAccountBaseModel.schema, req.restaurantId);
const { seedAccountsForRestaurant } = require('../utils/accSeeder');

// @route POST /api/acc/accounts/seed
const seedChartOfAccounts = async (req, res) => {
  try {
    await seedAccountsForRestaurant(req.restaurantId);
    res.json({ message: 'Chart of Accounts seeded successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/accounts
const getAccounts = async (req, res) => {
  try {
    const { type, search } = req.query;
    const query = {};
    if (type) query.type = type;
    if (search) query.name = { $regex: search, $options: 'i' };
    const accounts = await (await AccAccount(req)).find(query).sort({ code: 1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/accounts/:id
const getAccount = async (req, res) => {
  try {
    const acc = await (await AccAccount(req)).findById(req.params.id);
    if (!acc) return res.status(404).json({ message: 'Account not found' });
    res.json(acc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/accounts
const createAccount = async (req, res) => {
  try {
    const acc = await (await AccAccount(req)).create(req.body);
    res.status(201).json(acc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route PUT /api/acc/accounts/:id
const updateAccount = async (req, res) => {
  try {
    const acc = await (await AccAccount(req)).findById(req.params.id);
    if (!acc) return res.status(404).json({ message: 'Account not found' });
    if (acc.isSystem && req.body.code) {
      return res.status(400).json({ message: 'Cannot change code of system account.' });
    }
    Object.assign(acc, req.body);
    await acc.save();
    res.json(acc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/accounts/:id
const deleteAccount = async (req, res) => {
  try {
    const acc = await (await AccAccount(req)).findById(req.params.id);
    if (!acc) return res.status(404).json({ message: 'Account not found' });
    if (acc.isSystem) return res.status(400).json({ message: 'Cannot delete a system account.' });
    await acc.deleteOne();
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getAccounts, getAccount, createAccount, updateAccount, deleteAccount, seedChartOfAccounts };
