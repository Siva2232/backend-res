const OrderModel = require("../../../models/Order");
const { getModel } = require("../../../utils/getModel");

const Order = (req) => getModel("Order", OrderModel.schema, req.restaurantId);

/** @type {Map<string, { data: object, expiry: number }>} */
const _insightsCache = new Map();

const REVENUE_STATUSES = ["Paid", "Closed", "Served"];
const DURATION_STATUSES = ["Served", "Paid", "Closed"];
const FORECAST_HORIZON_DAYS = 7;

const cacheKey = (req, start, end) =>
  `${String(req.restaurantId || "").toUpperCase()}:${start}:${end}`;

function parseYMD(ymd) {
  if (!ymd || typeof ymd !== "string") return null;
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfYMD(ymd) {
  const base = parseYMD(ymd);
  if (!base) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
}

function orderGrossAddFields() {
  return {
    $addFields: {
      _orderGross: {
        $cond: [
          { $gt: [{ $ifNull: ["$billDetails.grandTotal", 0] }, 0] },
          "$billDetails.grandTotal",
          { $ifNull: ["$totalAmount", 0] },
        ],
      },
    },
  };
}

function customerKeyExpr() {
  return {
    $let: {
      vars: {
        trimmedName: {
          $trim: { input: { $ifNull: ["$customerName", ""] } },
        },
      },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: "$$trimmedName" }, 0] },
          "$$trimmedName",
          {
            $cond: [
              { $eq: ["$table", "TAKEAWAY"] },
              "Takeaway",
              { $concat: ["Table ", { $toString: "$table" }] },
            ],
          },
        ],
      },
    },
  };
}

function hourLabel(h) {
  const hour = Number(h);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "—";
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function formatDayLabel(dateStr) {
  if (!dateStr) return "—";
  const d = parseYMD(dateStr);
  if (!d) return dateStr;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function pickExtremeDay(rows, mode) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    if (mode === "max") {
      if (b.orders !== a.orders) return b.orders - a.orders;
      return b.revenue - a.revenue;
    }
    if (a.orders !== b.orders) return a.orders - b.orders;
    return a.revenue - b.revenue;
  });
  const top = sorted[0];
  return {
    date: top.date,
    label: formatDayLabel(top.date),
    orders: top.orders,
    revenue: Math.round(top.revenue),
  };
}

function buildForecast(dailyBreakdown) {
  const days = dailyBreakdown.length || 1;
  const totalOrders = dailyBreakdown.reduce((s, d) => s + d.orders, 0);
  const totalRevenue = dailyBreakdown.reduce((s, d) => s + d.revenue, 0);
  const dailyAvgOrders = totalOrders / days;
  const dailyAvgRevenue = totalRevenue / days;
  return {
    horizonDays: FORECAST_HORIZON_DAYS,
    expectedOrders: Math.round(dailyAvgOrders * FORECAST_HORIZON_DAYS),
    expectedRevenue: Math.round(dailyAvgRevenue * FORECAST_HORIZON_DAYS),
    dailyAvgOrders: Number(dailyAvgOrders.toFixed(1)),
    dailyAvgRevenue: Math.round(dailyAvgRevenue),
  };
}

function zeroFillHourly(rows) {
  const map = {};
  rows.forEach((r) => {
    map[r.hour] = r;
  });
  return Array.from({ length: 24 }, (_, hour) => {
    const row = map[hour];
    return {
      hour,
      label: hourLabel(hour),
      orders: row ? row.orders : 0,
      revenue: row ? Math.round(row.revenue) : 0,
    };
  });
}

