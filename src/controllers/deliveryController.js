// FILE: src/controllers/deliveryController.js
// NEW FILE — Feature: real-time distributor workflow ("Today's
// Deliveries" + margin/revenue/credit tracking).
// PURPOSE:
//  - Distributor side: after receiving approved batter, the distributor
//    goes through today's customers one by one and marks each one
//    "delivered" (with cash/credit/partial) or "skipped" (didn't take
//    the order — that kg stays in stock for tomorrow, per your carry-
//    over rule). Every delivered record also snapshots the Product
//    rates so a later admin rate change never rewrites old margin
//    history.
//  - Admin side: full visibility into every distributor's daily
//    performance — revenue, margin, who paid vs went on credit.
const DeliveryRecord = require("../models/DeliveryRecord");
const Distributor = require("../models/Distributor");
const Product = require("../models/Product");

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

/* ══════════════════════ DISTRIBUTOR SIDE ══════════════════════ */

// POST /api/deliveries  (protectDistributor)
// Body: { batterRequestId, records: [{ customerId, shopName, idlyKg, dosaKg,
//         status: "delivered"|"skipped", paymentStatus, amountCharged, amountPaid, skipReason }] }
exports.submitDeliveries = async (req, res) => {
  try {
    const { batterRequestId, records = [] } = req.body;
    if (!records.length) return res.status(400).json({ message: "No delivery records provided." });

    const rates = await getRateMap();
    const idlyRate = rates.idly || { companyRatePerKg: 0, customerRatePerKg: 0 };
    const dosaRate = rates.dosa || { companyRatePerKg: 0, customerRatePerKg: 0 };

    let stockIdlyUsed = 0;
    let stockDosaUsed = 0;
    const created = [];

    for (const r of records) {
      const idlyKg = Number(r.idlyKg) || 0;
      const dosaKg = Number(r.dosaKg) || 0;
      const status = r.status === "skipped" ? "skipped" : "delivered";

      // NEW (additive) — other catalog products on this delivery. Prices
      // are read from the catalog here on the server (not trusted from the
      // phone) and snapshotted on the record.
      const extraItems = [];
      let extraCost = 0;
      let extraCharge = 0;
      for (const it of Array.isArray(r.extraItems) ? r.extraItems : []) {
        const qty = Number(it.qty) || 0;
        if (qty <= 0 || it.productKey === "idly" || it.productKey === "dosa") continue;
        const p = rates[it.productKey];
        const companyRate = p?.companyRatePerKg || 0;
        const customerRate = p?.customerRatePerKg || 0;
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
      const defaultCharge = idlyKg * idlyRate.customerRatePerKg + dosaKg * dosaRate.customerRatePerKg + extraCharge;
      const amountCharged = r.amountCharged !== undefined ? Number(r.amountCharged) : defaultCharge;
      const margin = amountCharged - companyCost;

      let paymentStatus = r.paymentStatus || "paid";
      let amountPaid = 0;
      let creditAmount = 0;
      if (status === "delivered") {
        if (paymentStatus === "paid") { amountPaid = amountCharged; creditAmount = 0; }
        else if (paymentStatus === "credit") { amountPaid = 0; creditAmount = amountCharged; }
        else { // partial
          amountPaid = Number(r.amountPaid) || 0;
          creditAmount = Math.max(0, amountCharged - amountPaid);
        }
      }

      const record = await DeliveryRecord.create({
        distributor: req.distributor._id,
        customer: r.customerId,
        shopName: r.shopName || "",
        batterRequest: batterRequestId || undefined,
        date: new Date(),
        idlyKg, dosaKg,
        extraItems,
        idlyCompanyRate: idlyRate.companyRatePerKg,
        idlyCustomerRate: idlyRate.customerRatePerKg,
        dosaCompanyRate: dosaRate.companyRatePerKg,
        dosaCustomerRate: dosaRate.customerRatePerKg,
        amountCharged, companyCost, margin,
        paymentStatus, amountPaid, creditAmount,
        status,
        skipReason: status === "skipped" ? (r.skipReason || "") : "",
      });
      created.push(record);

      // Only DELIVERED kg leaves the fridge. Skipped kg stays in stock —
      // this is exactly the carry-over behaviour you described: nothing
      // extra to compute, currentStockKg is just never decremented for it.
      if (status === "delivered") {
        stockIdlyUsed += idlyKg;
        stockDosaUsed += dosaKg;
      }
    }

    if (stockIdlyUsed > 0 || stockDosaUsed > 0) {
      await Distributor.findByIdAndUpdate(req.distributor._id, {
        $inc: { "currentStockKg.idly": -stockIdlyUsed, "currentStockKg.dosa": -stockDosaUsed },
      });
    }

    res.status(201).json({ records: created });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/mine?date=YYYY-MM-DD  (protectDistributor)
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
// Powers the PWA Home page: today's margin, total margin, today's
// collections, today's credits, total revenue.
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

    res.json({
      todayMargin: todayAgg?.todayMargin || 0,
      todayRevenue: todayAgg?.todayRevenue || 0,
      todayCollections: todayAgg?.todayCollections || 0,
      todayCredits: todayAgg?.todayCredits || 0,
      totalMargin: allTimeAgg?.totalMargin || 0,
      totalRevenue: allTimeAgg?.totalRevenue || 0,
      totalCredits: allTimeAgg?.totalCredits || 0,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/deliveries/mine/ledger  (protectDistributor)
// Powers the PWA Ledger page: how much each customer currently owes
// (sum of unpaid creditAmount across all their deliveries, most-owing
// first), plus the distributor's most recent transactions (payments
// received + orders delivered) for the activity timeline.
exports.getMyLedger = async (req, res) => {
  try {
    const distributorId = req.distributor._id;

    const customerLedger = await DeliveryRecord.aggregate([
      { $match: { distributor: distributorId, status: "delivered", creditAmount: { $gt: 0 } } },
      { $group: { _id: "$customer", shopName: { $last: "$shopName" }, outstanding: { $sum: "$creditAmount" } } },
      { $sort: { outstanding: -1 } },
      { $limit: 20 },
    ]);

    const recent = await DeliveryRecord.find({ distributor: distributorId, status: "delivered" })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("shopName amountPaid paymentStatus amountCharged createdAt");

    const recentTransactions = recent.map((r) => ({
      type: r.amountPaid > 0 ? "payment" : "order",
      title: r.amountPaid > 0 ? "Payment Received" : "Order Delivered",
      customer: r.shopName,
      date: r.createdAt,
      amount: r.amountPaid > 0 ? r.amountPaid : r.amountCharged,
    }));

    res.json({
      customerLedger: customerLedger.map((c) => ({ customerId: c._id, shopName: c.shopName, outstanding: c.outstanding })),
      recentTransactions,
    });
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
// Used by the extended per-distributor admin dashboard page.
exports.getAdminSummary = async (req, res) => {
  try {
    const { distributorId } = req.query;
    if (!distributorId) return res.status(400).json({ message: "distributorId is required." });
    const today = startOfToday();

    const [todayAgg] = await DeliveryRecord.aggregate([
      { $match: { distributor: new (require("mongoose").Types.ObjectId)(distributorId), date: { $gte: today }, status: "delivered" } },
      { $group: { _id: null, todayMargin: { $sum: "$margin" }, todayRevenue: { $sum: "$amountCharged" }, todayCollections: { $sum: "$amountPaid" }, todayCredits: { $sum: "$creditAmount" } } },
    ]);
    const [allTimeAgg] = await DeliveryRecord.aggregate([
      { $match: { distributor: new (require("mongoose").Types.ObjectId)(distributorId), status: "delivered" } },
      { $group: { _id: null, totalMargin: { $sum: "$margin" }, totalRevenue: { $sum: "$amountCharged" }, totalCredits: { $sum: "$creditAmount" } } },
    ]);

    res.json({
      todayMargin: todayAgg?.todayMargin || 0,
      todayRevenue: todayAgg?.todayRevenue || 0,
      todayCollections: todayAgg?.todayCollections || 0,
      todayCredits: todayAgg?.todayCredits || 0,
      totalMargin: allTimeAgg?.totalMargin || 0,
      totalRevenue: allTimeAgg?.totalRevenue || 0,
      totalCredits: allTimeAgg?.totalCredits || 0,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};