// FILE: src/controllers/deliveryController.js
// UPDATED — Feature: manual Today's Orders, Mark Complete payment split,
// per-customer pricing, Ledger with Receive Payment, admin monitoring.
//
// Distributor side
//   POST   /orders              one-click "Today's Order" from the Customers
//                               tab -> a PENDING record, amount auto =
//                               qty x this customer's price
//   PUT    /orders/:id/complete Mark Complete: Cash + GPay + Credit must
//                               add up to the order amount; closes the
//                               order and takes the kg out of the fridge
//   DELETE /orders/:id          cancel a pending manual order
//   POST   /                    (existing) close an admin-approved request
//                               order — now also takes the Cash/GPay/Credit
//                               split
//   POST   /receipts            customer pays old credit (cash / GPay)
//   GET    /mine, /mine/summary, /mine/ledger
// Admin side
//   GET /admin, /admin/summary, /admin/today-status, /admin/ledger
const DeliveryRecord = require("../models/DeliveryRecord");
const Distributor = require("../models/Distributor");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const BatterRequest = require("../models/BatterRequest");
const PaymentReceipt = require("../models/PaymentReceipt");

const CORE_KEYS = ["idly", "dosa"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));
// Old records only have amountPaid (no cash/GPay split) — treat that as cash.
const cashOf = (r) => (r.cashAmount !== undefined && r.cashAmount !== null ? r.cashAmount : (r.amountPaid || 0));
const onlineOf = (r) => r.onlineAmount || 0;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getRateMap() {
  const products = await Product.find();
  const map = {};
  for (const p of products) map[p.key] = p;
  return map;
}

// { customerId: { productKey: customerRatePerKg } } for the customers in a batch
async function getCustomerPriceMaps(customerIds) {
  const ids = [...new Set(customerIds.filter(Boolean).map(String))];
  if (!ids.length) return {};
  const customers = await Customer.find({ _id: { $in: ids } }).select("customPricing");
  const map = {};
  for (const c of customers) {
    map[String(c._id)] = {};
    (c.customPricing || []).forEach((it) => { map[String(c._id)][it.productKey] = it.customerRatePerKg; });
  }
  return map;
}

// Price an order: this customer's own price if set, else the catalog price.
// Company cost is always the catalog company rate (what the company charges
// the distributor doesn't change per shop).
function priceOrder(input, rates, myPrices = {}) {
  const idlyRate = rates.idly || { companyRatePerKg: 0, customerRatePerKg: 0 };
  const dosaRate = rates.dosa || { companyRatePerKg: 0, customerRatePerKg: 0 };
  const idlyKg = Number(input.idlyKg) || 0;
  const dosaKg = Number(input.dosaKg) || 0;
  const idlyCustomerRate = myPrices.idly !== undefined ? myPrices.idly : idlyRate.customerRatePerKg;
  const dosaCustomerRate = myPrices.dosa !== undefined ? myPrices.dosa : dosaRate.customerRatePerKg;

  const extraItems = [];
  let extraCost = 0;
  let extraCharge = 0;
  for (const it of Array.isArray(input.extraItems) ? input.extraItems : []) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0 || CORE_KEYS.includes(it.productKey)) continue;
    const p = rates[it.productKey];
    const companyRate = p?.companyRatePerKg || 0;
    const customerRate = myPrices[it.productKey] !== undefined ? myPrices[it.productKey] : (p?.customerRatePerKg || 0);
    extraItems.push({
      productKey: it.productKey,
      productName: p?.name || it.productName || it.productKey,
      unit: p?.unit || it.unit || "kg",
      qty, companyRate, customerRate,
    });
    extraCost += qty * companyRate;
    extraCharge += qty * customerRate;
  }

  const companyCost = idlyKg * idlyRate.companyRatePerKg + dosaKg * dosaRate.companyRatePerKg + extraCost;
  const amount = idlyKg * idlyCustomerRate + dosaKg * dosaCustomerRate + extraCharge;
  return {
    idlyKg, dosaKg, extraItems,
    idlyCompanyRate: idlyRate.companyRatePerKg, idlyCustomerRate,
    dosaCompanyRate: dosaRate.companyRatePerKg, dosaCustomerRate,
    companyCost: round2(companyCost), amount: round2(amount),
  };
}

