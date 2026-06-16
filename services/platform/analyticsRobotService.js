const Restaurant = require("../../models/Restaurant");
const SubscriptionPlan = require("../../models/SubscriptionPlan");
const SuperAdminNotification = require("../../models/SuperAdminNotification");

const FEATURE_LABELS = {
  hr: "HR Portal",
  onlineOrders: "Online Orders",
  qrMenu: "QR Menu",
  kitchenPanel: "Kitchen Display",
  waiterPanel: "Waiter Systems",
  reservations: "Reservations",
  accounting: "Accounting",
};

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(date) - Date.now()) / 86400000);
}

function formatInr(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

async function buildPlatformSnapshot() {
  const restaurants = await Restaurant.find({})
    .populate("subscriptionPlan", "name price duration")
    .lean();

  const total = restaurants.length;
  const active = restaurants.filter((r) => r.subscriptionStatus === "active").length;
  const trial = restaurants.filter((r) => r.subscriptionStatus === "trial").length;
  const expired = restaurants.filter((r) => r.subscriptionStatus === "expired").length;
  const suspended = restaurants.filter((r) => r.subscriptionStatus === "suspended").length;

  const mrr = restaurants
    .filter((r) => r.subscriptionStatus === "active" && r.subscriptionPlan)
    .reduce((sum, r) => sum + (r.subscriptionPlan.price || 0), 0);

  let totalLifetime = 0;
  const paymentRows = [];
  for (const r of restaurants) {
    for (const p of r.paymentHistory || []) {
      const amount = Number(p.amount) || 0;
      totalLifetime += amount;
      paymentRows.push({
        restaurantId: r.restaurantId,
        restaurantName: r.name,
        amount,
        date: p.date,
        method: p.method || "",
        planName: p.planName || r.subscriptionPlan?.name || "",
      });
    }
  }
  paymentRows.sort((a, b) => new Date(b.date) - new Date(a.date));

  const now = Date.now();
  const payments24h = paymentRows.filter((p) => now - new Date(p.date).getTime() < 86400000);
  const payments7d = paymentRows.filter((p) => now - new Date(p.date).getTime() < 7 * 86400000);
  const payments30d = paymentRows.filter((p) => now - new Date(p.date).getTime() < 30 * 86400000);

  const revenueByMonthMap = {};
  for (const p of paymentRows) {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!revenueByMonthMap[key]) revenueByMonthMap[key] = { revenue: 0, count: 0 };
    revenueByMonthMap[key].revenue += p.amount;
    revenueByMonthMap[key].count += 1;
  }

  const monthKeys = Object.keys(revenueByMonthMap).sort();
  const lastKey = monthKeys[monthKeys.length - 1];
  const prevKey = monthKeys[monthKeys.length - 2];
  const lastMonthRev = lastKey ? revenueByMonthMap[lastKey].revenue : 0;
  const prevMonthRev = prevKey ? revenueByMonthMap[prevKey].revenue : 0;
  const momGrowthPct =
    prevMonthRev > 0
      ? Math.round(((lastMonthRev - prevMonthRev) / prevMonthRev) * 100)
      : lastMonthRev > 0
        ? 100
        : 0;

  const expiringSoon = restaurants
    .filter((r) => {
      const d = daysUntil(r.subscriptionExpiry);
      return d !== null && d >= 0 && d <= 7 && ["active", "trial"].includes(r.subscriptionStatus);
    })
    .map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      daysLeft: daysUntil(r.subscriptionExpiry),
      status: r.subscriptionStatus,
      plan: r.subscriptionPlan?.name || "Trial",
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const topPerformers = [...restaurants]
    .map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      totalPaid: (r.paymentHistory || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
      status: r.subscriptionStatus,
      plan: r.subscriptionPlan?.name || "Trial",
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 5);

  const planDistribution = {};
  for (const r of restaurants) {
    const planName = r.subscriptionPlan?.name || "Trial";
    planDistribution[planName] = (planDistribution[planName] || 0) + 1;
  }

  const featureUsage = {};
  for (const key of Object.keys(FEATURE_LABELS)) {
    featureUsage[key] = restaurants.filter((r) => r.features?.[key]).length;
  }

  const newLast30d = restaurants.filter(
    (r) => r.createdAt && now - new Date(r.createdAt).getTime() < 30 * 86400000
  ).length;

  const notifications = await SuperAdminNotification.find({})
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  const recentActivity = notifications.slice(0, 10).map((n) => ({
    type: n.type,
    title: n.title,
    message: n.message,
    restaurantName: n.restaurantName || n.restaurantId || "System",
    createdAt: n.createdAt,
  }));

  const openSupportTickets = notifications.filter(
    (n) => n.type === "support_ticket" && (n.meta?.status || "Open") === "Open"
  ).length;

  const avgPlanPrice = active > 0 ? Math.round(mrr / active) : 0;
  const healthPct = total > 0 ? Math.round((active / total) * 100) : 0;

  const expiringIn3d = expiringSoon.filter((t) => t.daysLeft <= 3);
  const zeroPaymentTenants = restaurants
    .filter((r) => !(r.paymentHistory || []).length)
    .map((r) => ({ restaurantId: r.restaurantId, name: r.name, status: r.subscriptionStatus }))
    .slice(0, 10);

  const bottomPerformers = [...restaurants]
    .map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      totalPaid: (r.paymentHistory || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
      status: r.subscriptionStatus,
    }))
    .sort((a, b) => a.totalPaid - b.totalPaid)
    .slice(0, 5);

  const paymentCount = paymentRows.length;
  const avgPaymentAmount = paymentCount > 0 ? Math.round(totalLifetime / paymentCount) : 0;

  const suspendedList = restaurants
    .filter((r) => r.subscriptionStatus === "suspended")
    .map((r) => ({ restaurantId: r.restaurantId, name: r.name }))
    .slice(0, 10);

  const expiredList = restaurants
    .filter((r) => r.subscriptionStatus === "expired")
    .map((r) => ({ restaurantId: r.restaurantId, name: r.name }))
    .slice(0, 10);

  const trialList = restaurants
    .filter((r) => r.subscriptionStatus === "trial")
    .map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      daysLeft: daysUntil(r.subscriptionExpiry),
    }))
    .slice(0, 10);

  const topPlan = Object.entries(planDistribution).sort((a, b) => b[1] - a[1])[0];

  return {
    generatedAt: new Date().toISOString(),
    fleet: { total, active, trial, expired, suspended, healthPct },
    revenue: {
      mrr,
      arr: mrr * 12,
      totalLifetime,
      lastMonth: lastMonthRev,
      prevMonth: prevMonthRev,
      momGrowthPct,
      avgPlanPrice,
    },
    payments: {
      count24h: payments24h.length,
      total24h: payments24h.reduce((s, p) => s + p.amount, 0),
      count7d: payments7d.length,
      total7d: payments7d.reduce((s, p) => s + p.amount, 0),
      count30d: payments30d.length,
      total30d: payments30d.reduce((s, p) => s + p.amount, 0),
      totalCount: paymentCount,
      avgAmount: avgPaymentAmount,
      latest: paymentRows.slice(0, 5),
    },
    tenants: {
      expiringSoon,
      expiringIn3d,
      topPerformers,
      bottomPerformers,
      zeroPaymentTenants,
      suspendedList,
      expiredList,
      trialList,
      newLast30d,
      list: restaurants.map((r) => ({
        restaurantId: r.restaurantId,
        name: r.name,
        status: r.subscriptionStatus,
        plan: r.subscriptionPlan?.name || "Trial",
        planPrice: r.subscriptionPlan?.price || 0,
        expiry: r.subscriptionExpiry,
        totalPaid: (r.paymentHistory || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
        createdAt: r.createdAt,
      })),
    },
    plans: { distribution: planDistribution, topPlan: topPlan ? { name: topPlan[0], count: topPlan[1] } : null },
    features: { usage: featureUsage, labels: FEATURE_LABELS },
    support: { openTickets: openSupportTickets },
    activity: { recent: recentActivity },
  };
}

