const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Controllers
const { getParties, getParty, createParty, updateParty, deleteParty } = require('../controllers/accPartyController');
const { getAccounts, getAccount, createAccount, updateAccount, deleteAccount, seedChartOfAccounts } = require('../controllers/accAccountController');
const { getOrders, getOrder, createOrder, updateOrder, deleteOrder } = require('../controllers/accOrderController');
const { getPurchases, getPurchase, createPurchase, updatePurchase, deletePurchase } = require('../controllers/accPurchaseController');
const { getExpenses, getExpense, createExpense, updateExpense, deleteExpense } = require('../controllers/accExpenseController');
const { getLoans, getLoan, createLoan, updateLoan, deleteLoan } = require('../controllers/accLoanController');
const { getPayments, createPayment, deletePayment } = require('../controllers/accPaymentController');
const { getLedgerEntries, getAccountStatement } = require('../controllers/accLedgerController');
const { getProfitLoss, getBalanceSheet, getAgingReport, getDailyClosing, getPartyStatement } = require('../controllers/accReportController');

// All accounting routes require admin login
router.use(protect);

// ── Seed ────────────────────────────────────────────────────────────────────
router.post('/accounts/seed', seedChartOfAccounts);

// ── Parties ──────────────────────────────────────────────────────────────────
router.route('/parties').get(getParties).post(createParty);
router.route('/parties/:id').get(getParty).put(updateParty).delete(deleteParty);

// ── Chart of Accounts ────────────────────────────────────────────────────────
router.route('/accounts').get(getAccounts).post(createAccount);
router.route('/accounts/:id').get(getAccount).put(updateAccount).delete(deleteAccount);

// ── Sales Orders ─────────────────────────────────────────────────────────────
router.route('/orders').get(getOrders).post(createOrder);
router.route('/orders/:id').get(getOrder).put(updateOrder).delete(deleteOrder);

// ── Purchases ────────────────────────────────────────────────────────────────
router.route('/purchases').get(getPurchases).post(createPurchase);
router.route('/purchases/:id').get(getPurchase).put(updatePurchase).delete(deletePurchase);

// ── Expenses ─────────────────────────────────────────────────────────────────
router.route('/expenses').get(getExpenses).post(createExpense);
router.route('/expenses/:id').get(getExpense).put(updateExpense).delete(deleteExpense);

// ── Loans / Advances ─────────────────────────────────────────────────────────
router.route('/loans').get(getLoans).post(createLoan);
router.route('/loans/:id').get(getLoan).put(updateLoan).delete(deleteLoan);

// ── Payments ─────────────────────────────────────────────────────────────────
router.route('/payments').get(getPayments).post(createPayment);
router.route('/payments/:id').delete(deletePayment);

// ── Ledger ───────────────────────────────────────────────────────────────────
router.get('/ledger', getLedgerEntries);
router.get('/ledger/account/:id', getAccountStatement);

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/pl', getProfitLoss);
router.get('/reports/balance-sheet', getBalanceSheet);
router.get('/reports/aging', getAgingReport);
router.get('/reports/daily', getDailyClosing);
router.get('/reports/party/:id', getPartyStatement);

module.exports = router;