// Turn what the distributor typed into the stored payment fields.
//   New shape:    { cashAmount, onlineAmount, creditAmount } — must add up to amount
//   Legacy shape: { paymentStatus: paid|credit|partial, amountPaid }
// amountPaid is always cash + GPay so older screens keep working.
function resolvePayment(amount, b) {
  const hasSplit = ["cashAmount", "onlineAmount", "creditAmount"].some((k) => b[k] !== undefined && b[k] !== null && b[k] !== "");
  let cash, online, credit;
  if (hasSplit) {
    cash = num(b.cashAmount); online = num(b.onlineAmount); credit = num(b.creditAmount);
    if ([cash, online, credit].some((v) => !Number.isFinite(v) || v < 0)) {
      return { error: "Cash, GPay and Credit must be numbers of 0 or more." };
    }
    if (Math.abs(cash + online + credit - amount) > 0.01) {
      return { error: `Cash + GPay + Credit must add up to ₹${amount}.` };
    }
  } else {
    const ps = b.paymentStatus || "paid";
    online = 0;
    if (ps === "credit") { cash = 0; credit = amount; }
    else if (ps === "partial") {
      cash = Math.min(Math.max(num(b.amountPaid), 0), amount);
      credit = amount - cash;
    } else { cash = amount; credit = 0; }
  }
  cash = round2(cash); online = round2(online); credit = round2(credit);
  const amountPaid = round2(cash + online);
  const paymentStatus = credit <= 0 ? "paid" : amountPaid <= 0 ? "credit" : "partial";
  return { cashAmount: cash, onlineAmount: online, creditAmount: credit, amountPaid, paymentStatus };
}

async function reduceStock(distributorId, idlyKg, dosaKg) {
  if (idlyKg > 0 || dosaKg > 0) {
    await Distributor.findByIdAndUpdate(distributorId, {
      $inc: { "currentStockKg.idly": -idlyKg, "currentStockKg.dosa": -dosaKg },
    });
  }
}

// What a customer still owes this distributor = credit given on delivered
// orders − old-credit payments received.
async function outstandingFor(distributorId, customerId) {
  const [recs, receipts] = await Promise.all([
    DeliveryRecord.find({ distributor: distributorId, customer: customerId, status: "delivered" }).select("creditAmount").lean(),
    PaymentReceipt.find({ distributor: distributorId, customer: customerId }).select("amount").lean(),
  ]);
  const credit = recs.reduce((s, r) => s + (r.creditAmount || 0), 0);
  const received = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  return round2(credit - received);
}

async function receiptTotals(distributorId) {
  const receipts = await PaymentReceipt.find({ distributor: distributorId }).select("amount createdAt").lean();
  const today = startOfToday();
  let all = 0, todayTotal = 0;
  for (const r of receipts) {
    all += r.amount || 0;
    if (new Date(r.createdAt) >= today) todayTotal += r.amount || 0;
  }
  return { all: round2(all), today: round2(todayTotal) };
}

