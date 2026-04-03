/**
 * Seeds the default Chart of Accounts (system accounts).
 * Called once on server startup if accounts don't exist.
 */
const AccAccount = require('../models/AccAccount');

const DEFAULT_ACCOUNTS = [
  // ── Assets ─────────────────────────────────────────────────────────────────
  { code: '1001', name: 'Cash',                  type: 'Asset',     subType: 'Cash',                 isSystem: true },
  { code: '1002', name: 'Bank',                  type: 'Asset',     subType: 'Bank',                 isSystem: true },
  { code: '1003', name: 'Inventory',             type: 'Asset',     subType: 'Inventory',            isSystem: true },
  { code: '1004', name: 'Accounts Receivable',   type: 'Asset',     subType: 'Accounts Receivable',  isSystem: true },
  { code: '1005', name: 'Advances Receivable',   type: 'Asset',     subType: 'Advances',             isSystem: true },
  // ── Liabilities ────────────────────────────────────────────────────────────
  { code: '2001', name: 'Accounts Payable',      type: 'Liability', subType: 'Accounts Payable',     isSystem: true },
  { code: '2002', name: 'Loans Payable',         type: 'Liability', subType: 'Loans Payable',        isSystem: true },
  { code: '2003', name: 'Customer Advances',     type: 'Liability', subType: 'Customer Advances',    isSystem: true },
  // ── Equity ─────────────────────────────────────────────────────────────────
  { code: '3001', name: "Owner's Capital",       type: 'Equity',    subType: 'Capital',              isSystem: true },
  { code: '3002', name: 'Retained Earnings',     type: 'Equity',    subType: 'Retained Earnings',    isSystem: true },
  // ── Income ─────────────────────────────────────────────────────────────────
  { code: '4001', name: 'Sales Revenue',         type: 'Income',    subType: 'Sales',                isSystem: true },
  { code: '4002', name: 'Beverage Sales',        type: 'Income',    subType: 'Beverage Sales',       isSystem: true },
  { code: '4003', name: 'Other Income',          type: 'Income',    subType: 'Other Income',         isSystem: true },
  // ── Expenses ───────────────────────────────────────────────────────────────
  { code: '5001', name: 'Purchase Cost',         type: 'Expense',   subType: 'Purchase Cost',        isSystem: true },
  { code: '5002', name: 'Salary Expense',        type: 'Expense',   subType: 'Salary',               isSystem: true },
  { code: '5003', name: 'Rent Expense',          type: 'Expense',   subType: 'Rent',                 isSystem: true },
  { code: '5004', name: 'Utilities Expense',     type: 'Expense',   subType: 'Utilities',            isSystem: true },
  { code: '5005', name: 'Other Expenses',        type: 'Expense',   subType: 'Other Expenses',       isSystem: true },
  { code: '5006', name: 'Tax Expense',           type: 'Expense',   subType: 'Taxes',                isSystem: true },
];

const seedAccounts = async () => {
  try {
    const existing = await AccAccount.countDocuments({ isSystem: true });
    if (existing >= DEFAULT_ACCOUNTS.length) {
      console.log('[Accounting] Chart of Accounts already seeded.');
      return;
    }
    for (const acc of DEFAULT_ACCOUNTS) {
      await AccAccount.findOneAndUpdate(
        { code: acc.code },
        { $setOnInsert: acc },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    console.log('[Accounting] Default Chart of Accounts seeded successfully.');
  } catch (err) {
    console.error('[Accounting] Seeding failed:', err.message);
  }
};

module.exports = { seedAccounts, DEFAULT_ACCOUNTS };