function matchAny(text, patterns) {
  return patterns.some((p) => (typeof p === "string" ? text.includes(p) : p.test(text)));
}

function findTenant(snapshot, question) {
  const q = question.toLowerCase();
  return snapshot.tenants.list.find(
    (t) =>
      q.includes(t.restaurantId.toLowerCase()) ||
      q.includes(t.name.toLowerCase())
  );
}

function answerQuestion(question, snapshot) {
  const q = String(question || "").trim().toLowerCase();
  if (!q) {
    return {
      answer: "Ask me anything about your platform — MRR, tenants, expiring subscriptions, payments, feature adoption, or support tickets.",
      intent: "empty",
    };
  }

  if (matchAny(q, ["help", "what can you", "what do you", "commands", "how to use", "list questions"])) {
    const sample = SUGGESTED_QUESTIONS.slice(0, 12).map((s) => `• ${s}`).join("\n");
    return {
      intent: "help",
      answer:
        `I analyze live platform data in real time. **${SUGGESTED_QUESTIONS.length}+** ready-made questions are in Quick Ask.\n\nExamples:\n${sample}\n\n…and more by category. You can also ask about any restaurant by name or ID.`,
    };
  }

  const tenant = findTenant(snapshot, q);
  if (
    tenant &&
    (matchAny(q, [tenant.restaurantId.toLowerCase(), tenant.name.toLowerCase()]) ||
      matchAny(q, ["tell me about", "status of", "details for", "info on"]))
  ) {
    const expiryDays = daysUntil(tenant.expiry);
    const expiryLine =
      expiryDays === null
        ? "No expiry date set."
        : expiryDays < 0
          ? `Expired ${Math.abs(expiryDays)} day(s) ago.`
          : `Expires in ${expiryDays} day(s).`;
    return {
      intent: "tenant_detail",
      answer:
        `**${tenant.name}** (${tenant.restaurantId})\n` +
        `• Status: ${tenant.status}\n` +
        `• Plan: ${tenant.plan} (${formatInr(tenant.planPrice)}/cycle)\n` +
        `• Lifetime paid: ${formatInr(tenant.totalPaid)}\n` +
        `• ${expiryLine}`,
      highlights: [tenant.restaurantId, tenant.name],
    };
  }

  if (matchAny(q, ["mrr", "monthly recurring", "monthly revenue"])) {
    const { mrr, arr, avgPlanPrice, momGrowthPct } = snapshot.revenue;
    return {
      intent: "mrr",
      answer:
        `Current MRR is **${formatInr(mrr)}** across ${snapshot.fleet.active} active tenant(s). ` +
        `ARR projects to **${formatInr(arr)}**. ` +
        `Average plan price: ${formatInr(avgPlanPrice)}. ` +
        `Month-over-month subscription revenue change: ${momGrowthPct >= 0 ? "+" : ""}${momGrowthPct}%.`,
    };
  }

  if (matchAny(q, ["arr", "annual recurring", "annual revenue"])) {
    return {
      intent: "arr",
      answer: `ARR is **${formatInr(snapshot.revenue.arr)}** based on current MRR of ${formatInr(snapshot.revenue.mrr)}.`,
    };
  }

  if (matchAny(q, ["revenue", "total earning", "gross volume", "lifetime revenue", "total paid"])) {
    return {
      intent: "revenue",
      answer:
        `Lifetime subscription revenue: **${formatInr(snapshot.revenue.totalLifetime)}**. ` +
        `Current MRR: ${formatInr(snapshot.revenue.mrr)}. ` +
        `Last calendar month: ${formatInr(snapshot.revenue.lastMonth)} ` +
        `(${snapshot.revenue.momGrowthPct >= 0 ? "+" : ""}${snapshot.revenue.momGrowthPct}% vs previous month).`,
    };
  }

  if (matchAny(q, ["how many restaurant", "how many tenant", "total tenant", "total restaurant", "fleet size"])) {
    const { total, active, trial, expired, suspended } = snapshot.fleet;
    return {
      intent: "fleet_count",
      answer:
        `Platform fleet: **${total}** tenants — ${active} active, ${trial} trial, ${expired} expired, ${suspended} suspended. ` +
        `Fleet health: ${snapshot.fleet.healthPct}% active.`,
    };
  }

  if (matchAny(q, ["active", "live node", "running tenant"])) {
    return {
      intent: "active",
      answer: `**${snapshot.fleet.active}** restaurant(s) are currently active, generating ${formatInr(snapshot.revenue.mrr)} MRR.`,
    };
  }

  if (matchAny(q, ["trial"])) {
    const upside = Math.round(snapshot.fleet.trial * snapshot.revenue.avgPlanPrice * 0.35);
    return {
      intent: "trial",
      answer:
        `**${snapshot.fleet.trial}** tenant(s) on trial. ` +
        `If ~35% convert at avg plan price, that could add ~${formatInr(upside)} to MRR.`,
    };
  }

  if (matchAny(q, ["expired"])) {
    return {
      intent: "expired",
      answer: `**${snapshot.fleet.expired}** tenant(s) have expired subscriptions. Review them under Restaurants to win back revenue.`,
    };
  }

  if (matchAny(q, ["suspend", "suspended", "blocked"])) {
    return {
      intent: "suspended",
      answer: `**${snapshot.fleet.suspended}** tenant(s) are suspended. These nodes are not contributing to MRR until reactivated.`,
    };
  }

  if (matchAny(q, ["fleet health", "health score", "platform health", "uptime"])) {
    return {
      intent: "health",
      answer:
        `Fleet health: **${snapshot.fleet.healthPct}%** (${snapshot.fleet.active}/${snapshot.fleet.total} active). ` +
        `${snapshot.fleet.trial} trial · ${snapshot.fleet.expired} expired · ${snapshot.fleet.suspended} suspended.`,
    };
  }

  if (matchAny(q, ["churn", "at risk mrr", "revenue at risk", "mrr at risk"])) {
    const atRisk = snapshot.tenants.expiringSoon.length * snapshot.revenue.avgPlanPrice;
    return {
      intent: "churn_risk",
      answer:
        `**${snapshot.tenants.expiringSoon.length}** tenant(s) expiring ≤7d — ~${formatInr(atRisk)} MRR at risk. ` +
        `${snapshot.fleet.expired} already expired · ${snapshot.fleet.suspended} suspended.`,
    };
  }

  if (matchAny(q, ["average plan", "avg plan", "plan price average"])) {
    return {
      intent: "avg_plan",
      answer: `Average active plan price: **${formatInr(snapshot.revenue.avgPlanPrice)}** across ${snapshot.fleet.active} paying tenant(s).`,
    };
  }

  if (matchAny(q, ["month over month", "mom growth", "revenue growth", "revenue trend"])) {
    return {
      intent: "mom_growth",
      answer:
        `Month-over-month subscription revenue: **${snapshot.revenue.momGrowthPct >= 0 ? "+" : ""}${snapshot.revenue.momGrowthPct}%**. ` +
        `Last month: ${formatInr(snapshot.revenue.lastMonth)} · Previous: ${formatInr(snapshot.revenue.prevMonth)}.`,
    };
  }

  if (matchAny(q, ["payment today", "payments today", "last 24 hour", "last 24h", "paid today"])) {
    const p = snapshot.payments;
    return {
      intent: "payments_24h",
      answer: `Last 24 hours: **${p.count24h}** payment(s) totaling **${formatInr(p.total24h)}**.`,
    };
  }

  if (matchAny(q, ["last 30 day", "last 30d", "payment last month", "payments this month"])) {
    const p = snapshot.payments;
    return {
      intent: "payments_30d",
      answer: `Last 30 days: **${p.count30d}** payment(s) totaling **${formatInr(p.total30d)}** (avg ${formatInr(p.avgAmount)} per payment).`,
    };
  }

  if (matchAny(q, ["average payment", "avg payment", "mean payment"])) {
    return {
      intent: "avg_payment",
      answer:
        `Average payment amount: **${formatInr(snapshot.payments.avgAmount)}** across **${snapshot.payments.totalCount}** lifetime payment(s). ` +
        `Total collected: ${formatInr(snapshot.revenue.totalLifetime)}.`,
    };
  }

  if (matchAny(q, ["total payment count", "how many payment", "payment count"])) {
    return {
      intent: "payment_count",
      answer: `**${snapshot.payments.totalCount}** subscription payment(s) recorded platform-wide (${formatInr(snapshot.revenue.totalLifetime)} total).`,
    };
  }

  if (matchAny(q, ["expir", "churn", "renewal", "at risk", "this week"])) {
    const list = snapshot.tenants.expiringSoon;
    if (!list.length) {
      return {
        intent: "expiring",
        answer: "No tenants expire within the next 7 days. Renewal risk is low right now.",
      };
    }
    const lines = list
      .slice(0, 8)
      .map((t) => `• ${t.name} (${t.restaurantId}) — ${t.daysLeft}d left, ${t.plan}`)
      .join("\n");
    const atRisk = list.length * snapshot.revenue.avgPlanPrice;
    return {
      intent: "expiring",
      answer:
        `**${list.length}** tenant(s) expire within 7 days (~${formatInr(atRisk)} MRR at risk):\n${lines}`,
    };
  }

  if (matchAny(q, ["top perform", "best tenant", "highest revenue", "alpha tenant", "top gross"])) {
    const lines = snapshot.tenants.topPerformers
      .map((t, i) => `${i + 1}. ${t.name} (${t.restaurantId}) — ${formatInr(t.totalPaid)} · ${t.plan}`)
      .join("\n");
    return {
      intent: "top_performers",
      answer: lines ? `Top performers by lifetime volume:\n${lines}` : "No payment data recorded yet.",
    };
  }

  if (matchAny(q, ["expire in 3", "next 3 day", "3 day", "urgent expir"])) {
    const list = snapshot.tenants.expiringIn3d;
    if (!list.length) {
      return { intent: "expiring_3d", answer: "No tenants expire within the next 3 days." };
    }
    const lines = list.map((t) => `• ${t.name} (${t.restaurantId}) — ${t.daysLeft}d left`).join("\n");
    return {
      intent: "expiring_3d",
      answer: `**${list.length}** tenant(s) expire within 3 days (urgent):\n${lines}`,
    };
  }

  if (matchAny(q, ["lowest perform", "worst perform", "bottom tenant", "least revenue", "lowest revenue"])) {
    const lines = snapshot.tenants.bottomPerformers
      .map((t, i) => `${i + 1}. ${t.name} (${t.restaurantId}) — ${formatInr(t.totalPaid)}`)
      .join("\n");
    return {
      intent: "bottom_performers",
      answer: lines ? `Lowest lifetime volume:\n${lines}` : "No tenant data available.",
    };
  }

  if (matchAny(q, ["no payment", "never paid", "zero payment", "without payment"])) {
    const list = snapshot.tenants.zeroPaymentTenants;
    if (!list.length) {
      return { intent: "zero_payment", answer: "All tenants have at least one recorded payment." };
    }
    const lines = list.map((t) => `• ${t.name} (${t.restaurantId}) — ${t.status}`).join("\n");
    return {
      intent: "zero_payment",
      answer: `**${list.length}** tenant(s) with no payments yet:\n${lines}`,
    };
  }

  if (matchAny(q, ["list suspended", "who is suspended", "suspended tenant", "suspended list"])) {
    const list = snapshot.tenants.suspendedList;
    if (!list.length) {
      return { intent: "suspended_list", answer: "No suspended tenants right now." };
    }
    const lines = list.map((t) => `• ${t.name} (${t.restaurantId})`).join("\n");
    return {
      intent: "suspended_list",
      answer: `Suspended tenants (${snapshot.fleet.suspended}):\n${lines}`,
    };
  }

  if (matchAny(q, ["list expired", "who expired", "expired tenant", "expired list"])) {
    const list = snapshot.tenants.expiredList;
    if (!list.length) {
      return { intent: "expired_list", answer: "No expired tenants right now." };
    }
    const lines = list.map((t) => `• ${t.name} (${t.restaurantId})`).join("\n");
    return {
      intent: "expired_list",
      answer: `Expired tenants (${snapshot.fleet.expired}):\n${lines}`,
    };
  }

  if (matchAny(q, ["list trial", "trial tenant", "who is on trial", "trial list"])) {
    const list = snapshot.tenants.trialList;
    if (!list.length) {
      return { intent: "trial_list", answer: "No tenants on trial right now." };
    }
    const lines = list
      .map((t) => `• ${t.name} (${t.restaurantId})${t.daysLeft != null ? ` — ${t.daysLeft}d left` : ""}`)
      .join("\n");
    return {
      intent: "trial_list",
      answer: `Trial tenants (${snapshot.fleet.trial}):\n${lines}`,
    };
  }

  if (matchAny(q, ["conversion", "trial convert", "trial upside", "trial potential"])) {
    const upside = Math.round(snapshot.fleet.trial * snapshot.revenue.avgPlanPrice * 0.35);
    return {
      intent: "trial_conversion",
      answer:
        `**${snapshot.fleet.trial}** trials active. At ~35% conversion and ${formatInr(snapshot.revenue.avgPlanPrice)} avg plan, ` +
        `potential MRR uplift: **~${formatInr(upside)}**.`,
    };
  }

  if (matchAny(q, ["most popular plan", "popular plan", "top plan", "best selling plan"])) {
    const top = snapshot.plans.topPlan;
    if (!top) return { intent: "top_plan", answer: "No plan distribution data yet." };
    const pct = snapshot.fleet.total > 0 ? Math.round((top.count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "top_plan",
      answer: `Most popular plan: **${top.name}** with **${top.count}** tenant(s) (${pct}% of fleet).`,
    };
  }

  if (matchAny(q, ["hr portal", "hr adoption", "hr usage", "hr feature"])) {
    const count = snapshot.features.usage.hr || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_hr",
      answer: `**HR Portal** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["qr menu", "qr adoption", "qr usage"])) {
    const count = snapshot.features.usage.qrMenu || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_qr",
      answer: `**QR Menu** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["kitchen display", "kitchen panel", "kitchen adoption"])) {
    const count = snapshot.features.usage.kitchenPanel || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_kitchen",
      answer: `**Kitchen Display** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["waiter panel", "waiter system", "waiter adoption"])) {
    const count = snapshot.features.usage.waiterPanel || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_waiter",
      answer: `**Waiter Systems** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["online order", "online adoption"])) {
    const count = snapshot.features.usage.onlineOrders || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_online",
      answer: `**Online Orders** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["reservation", "booking feature"])) {
    const count = snapshot.features.usage.reservations || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_reservations",
      answer: `**Reservations** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["accounting feature", "accounting adoption"])) {
    const count = snapshot.features.usage.accounting || 0;
    const pct = snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0;
    return {
      intent: "feature_accounting",
      answer: `**Accounting** enabled on **${count}** tenant(s) (${pct}% adoption).`,
    };
  }

  if (matchAny(q, ["least adopted", "lowest adoption", "worst feature"])) {
    const entries = Object.entries(snapshot.features.usage)
      .map(([key, count]) => ({
        label: FEATURE_LABELS[key] || key,
        count,
        pct: snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0,
      }))
      .sort((a, b) => a.count - b.count);
    const low = entries[0];
    return {
      intent: "lowest_feature",
      answer: low
        ? `Least adopted module: **${low.label}** at ${low.count} tenants (${low.pct}%).`
        : "No feature data available.",
    };
  }

  if (matchAny(q, ["notification", "recent alert", "platform alert"])) {
    const lines = snapshot.activity.recent
      .slice(0, 5)
      .map((a) => `• [${a.type}] ${a.restaurantName}: ${a.title}`)
      .join("\n");
    return {
      intent: "notifications",
      answer: lines ? `Recent platform notifications:\n${lines}` : "No recent notifications.",
    };
  }

  if (matchAny(q, ["new tenant this month", "signups", "onboarding", "new restaurant"])) {
    return {
      intent: "growth",
      answer:
        `**${snapshot.tenants.newLast30d}** new tenant(s) deployed in the last 30 days. ` +
        `Revenue momentum: ${snapshot.revenue.momGrowthPct >= 0 ? "+" : ""}${snapshot.revenue.momGrowthPct}% month-over-month.`,
    };
  }

  if (matchAny(q, ["feature", "adoption", "hr", "qr", "kitchen", "waiter", "module", "penetration"])) {
    const entries = Object.entries(snapshot.features.usage)
      .map(([key, count]) => ({
        label: FEATURE_LABELS[key] || key,
        count,
        pct: snapshot.fleet.total > 0 ? Math.round((count / snapshot.fleet.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const lines = entries.map((e) => `• ${e.label}: ${e.count} tenants (${e.pct}%)`).join("\n");
    return {
      intent: "features",
      answer: `Feature adoption across ${snapshot.fleet.total} tenants:\n${lines}`,
    };
  }

  if (matchAny(q, ["plan", "tier", "distribution", "subscription plan"])) {
    const lines = Object.entries(snapshot.plans.distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `• ${name}: ${count} tenant(s)`)
      .join("\n");
    return {
      intent: "plans",
      answer: lines ? `Plan distribution:\n${lines}` : "No plan data available.",
    };
  }

  if (matchAny(q, ["payment", "paid today", "last 24", "last week", "last 7", "recent payment", "cashflow"])) {
    const p = snapshot.payments;
    const latest = p.latest
      .slice(0, 3)
      .map((x) => `• ${x.restaurantName}: ${formatInr(x.amount)} (${new Date(x.date).toLocaleDateString("en-IN")})`)
      .join("\n");
    return {
      intent: "payments",
      answer:
        `Payments — 24h: ${p.count24h} (${formatInr(p.total24h)}) · ` +
        `7d: ${p.count7d} (${formatInr(p.total7d)}) · ` +
        `30d: ${p.count30d} (${formatInr(p.total30d)}).\n` +
        (latest ? `Latest:\n${latest}` : ""),
    };
  }

  if (matchAny(q, ["support", "ticket", "help desk"])) {
    const recent = snapshot.activity.recent
      .filter((a) => a.type === "support_ticket")
      .slice(0, 3)
      .map((a) => `• ${a.restaurantName}: ${a.title}`)
      .join("\n");
    return {
      intent: "support",
      answer:
        `**${snapshot.support.openTickets}** open support ticket(s).` +
        (recent ? `\nRecent:\n${recent}` : ""),
    };
  }

  if (matchAny(q, ["activity", "feed", "recent event", "what happened", "latest"])) {
    const lines = snapshot.activity.recent
      .slice(0, 6)
      .map((a) => `• ${a.restaurantName}: ${a.title}`)
      .join("\n");
    return {
      intent: "activity",
      answer: lines ? `Latest platform activity:\n${lines}` : "No recent activity recorded.",
    };
  }

  if (matchAny(q, ["summary", "overview", "report", "status", "briefing", "analyze", "analysis"])) {
    const exp = snapshot.tenants.expiringSoon.length;
    return {
      intent: "summary",
      answer:
        `**Platform briefing** (live)\n` +
        `• Fleet: ${snapshot.fleet.total} tenants — ${snapshot.fleet.active} active, ${snapshot.fleet.trial} trial, ${snapshot.fleet.suspended} suspended\n` +
        `• MRR: ${formatInr(snapshot.revenue.mrr)} · ARR: ${formatInr(snapshot.revenue.arr)}\n` +
        `• Lifetime revenue: ${formatInr(snapshot.revenue.totalLifetime)}\n` +
        `• Revenue trend: ${snapshot.revenue.momGrowthPct >= 0 ? "+" : ""}${snapshot.revenue.momGrowthPct}% MoM\n` +
        `• Expiring ≤7d: ${exp} tenant(s)\n` +
        `• Payments 24h: ${snapshot.payments.count24h} (${formatInr(snapshot.payments.total24h)})\n` +
        `• Open support tickets: ${snapshot.support.openTickets}\n` +
        `• New tenants (30d): ${snapshot.tenants.newLast30d}`,
    };
  }

  if (matchAny(q, ["inactive", "not active", "non-active"])) {
    const inactive = snapshot.fleet.total - snapshot.fleet.active;
    return {
      intent: "inactive",
      answer:
        `**${inactive}** non-active tenant(s): ${snapshot.fleet.trial} trial, ${snapshot.fleet.expired} expired, ${snapshot.fleet.suspended} suspended.`,
    };
  }

  if (matchAny(q, ["compare mrr", "mrr vs revenue", "mrr and lifetime"])) {
    return {
      intent: "mrr_compare",
      answer:
        `MRR **${formatInr(snapshot.revenue.mrr)}** vs lifetime collected **${formatInr(snapshot.revenue.totalLifetime)}**. ` +
        `ARR run-rate: ${formatInr(snapshot.revenue.arr)}.`,
    };
  }

  if (matchAny(q, ["daily briefing", "morning report", "executive summary", "ceo summary"])) {
    const exp = snapshot.tenants.expiringSoon.length;
    return {
      intent: "executive_summary",
      answer:
        `**Executive summary**\n` +
        `Revenue: MRR ${formatInr(snapshot.revenue.mrr)} · MoM ${snapshot.revenue.momGrowthPct >= 0 ? "+" : ""}${snapshot.revenue.momGrowthPct}%\n` +
        `Fleet: ${snapshot.fleet.active}/${snapshot.fleet.total} active (${snapshot.fleet.healthPct}% health)\n` +
        `Risk: ${exp} expiring ≤7d · ${snapshot.support.openTickets} open tickets\n` +
        `Growth: ${snapshot.tenants.newLast30d} new tenants (30d) · ${snapshot.payments.count7d} payments (7d)`,
    };
  }

  if (matchAny(q, ["what needs my attention", "needs attention", "priority today", "action items"])) {
    const items = [];
    if (snapshot.tenants.expiringSoon.length) items.push(`${snapshot.tenants.expiringSoon.length} tenant(s) expiring ≤7d`);
    if (snapshot.fleet.suspended) items.push(`${snapshot.fleet.suspended} suspended account(s)`);
    if (snapshot.support.openTickets) items.push(`${snapshot.support.openTickets} open support ticket(s)`);
    if (snapshot.fleet.expired) items.push(`${snapshot.fleet.expired} expired account(s) to win back`);
    if (snapshot.tenants.zeroPaymentTenants.length) items.push(`${snapshot.tenants.zeroPaymentTenants.length} tenant(s) with zero payments`);
    return {
      intent: "attention",
      answer: items.length
        ? `**Priority actions today:**\n${items.map((i) => `• ${i}`).join("\n")}`
        : "Platform looks stable — no urgent items flagged from live data.",
    };
  }

  if (matchAny(q, ["operational risk", "risk report", "ops risk"])) {
    return {
      intent: "ops_risk",
      answer:
        `**Operational risk snapshot**\n` +
        `• Expiring ≤7d: ${snapshot.tenants.expiringSoon.length} (~${formatInr(snapshot.tenants.expiringSoon.length * snapshot.revenue.avgPlanPrice)} MRR)\n` +
        `• Suspended: ${snapshot.fleet.suspended} · Expired: ${snapshot.fleet.expired}\n` +
        `• Open tickets: ${snapshot.support.openTickets}\n` +
        `• Fleet health: ${snapshot.fleet.healthPct}%`,
    };
  }

  if (matchAny(q, ["growth", "deployed", "new nodes"])) {
    return {
      intent: "growth",
      answer:
        `**${snapshot.tenants.newLast30d}** new tenant(s) deployed in the last 30 days. ` +
        `Revenue momentum: ${snapshot.revenue.momGrowthPct >= 0 ? "+" : ""}${snapshot.revenue.momGrowthPct}% month-over-month.`,
    };
  }

  return {
    intent: "fallback",
    answer:
      `I studied your live platform data but couldn't match that question exactly. ` +
      `Right now: ${snapshot.fleet.active} active tenants, MRR ${formatInr(snapshot.revenue.mrr)}, ` +
      `${snapshot.tenants.expiringSoon.length} expiring this week. ` +
      `Try asking about MRR, expiring tenants, top performers, payments, or say "full summary".`,
  };
}

const SUGGESTED_QUESTION_CATEGORIES = [
  {
    id: "overview",
    label: "Overview & Summary",
    questions: [
      "Give me a full platform summary",
      "Executive summary for today",
      "Daily briefing report",
      "What is our platform health score?",
      "Show fleet status overview",
      "How many total restaurants do we have?",
      "What happened recently on the platform?",
    ],
  },
  {
    id: "revenue",
    label: "Revenue & MRR",
    questions: [
      "What is our current MRR?",
      "What is our ARR?",
      "Show lifetime revenue total",
      "What is month-over-month revenue growth?",
      "Compare MRR vs lifetime revenue",
      "What is the average plan price?",
      "How much MRR is at risk?",
      "What is churn and revenue at risk?",
      "Show revenue trend analysis",
      "What is average payment amount?",
    ],
  },
  {
    id: "fleet",
    label: "Fleet & Tenants",
    questions: [
      "How many active restaurants do we have?",
      "How many trials do we have?",
      "List all trial tenants",
      "How many expired tenants?",
      "List all expired tenants",
      "How many suspended tenants?",
      "List all suspended tenants",
      "How many inactive tenants?",
      "How many new tenants this month?",
      "Show tenant growth in last 30 days",
    ],
  },
  {
    id: "renewals",
    label: "Subscriptions & Renewals",
    questions: [
      "Which tenants expire this week?",
      "Who expires in the next 3 days?",
      "Show urgent renewal list",
      "What is trial conversion potential?",
      "Which tenants need renewal outreach?",
      "How many subscriptions are at risk?",
      "Show expiring subscriptions summary",
    ],
  },
  {
    id: "payments",
    label: "Payments & Cashflow",
    questions: [
      "Payment summary last 7 days",
      "How many payments in last 24 hours?",
      "Payment summary last 30 days",
      "Show recent payment activity",
      "What is total payment count?",
      "Show latest subscription payments",
      "Cashflow summary today",
      "Average payment per transaction",
    ],
  },
  {
    id: "performance",
    label: "Performance Rankings",
    questions: [
      "Top performing restaurants",
      "Who are the alpha tenants?",
      "Show lowest performing tenants",
      "Which tenants never paid?",
      "Highest lifetime revenue tenants",
      "Bottom performers by revenue",
    ],
  },
  {
    id: "plans",
    label: "Plans & Pricing",
    questions: [
      "Show plan distribution",
      "What is the most popular plan?",
      "Subscription plan breakdown",
      "How many tenants per plan tier?",
      "Which plan generates most tenants?",
    ],
  },
  {
    id: "features",
    label: "Feature Adoption",
    questions: [
      "Feature adoption breakdown",
      "HR portal adoption rate",
      "QR menu usage across tenants",
      "Kitchen display adoption",
      "Waiter panel adoption",
      "Online orders feature usage",
      "Reservations feature adoption",
      "Accounting module penetration",
      "What is the least adopted feature?",
      "Show module ecosystem report",
    ],
  },
  {
    id: "support",
    label: "Support & Activity",
    questions: [
      "How many open support tickets?",
      "Show recent support tickets",
      "Platform activity feed summary",
      "Recent platform notifications",
      "What alerts need attention?",
    ],
  },
  {
    id: "risk",
    label: "Risk & Operations",
    questions: [
      "What needs my attention today?",
      "Show operational risk report",
      "Fleet health and churn analysis",
      "Suspended accounts review",
      "Expired accounts win-back list",
      "Zero payment tenants list",
    ],
  },
];

const SUGGESTED_QUESTIONS = SUGGESTED_QUESTION_CATEGORIES.flatMap((c) => c.questions);

module.exports = {
  buildPlatformSnapshot,
  answerQuestion,
  SUGGESTED_QUESTIONS,
  SUGGESTED_QUESTION_CATEGORIES,
};