// Customer-wise ledger (used by both the distributor app and the admin).
async function buildLedger(distributorId) {
  const [records, receipts] = await Promise.all([
    DeliveryRecord.find({ distributor: distributorId, status: "delivered" })
      .select("customer shopName amountCharged cashAmount onlineAmount amountPaid creditAmount createdAt deliveredAt").sort({ createdAt: 1 }).lean(),
    PaymentReceipt.find({ distributor: distributorId }).select("customer shopName amount mode createdAt").sort({ createdAt: 1 }).lean(),
  ]);

  const byCustomer = {};
  const row = (id, shopName) => {
    const key = String(id);
    if (!byCustomer[key]) {
      byCustomer[key] = { customerId: key, shopName: shopName || "", orders: 0, totalOrdered: 0, cashPaid: 0, onlinePaid: 0, creditGiven: 0, received: 0, outstanding: 0 };
    }
    if (shopName) byCustomer[key].shopName = shopName;
    return byCustomer[key];
  };

  for (const r of records) {
    const c = row(r.customer, r.shopName);
    c.orders += 1;
    c.totalOrdered += r.amountCharged || 0;
    c.cashPaid += cashOf(r);
    c.onlinePaid += onlineOf(r);
    c.creditGiven += r.creditAmount || 0;
  }
  for (const r of receipts) row(r.customer, r.shopName).received += r.amount || 0;

  const customerLedger = Object.values(byCustomer).map((c) => ({
    ...c,
    totalOrdered: round2(c.totalOrdered), cashPaid: round2(c.cashPaid), onlinePaid: round2(c.onlinePaid),
    creditGiven: round2(c.creditGiven), received: round2(c.received),
    outstanding: Math.max(0, round2(c.creditGiven - c.received)),
  })).sort((a, b) => b.outstanding - a.outstanding || b.totalOrdered - a.totalOrdered);

  const sum = (k) => round2(customerLedger.reduce((s, c) => s + c[k], 0));
  const totals = {
    totalOrdered: sum("totalOrdered"), cashPaid: sum("cashPaid"), onlinePaid: sum("onlinePaid"),
    creditGiven: sum("creditGiven"), received: sum("received"), outstanding: sum("outstanding"),
  };

  const recentTransactions = [
    ...records.map((r) => ({
      type: "order", title: "Order Delivered", customer: r.shopName, date: r.deliveredAt || r.createdAt,
      amount: r.amountCharged || 0, cash: cashOf(r), online: onlineOf(r), credit: r.creditAmount || 0,
    })),
    ...receipts.map((r) => ({
      type: "receipt", title: "Payment Received", customer: r.shopName, date: r.createdAt,
      amount: r.amount || 0, mode: r.mode,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

  return { customerLedger, totals, recentTransactions };
}

/* ══════════════════════ DISTRIBUTOR SIDE ══════════════════════ */

// POST /api/deliveries  (protectDistributor)
// Closes admin-approved request orders.
// Body: { batterRequestId, records: [{ customerId, shopName, idlyKg, dosaKg, extraItems,
//         status: "delivered"|"skipped", cashAmount, onlineAmount, creditAmount, skipReason }] }
// (the old paymentStatus/amountPaid shape is still accepted)
exports.submitDeliveries = async (req, res) => {
  try {
    const { batterRequestId, records = [] } = req.body;
    if (!records.length) return res.status(400).json({ message: "No delivery records provided." });

    const rates = await getRateMap();
    const customPrices = await getCustomerPriceMaps(records.map((r) => r.customerId));
    const now = new Date();
    const docs = [];

    for (const r of records) {
      const status = r.status === "skipped" ? "skipped" : "delivered";

      // Don't let a double-tap record the same order twice.
      if (batterRequestId && r.customerId) {
        const dup = await DeliveryRecord.findOne({
          distributor: req.distributor._id, customer: r.customerId, batterRequest: batterRequestId,
          source: { $ne: "manual" }, status: { $in: ["delivered", "skipped"] },
        });
        if (dup) return res.status(409).json({ message: `${r.shopName || "This customer"}'s delivery is already recorded.` });
      }

      const priced = priceOrder(r, rates, customPrices[String(r.customerId)] || {});
      const sentAmount = r.amountCharged !== undefined ? Number(r.amountCharged) : NaN;
      const amountCharged = Number.isFinite(sentAmount) ? round2(sentAmount) : priced.amount;
      const margin = round2(amountCharged - priced.companyCost);

      let pay = { cashAmount: 0, onlineAmount: 0, creditAmount: 0, amountPaid: 0, paymentStatus: "paid" };
      if (status === "delivered") {
        pay = resolvePayment(amountCharged, r);
        if (pay.error) return res.status(400).json({ message: pay.error });
      }

      docs.push({
        distributor: req.distributor._id,
        customer: r.customerId,
        shopName: r.shopName || "",
        batterRequest: batterRequestId || undefined,
        date: now, orderedAt: now, deliveredAt: status === "delivered" ? now : undefined,
        source: "request",
        idlyKg: priced.idlyKg, dosaKg: priced.dosaKg, extraItems: priced.extraItems,
        idlyCompanyRate: priced.idlyCompanyRate, idlyCustomerRate: priced.idlyCustomerRate,
        dosaCompanyRate: priced.dosaCompanyRate, dosaCustomerRate: priced.dosaCustomerRate,
        amountCharged, companyCost: priced.companyCost, margin,
        cashAmount: pay.cashAmount, onlineAmount: pay.onlineAmount, creditAmount: pay.creditAmount,
        amountPaid: pay.amountPaid, paymentStatus: pay.paymentStatus,
        status,
        skipReason: status === "skipped" ? (r.skipReason || "") : "",
      });
    }

    const created = [];
    let idlyOut = 0, dosaOut = 0;
    for (const d of docs) {
      created.push(await DeliveryRecord.create(d));
      // Only DELIVERED kg leaves the fridge; skipped kg stays in stock.
      if (d.status === "delivered") { idlyOut += d.idlyKg; dosaOut += d.dosaKg; }
    }
    await reduceStock(req.distributor._id, idlyOut, dosaOut);

    res.status(201).json({ records: created });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/deliveries/orders  (protectDistributor)
// Body: { customerId, idlyKg, dosaKg, extraItems: [{ productKey, qty }] }
// One-click "Today's Order" from the Customers tab. Creates (or, if this
// customer already has a pending manual order today, updates) a PENDING
// record. The amount is worked out HERE from this customer's price — the
// phone never decides the price.
exports.createManualOrder = async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ message: "customerId is required." });

    const customer = await Customer.findById(customerId).select("shopName assignedDistributor customPricing");
    if (!customer) return res.status(404).json({ message: "Customer not found." });
    if (String(customer.assignedDistributor) !== String(req.distributor._id)) {
      return res.status(403).json({ message: "This customer isn't assigned to you." });
    }

    const rates = await getRateMap();
    const wanted = [
      ["idly", Number(req.body.idlyKg) || 0],
      ["dosa", Number(req.body.dosaKg) || 0],
      ...(Array.isArray(req.body.extraItems) ? req.body.extraItems : []).map((it) => [it.productKey, Number(it.qty) || 0]),
    ].filter(([, qty]) => qty > 0);

    if (wanted.length === 0) return res.status(400).json({ message: "Enter the quantity for at least one product." });
    for (const [key] of wanted) {
      const p = rates[key];
      if (!p || p.isActive === false) return res.status(400).json({ message: `"${p?.name || key}" is not available right now.` });
    }

    const myPrices = {};
    (customer.customPricing || []).forEach((it) => { myPrices[it.productKey] = it.customerRatePerKg; });
    const priced = priceOrder(req.body, rates, myPrices);
    const margin = round2(priced.amount - priced.companyCost);
    const now = new Date();

    const fields = {
      shopName: customer.shopName,
      idlyKg: priced.idlyKg, dosaKg: priced.dosaKg, extraItems: priced.extraItems,
      idlyCompanyRate: priced.idlyCompanyRate, idlyCustomerRate: priced.idlyCustomerRate,
      dosaCompanyRate: priced.dosaCompanyRate, dosaCustomerRate: priced.dosaCustomerRate,
      amountCharged: priced.amount, companyCost: priced.companyCost, margin,
    };

    let record = await DeliveryRecord.findOne({
      distributor: req.distributor._id, customer: customerId,
      source: "manual", status: "pending", date: { $gte: startOfToday() },
    });
    if (record) {
      Object.assign(record, fields);
      await record.save();
      return res.json({ record, updated: true });
    }

    record = await DeliveryRecord.create({
      distributor: req.distributor._id, customer: customerId,
      date: now, orderedAt: now, source: "manual", status: "pending", paymentStatus: "pending",
      cashAmount: 0, onlineAmount: 0, creditAmount: 0, amountPaid: 0,
      ...fields,
    });
    res.status(201).json({ record, updated: false });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/deliveries/orders/:id/complete  (protectDistributor)
// Body: { cashAmount, onlineAmount, creditAmount } — must add up to the order amount.
exports.completeOrder = async (req, res) => {
  try {
    const record = await DeliveryRecord.findById(req.params.id);
    if (!record || String(record.distributor) !== String(req.distributor._id)) {
      return res.status(404).json({ message: "Order not found." });
    }
    if (record.status !== "pending") return res.status(400).json({ message: "This order is already closed." });

    const pay = resolvePayment(record.amountCharged, req.body);
    if (pay.error) return res.status(400).json({ message: pay.error });

    const now = new Date();
    Object.assign(record, pay, { status: "delivered", deliveredAt: now, date: now });
    await record.save();
    await reduceStock(req.distributor._id, record.idlyKg || 0, record.dosaKg || 0);

    res.json({ record });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/deliveries/orders/:id  (protectDistributor) — cancel a pending manual order
exports.cancelOrder = async (req, res) => {
  try {
    const record = await DeliveryRecord.findById(req.params.id);
    if (!record || String(record.distributor) !== String(req.distributor._id)) {
      return res.status(404).json({ message: "Order not found." });
    }
    if (record.source !== "manual" || record.status !== "pending") {
      return res.status(400).json({ message: "Only a pending manual order can be cancelled." });
    }
    await DeliveryRecord.deleteOne({ _id: record._id });
    res.json({ message: "Order cancelled." });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/deliveries/receipts  (protectDistributor)
// Body: { customerId, amount, mode: "cash"|"online", note }
exports.receivePayment = async (req, res) => {
  try {
    const { customerId, mode, note } = req.body;
    const amount = round2(Number(req.body.amount));
    if (!customerId) return res.status(400).json({ message: "customerId is required." });
    if (!(amount > 0)) return res.status(400).json({ message: "Enter an amount greater than 0." });
    if (!["cash", "online"].includes(mode)) return res.status(400).json({ message: "Choose Cash or GPay." });

    const customer = await Customer.findById(customerId).select("shopName assignedDistributor");
    if (!customer) return res.status(404).json({ message: "Customer not found." });
    if (String(customer.assignedDistributor) !== String(req.distributor._id)) {
      return res.status(403).json({ message: "This customer isn't assigned to you." });
    }

    const owed = await outstandingFor(req.distributor._id, customerId);
    if (amount - owed > 0.01) {
      return res.status(400).json({ message: owed > 0 ? `This customer only owes ₹${owed}.` : "This customer has no pending credit." });
    }

    const receipt = await PaymentReceipt.create({
      distributor: req.distributor._id, customer: customerId, shopName: customer.shopName,
      amount, mode, note: note || "",
    });
    res.status(201).json({ receipt, outstanding: round2(owed - amount) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/mine?date=YYYY-MM-DD  (protectDistributor)
// Returns every record for that day — pending orders included.
exports.getMyDeliveries = async (req, res) => {
  try {
    const day = startOfDay(req.query.date);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const records = await DeliveryRecord.find({
      distributor: req.distributor._id,
      date: { $gte: day, $lt: next },
    }).populate("customer", "shopName phone").sort({ createdAt: -1 });
    res.json({ records });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/mine/summary  (protectDistributor)
// The two aggregations are unchanged. On top of them: payment-mode split,
// money received against old credit, and credits shown NET of that money.
exports.getMySummary = async (req, res) => {
  try {
    const today = startOfToday();
    const distributorId = req.distributor._id;

    const [todayAgg] = await DeliveryRecord.aggregate([
      { $match: { distributor: distributorId, date: { $gte: today }, status: "delivered" } },
      { $group: {
          _id: null,
          todayMargin: { $sum: "$margin" },
          todayRevenue: { $sum: "$amountCharged" },
          todayCollections: { $sum: "$amountPaid" },
          todayCredits: { $sum: "$creditAmount" },
      } },
    ]);

    const [allTimeAgg] = await DeliveryRecord.aggregate([
      { $match: { distributor: distributorId, status: "delivered" } },
      { $group: {
          _id: null,
          totalMargin: { $sum: "$margin" },
          totalRevenue: { $sum: "$amountCharged" },
          totalCredits: { $sum: "$creditAmount" },
      } },
    ]);

    const todayRecs = await DeliveryRecord.find({ distributor: distributorId, date: { $gte: today }, status: "delivered" })
      .select("cashAmount onlineAmount amountPaid").lean();
    const todayCash = round2(todayRecs.reduce((s, r) => s + cashOf(r), 0));
    const todayOnline = round2(todayRecs.reduce((s, r) => s + onlineOf(r), 0));
    const rec = await receiptTotals(distributorId);

    res.json({
      todayMargin: todayAgg?.todayMargin || 0,
      todayRevenue: todayAgg?.todayRevenue || 0,
      todayCollections: round2((todayAgg?.todayCollections || 0) + rec.today),
      todayCredits: todayAgg?.todayCredits || 0,
      todayCash, todayOnline, todayReceived: rec.today,
      totalMargin: allTimeAgg?.totalMargin || 0,
      totalRevenue: allTimeAgg?.totalRevenue || 0,
      totalCredits: Math.max(0, round2((allTimeAgg?.totalCredits || 0) - rec.all)),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/mine/ledger  (protectDistributor)
exports.getMyLedger = async (req, res) => {
  try {
    res.json(await buildLedger(req.distributor._id));
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ══════════════════════ ADMIN SIDE ══════════════════════ */

// GET /api/deliveries/admin?distributorId=&date=  (protectAdmin)
exports.getAdminDeliveries = async (req, res) => {
  try {
    const { distributorId, date } = req.query;
    const filter = {};
    if (distributorId) filter.distributor = distributorId;
    if (date) {
      const day = startOfDay(date);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      filter.date = { $gte: day, $lt: next };
    }
    const records = await DeliveryRecord.find(filter)
      .populate("distributor", "name employeeId")
      .populate("customer", "shopName phone")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ records });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/admin/summary?distributorId=  (protectAdmin)
exports.getAdminSummary = async (req, res) => {
  try {
    const { distributorId } = req.query;
    if (!distributorId) return res.status(400).json({ message: "distributorId is required." });
    const today = startOfToday();
    const ObjectId = require("mongoose").Types.ObjectId;

    const [todayAgg] = await DeliveryRecord.aggregate([
      { $match: { distributor: new ObjectId(distributorId), date: { $gte: today }, status: "delivered" } },
      { $group: { _id: null, todayMargin: { $sum: "$margin" }, todayRevenue: { $sum: "$amountCharged" }, todayCollections: { $sum: "$amountPaid" }, todayCredits: { $sum: "$creditAmount" } } },
    ]);
    const [allTimeAgg] = await DeliveryRecord.aggregate([
      { $match: { distributor: new ObjectId(distributorId), status: "delivered" } },
      { $group: { _id: null, totalMargin: { $sum: "$margin" }, totalRevenue: { $sum: "$amountCharged" }, totalCredits: { $sum: "$creditAmount" } } },
    ]);
    const rec = await receiptTotals(distributorId);

    res.json({
      todayMargin: todayAgg?.todayMargin || 0,
      todayRevenue: todayAgg?.todayRevenue || 0,
      todayCollections: round2((todayAgg?.todayCollections || 0) + rec.today),
      todayCredits: todayAgg?.todayCredits || 0,
      totalMargin: allTimeAgg?.totalMargin || 0,
      totalRevenue: allTimeAgg?.totalRevenue || 0,
      totalCredits: Math.max(0, round2((allTimeAgg?.totalCredits || 0) - rec.all)),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/admin/ledger?distributorId=  (protectAdmin)
exports.getAdminLedger = async (req, res) => {
  try {
    const { distributorId } = req.query;
    if (!distributorId) return res.status(400).json({ message: "distributorId is required." });
    res.json(await buildLedger(distributorId));
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/admin/today-status[?distributorId=]  (protectAdmin)
// Today: how many shops had an order taken, how many are delivered, how
// many are still pending. "Ordered" = shops in today's admin-approved
// batter requests + shops with a delivery record today (manual orders
// included). Per shop the status is: delivered > pending > skipped.
// With ?distributorId= the shop-by-shop list is included too.
exports.getAdminTodayStatus = async (req, res) => {
  try {
    const { distributorId } = req.query;
    const today = startOfToday();

    const recFilter = { date: { $gte: today } };
    const reqFilter = { requestDate: { $gte: today }, status: { $in: ["approved", "partially_approved"] } };
    if (distributorId) { recFilter.distributor = distributorId; reqFilter.distributor = distributorId; }

    const [records, requests, distributors] = await Promise.all([
      DeliveryRecord.find(recFilter)
        .select("distributor customer shopName status source idlyKg dosaKg extraItems amountCharged cashAmount onlineAmount amountPaid creditAmount").lean(),
      BatterRequest.find(reqFilter).select("distributor customerOrders").lean(),
      Distributor.find(distributorId ? { _id: distributorId } : {}).select("name employeeId").lean(),
    ]);

    // distributorId -> customerKey -> list of entries
    const perDist = {};
    const dist = (id) => (perDist[String(id)] = perDist[String(id)] || {});
    const addEntry = (distId, custKey, entry) => {
      const d = dist(distId);
      (d[custKey] = d[custKey] || []).push(entry);
    };

    for (const r of records) {
      addEntry(r.distributor, String(r.customer), {
        customerId: String(r.customer), shopName: r.shopName, status: r.status, source: r.source || "request",
        idlyKg: r.idlyKg || 0, dosaKg: r.dosaKg || 0, extraItems: r.extraItems || [],
        amountCharged: r.amountCharged || 0, cashAmount: r.status === "delivered" ? cashOf(r) : 0,
        onlineAmount: r.status === "delivered" ? onlineOf(r) : 0, creditAmount: r.status === "delivered" ? (r.creditAmount || 0) : 0,
      });
    }
    // Shops in an approved request that haven't been closed yet are "pending".
    for (const rq of requests) {
      for (const co of rq.customerOrders || []) {
        const custKey = co.customer ? String(co.customer) : `name:${co.shopName}`;
        const closed = (dist(rq.distributor)[custKey] || []).some((e) => e.source !== "manual");
        if (closed) continue;
        addEntry(rq.distributor, custKey, {
          customerId: co.customer ? String(co.customer) : null, shopName: co.shopName, status: "pending", source: "request",
          idlyKg: co.idlyKg || 0, dosaKg: co.dosaKg || 0, extraItems: co.extraItems || [],
          amountCharged: null, cashAmount: 0, onlineAmount: 0, creditAmount: 0,
        });
      }
    }

    const rank = (entries) =>
      entries.some((e) => e.status === "delivered") ? "delivered"
      : entries.some((e) => e.status === "pending") ? "pending" : "skipped";

    const totals = { shopsOrdered: 0, shopsDelivered: 0, shopsPending: 0, shopsSkipped: 0, cashCollected: 0, onlineCollected: 0, creditGiven: 0, amountDelivered: 0 };
    const distributorRows = distributors.map((d) => {
      const custs = perDist[String(d._id)] || {};
      const row = { distributorId: String(d._id), name: d.name, employeeId: d.employeeId, shopsOrdered: 0, shopsDelivered: 0, shopsPending: 0, shopsSkipped: 0, cashCollected: 0, onlineCollected: 0, creditGiven: 0 };
      for (const entries of Object.values(custs)) {
        row.shopsOrdered += 1;
        const st = rank(entries);
        if (st === "delivered") row.shopsDelivered += 1;
        else if (st === "pending") row.shopsPending += 1;
        else row.shopsSkipped += 1;
        for (const e of entries) {
          row.cashCollected += e.cashAmount; row.onlineCollected += e.onlineAmount; row.creditGiven += e.creditAmount;
          if (e.status === "delivered") totals.amountDelivered += e.amountCharged || 0;
        }
      }
      row.cashCollected = round2(row.cashCollected); row.onlineCollected = round2(row.onlineCollected); row.creditGiven = round2(row.creditGiven);
      for (const k of ["shopsOrdered", "shopsDelivered", "shopsPending", "shopsSkipped", "cashCollected", "onlineCollected", "creditGiven"]) totals[k] += row[k];
      return row;
    });
    totals.cashCollected = round2(totals.cashCollected); totals.onlineCollected = round2(totals.onlineCollected);
    totals.creditGiven = round2(totals.creditGiven); totals.amountDelivered = round2(totals.amountDelivered);

    const out = { totals, distributors: distributorRows };
    if (distributorId) {
      const custs = perDist[String(distributorId)] || {};
      out.shops = Object.values(custs).flatMap((entries) => {
        const st = rank(entries);
        return entries.map((e) => ({ ...e, shopStatus: st }));
      }).sort((a, b) => ({ pending: 0, delivered: 1, skipped: 2 }[a.status] - { pending: 0, delivered: 1, skipped: 2 }[b.status]));
    }
    res.json(out);
  } catch (err) { res.status(500).json({ message: err.message }); }
};