// @desc    Date-range operations insights for analytics dashboard
// @route   GET /api/orders/analytics/insights
// @access  Private/Admin
const getOperationsInsights = async (req, res) => {
  try {
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const start = parseYMD(startDate);
    const end = endOfYMD(endDate);

    if (!start || !end || start > end) {
      return res.status(400).json({ message: "Invalid startDate or endDate" });
    }

    const daySpan = Math.ceil((end - start) / 86400000);
    if (daySpan > 366) {
      return res.status(400).json({ message: "Date range cannot exceed 366 days" });
    }

    const now = Date.now();
    const key = cacheKey(req, startDate, endDate);
    const cached = _insightsCache.get(key);
    if (cached && now < cached.expiry) {
      res.set("Cache-Control", "private, max-age=60");
      return res.json(cached.data);
    }

    const OrderM = await Order(req);
    const baseMatch = {
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Cancelled" },
    };
    const revenueMatch = {
      ...baseMatch,
      status: { $in: REVENUE_STATUSES },
    };

    const [
      dailyRows,
      hourlyRows,
      customerRows,
      durationRows,
      lowMenuRows,
    ] = await Promise.all([
      OrderM.aggregate([
        { $match: baseMatch },
        orderGrossAddFields(),
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $in: ["$status", REVENUE_STATUSES] }, "$_orderGross", 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: "$_id",
            orders: 1,
            revenue: 1,
          },
        },
      ]),

      OrderM.aggregate([
        { $match: baseMatch },
        orderGrossAddFields(),
        {
          $group: {
            _id: { $hour: "$createdAt" },
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $in: ["$status", REVENUE_STATUSES] }, "$_orderGross", 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            hour: "$_id",
            orders: 1,
            revenue: 1,
          },
        },
      ]),

      OrderM.aggregate([
        { $match: revenueMatch },
        orderGrossAddFields(),
        {
          $addFields: {
            _customerKey: customerKeyExpr(),
          },
        },
        {
          $group: {
            _id: "$_customerKey",
            orders: { $sum: 1 },
            totalSpend: { $sum: "$_orderGross" },
          },
        },
        { $sort: { orders: -1, totalSpend: -1 } },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            name: "$_id",
            orders: 1,
            totalSpend: 1,
          },
        },
      ]),

      OrderM.aggregate([
        {
          $match: {
            ...revenueMatch,
            table: { $ne: "TAKEAWAY" },
            status: { $in: DURATION_STATUSES },
          },
        },
        {
          $addFields: {
            _durationMs: { $subtract: ["$updatedAt", "$createdAt"] },
          },
        },
        {
          $match: {
            _durationMs: { $gte: 0, $lte: 8 * 60 * 60 * 1000 },
          },
        },
        {
          $group: {
            _id: null,
            avgDurationMs: { $avg: "$_durationMs" },
            count: { $sum: 1 },
          },
        },
      ]),

      OrderM.aggregate([
        { $match: revenueMatch },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            qty: { $sum: "$items.qty" },
            revenue: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$items.qty", 0] },
                  { $ifNull: ["$items.price", 0] },
                ],
              },
            },
          },
        },
        { $sort: { qty: 1, revenue: 1 } },
        { $limit: 8 },
        {
          $project: {
            _id: 0,
            name: "$_id",
            qty: 1,
            revenue: 1,
          },
        },
      ]),
    ]);

    const dailyBreakdown = dailyRows.map((d) => ({
      date: d.date,
      orders: d.orders,
      revenue: Math.round(d.revenue),
    }));

    const hourlyBreakdown = zeroFillHourly(hourlyRows);
    const busiestHourRow = [...hourlyBreakdown].sort((a, b) => {
      if (b.orders !== a.orders) return b.orders - a.orders;
      return b.revenue - a.revenue;
    })[0];

    const customerCountAgg = await OrderM.aggregate([
      { $match: revenueMatch },
      orderGrossAddFields(),
      { $addFields: { _customerKey: customerKeyExpr() } },
      {
        $group: {
          _id: "$_customerKey",
          totalSpend: { $sum: "$_orderGross" },
        },
      },
      {
        $group: {
          _id: null,
          uniqueCustomers: { $sum: 1 },
          totalGross: { $sum: "$totalSpend" },
        },
      },
    ]);

    const customerStats = customerCountAgg[0] || {};
    const uniqueCustomers = customerStats.uniqueCustomers || 0;
    const totalGross = Number(customerStats.totalGross) || 0;
    const avgCustomerSpend =
      uniqueCustomers > 0 ? Math.round(totalGross / uniqueCustomers) : 0;

    const durationRow = durationRows[0] || {};
    const avgDiningDurationMinutes =
      durationRow.avgDurationMs != null
        ? Math.round(durationRow.avgDurationMs / 60000)
        : null;

    const topCustomer = customerRows[0]
      ? {
          name: customerRows[0].name,
          orders: customerRows[0].orders,
          totalSpend: Math.round(customerRows[0].totalSpend),
        }
      : null;

    const payload = {
      range: { start: startDate, end: endDate },
      summary: {
        busiestDay: pickExtremeDay(dailyBreakdown, "max"),
        quietestDay: pickExtremeDay(dailyBreakdown, "min"),
        busiestHour: busiestHourRow
          ? {
              hour: busiestHourRow.hour,
              label: busiestHourRow.label,
              orders: busiestHourRow.orders,
              revenue: busiestHourRow.revenue,
            }
          : null,
        avgCustomerSpend,
        uniqueCustomers,
        avgDiningDurationMinutes,
        diningSampleSize: durationRow.count || 0,
        topCustomer,
      },
      hourlyBreakdown,
      dailyBreakdown,
      lowPerformingMenu: lowMenuRows.map((r) => ({
        name: r.name,
        qty: r.qty,
        revenue: Math.round(r.revenue),
      })),
      forecast: buildForecast(dailyBreakdown),
    };

    _insightsCache.set(key, { data: payload, expiry: now + 60000 });
    res.set("Cache-Control", "private, max-age=60");
    res.json(payload);
  } catch (error) {
    console.error("getOperationsInsights error:", error);
    res.status(500).json({ message: "Server error fetching operations insights" });
  }
};

module.exports = { getOperationsInsights };
