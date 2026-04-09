/**
 * Accounting Ledger Utilities
 * Handles double-entry bookkeeping logic and system account lookup.
 * All functions require restaurantId for per-restaurant DB isolation.
 */
const AccAccountModel = require('../models/AccAccount');
const AccLedgerEntryModel = require('../models/AccLedgerEntry');
const { getModel } = require('./getModel');

const uuidv4 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// System account codes (seeded on startup)
const CODES = {
  CASH: '1001',
  BANK: '1002',
  INVENTORY: '1003',
  ACCOUNTS_RECEIVABLE: '1004',
  ADVANCES_RECEIVABLE: '1005',
  ACCOUNTS_PAYABLE: '2001',
  LOANS_PAYABLE: '2002',
  CUSTOMER_ADVANCES: '2003',
  CAPITAL: '3001',
  SALES: '4001',
  BEVERAGE_SALES: '4002',
  OTHER_INCOME: '4003',
  PURCHASE_COST: '5001',
  SALARY: '5002',
  RENT: '5003',
  UTILITIES: '5004',
  OTHER_EXPENSES: '5005',
  TAXES: '5006',
};

// Map expense category name → account code
const EXPENSE_CATEGORY_CODE = {
  'Salary': CODES.SALARY,
  'Rent': CODES.RENT,
  'Utilities': CODES.UTILITIES,
  'Purchase Cost': CODES.PURCHASE_COST,
  'Other Expenses': CODES.OTHER_EXPENSES,
  'Taxes': CODES.TAXES,
};

const getAccount = async (code, restaurantId) => {
  const AccAccount = await getModel('AccAccount', AccAccountModel.schema, restaurantId);
  const acc = await AccAccount.findOne({ code });
  if (!acc) throw new Error(`System account not found: code=${code}. Run /api/acc/accounts/seed first.`);
  return acc;
};

/**
 * Create double-entry pairs and update account balances.
 * entries: [{ account: ObjectId, debit, credit, description, party }]
 */
const createLedgerEntries = async (entries, refModel, refId, party, session, restaurantId) => {
  const AccLedgerEntry = await getModel('AccLedgerEntry', AccLedgerEntryModel.schema, restaurantId);
  const AccAccount = await getModel('AccAccount', AccAccountModel.schema, restaurantId);
  const txnId = uuidv4();
  const created = [];
  for (const e of entries) {
    const opts = session ? { session } : {};
    const [doc] = await AccLedgerEntry.create(
      [{ ...e, txnId, refModel, refId, party: party || e.party, date: e.date || new Date() }],
      opts
    );
    created.push(doc);
    // Update account running balance
    // For Assets/Expenses: debit increases balance, credit decreases
    // For Liabilities/Equity/Income: credit increases balance, debit decreases
    const acc = await AccAccount.findById(e.account);
    if (acc) {
      const isDebitNormal = acc.type === 'Asset' || acc.type === 'Expense';
      const delta = isDebitNormal ? (e.debit - e.credit) : (e.credit - e.debit);
      acc.balance += delta;
      await acc.save(opts);
    }
  }
  return created;
};

/**
 * Build ledger entries for a Sales Order.
 * paymentMode used only when paidAmount > 0.
 */
const buildSalesEntries = async ({ totalAmount, paidAmount, balance, paymentMode, date, restaurantId }) => {
  const salesAcc = await getAccount(CODES.SALES, restaurantId);
  const cashAcc = await getAccount(paymentMode === 'Bank' ? CODES.BANK : CODES.CASH, restaurantId);
  const arAcc = await getAccount(CODES.ACCOUNTS_RECEIVABLE, restaurantId);

  const entries = [];
  // Credit: Sales
  entries.push({ account: salesAcc._id, debit: 0, credit: totalAmount, description: 'Sales revenue', date });
  // Debit: Cash/Bank (paid portion)
  if (paidAmount > 0) {
    entries.push({ account: cashAcc._id, debit: paidAmount, credit: 0, description: `Payment received (${paymentMode || 'Cash'})`, date });
  }
  // Debit: Accounts Receivable (unpaid portion)
  if (balance > 0) {
    entries.push({ account: arAcc._id, debit: balance, credit: 0, description: 'Accounts receivable', date });
  }
  return entries;
};

/**
 * Build ledger entries for a Purchase.
 */
const buildPurchaseEntries = async ({ totalAmount, paidAmount, balance, paymentMode, date, restaurantId }) => {
  const purchaseAcc = await getAccount(CODES.PURCHASE_COST, restaurantId);
  const cashAcc = await getAccount(paymentMode === 'Bank' ? CODES.BANK : CODES.CASH, restaurantId);
  const apAcc = await getAccount(CODES.ACCOUNTS_PAYABLE, restaurantId);

  const entries = [];
  // Debit: Purchase Cost
  entries.push({ account: purchaseAcc._id, debit: totalAmount, credit: 0, description: 'Purchase cost', date });
  // Credit: Cash/Bank (paid portion)
  if (paidAmount > 0) {
    entries.push({ account: cashAcc._id, debit: 0, credit: paidAmount, description: `Payment made (${paymentMode || 'Cash'})`, date });
  }
  // Credit: Accounts Payable (unpaid portion)
  if (balance > 0) {
    entries.push({ account: apAcc._id, debit: 0, credit: balance, description: 'Accounts payable', date });
  }
  return entries;
};

/**
 * Build ledger entries for an Expense.
 */
const buildExpenseEntries = async ({ category, totalAmount, paidAmount, balance, paymentMode, date, restaurantId }) => {
  const code = EXPENSE_CATEGORY_CODE[category] || CODES.OTHER_EXPENSES;
  const expenseAcc = await getAccount(code, restaurantId);
  const cashAcc = await getAccount(paymentMode === 'Bank' ? CODES.BANK : CODES.CASH, restaurantId);
  const apAcc = await getAccount(CODES.ACCOUNTS_PAYABLE, restaurantId);

  const entries = [];
  entries.push({ account: expenseAcc._id, debit: totalAmount, credit: 0, description: `Expense: ${category}`, date });
  if (paidAmount > 0) {
    entries.push({ account: cashAcc._id, debit: 0, credit: paidAmount, description: `Payment made (${paymentMode || 'Cash'})`, date });
  }
  if (balance > 0) {
    entries.push({ account: apAcc._id, debit: 0, credit: balance, description: 'Accounts payable', date });
  }
  return entries;
};

/**
 * Build ledger entries for Loans / Capital / Advances.
 */
const buildLoanEntries = async ({ type, amount, paymentMode, date, restaurantId }) => {
  const cashAcc = await getAccount(CODES.CASH, restaurantId);
  const entries = [];
  switch (type) {
    case 'LoanTaken': {
      const loanAcc = await getAccount(CODES.LOANS_PAYABLE, restaurantId);
      entries.push({ account: cashAcc._id, debit: amount, credit: 0, description: 'Loan received', date });
      entries.push({ account: loanAcc._id, debit: 0, credit: amount, description: 'Loan payable', date });
      break;
    }
    case 'LoanRepayment': {
      const loanAcc = await getAccount(CODES.LOANS_PAYABLE, restaurantId);
      entries.push({ account: loanAcc._id, debit: amount, credit: 0, description: 'Loan repayment', date });
      entries.push({ account: cashAcc._id, debit: 0, credit: amount, description: 'Cash paid for loan', date });
      break;
    }
    case 'CapitalInjection': {
      const capAcc = await getAccount(CODES.CAPITAL, restaurantId);
      entries.push({ account: cashAcc._id, debit: amount, credit: 0, description: 'Capital injected', date });
      entries.push({ account: capAcc._id, debit: 0, credit: amount, description: 'Owner capital', date });
      break;
    }
    case 'VendorAdvance':
    case 'EmployeeAdvance': {
      const advAcc = await getAccount(CODES.ADVANCES_RECEIVABLE, restaurantId);
      entries.push({ account: advAcc._id, debit: amount, credit: 0, description: `${type} given`, date });
      entries.push({ account: cashAcc._id, debit: 0, credit: amount, description: 'Cash paid for advance', date });
      break;
    }
    case 'CustomerAdvance': {
      const custAdvAcc = await getAccount(CODES.CUSTOMER_ADVANCES, restaurantId);
      entries.push({ account: cashAcc._id, debit: amount, credit: 0, description: 'Customer advance received', date });
      entries.push({ account: custAdvAcc._id, debit: 0, credit: amount, description: 'Customer advance liability', date });
      break;
    }
    default:
      break;
  }
  return entries;
};

/**
 * Build ledger entries for recording a Payment against an existing doc.
 * direction: 'receive' (order/incoming) | 'pay' (purchase/expense/outgoing)
 */
const buildPaymentEntries = async ({ amount, mode, direction, arOrApAccountCode, date, restaurantId }) => {
  const code = arOrApAccountCode;
  const contraAcc = await getAccount(code, restaurantId);
  const cashAcc = await getAccount(CODES.CASH, restaurantId);
  const entries = [];
  if (direction === 'receive') {
    // Customer pays → Cash in, AR out
    entries.push({ account: cashAcc._id, debit: amount, credit: 0, description: `Payment received (${mode})`, date });
    entries.push({ account: contraAcc._id, debit: 0, credit: amount, description: 'Accounts receivable cleared', date });
  } else {
    // We pay supplier/vendor → Cash out, AP out
    entries.push({ account: contraAcc._id, debit: amount, credit: 0, description: 'Accounts payable cleared', date });
    entries.push({ account: cashAcc._id, debit: 0, credit: amount, description: `Payment made (${mode})`, date });
  }
  return entries;
};

/**
 * Reverse ledger entries for a document (used on delete / status correction).
 */
const reverseLedgerEntries = async (entryIds, restaurantId) => {
  const AccLedgerEntry = await getModel('AccLedgerEntry', AccLedgerEntryModel.schema, restaurantId);
  const AccAccount = await getModel('AccAccount', AccAccountModel.schema, restaurantId);
  for (const id of entryIds) {
    const entry = await AccLedgerEntry.findById(id);
    if (!entry) continue;
    const acc = await AccAccount.findById(entry.account);
    if (acc) {
      const isDebitNormal = acc.type === 'Asset' || acc.type === 'Expense';
      const delta = isDebitNormal ? (entry.debit - entry.credit) : (entry.credit - entry.debit);
      acc.balance -= delta;
      await acc.save();
    }
    await AccLedgerEntry.findByIdAndDelete(id);
  }
};

module.exports = {
  CODES,
  EXPENSE_CATEGORY_CODE,
  getAccount,
  createLedgerEntries,
  buildSalesEntries,
  buildPurchaseEntries,
  buildExpenseEntries,
  buildLoanEntries,
  buildPaymentEntries,
  reverseLedgerEntries,
};
