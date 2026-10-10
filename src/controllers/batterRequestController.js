// FILE: src/controllers/batterRequestController.js
// NEW FILE — Feature: Distributors module — "Daily Requirement"
// PURPOSE:
//  - Distributor side (Distributors-PWA-App): submit today's idly/dosa
//    kg requirement, built automatically from that distributor's
//    assigned customers (feature #7 — "customers name + batter need
//    poora aisa dhalna, automatic calculate").
//  - Admin side (sidebar "Daily Requirement" tab, badge count = pending
//    requests): see every distributor's request for today, approve
//    (full or partial, with a delivery time) or reject.
const BatterRequest = require("../models/BatterRequest");
const Customer = require("../models/Customer");
const Distributor = require("../models/Distributor");
const Product = require("../models/Product");
const { createBill } = require("../utils/distributorBilling"); // NEW — distributor bills

// Idly and Dosa keep their own dedicated fields (idlyKg/dosaKg) — every
// other catalog product travels in extraItems.
const CORE_KEYS = ["idly", "dosa"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ══════════════════════ DISTRIBUTOR SIDE ══════════════════════ */

// POST /api/batter-requests  (protectDistributor)
// Body: { customerOrders: [{ customerId, idlyKg, dosaKg }] }
// The PWA screen lets the distributor tick which of their assigned
// customers ordered today + how many kg each — this endpoint totals it
// up automatically and creates (or updates, if already submitted today)
// the day's request.
exports.createOrUpdateMyRequest = async (req, res) => {
  try {
    const { customerOrders = [], requestedDeliveryDate, requestedDeliveryTime } = req.body;

    let requestedIdlyKg = 0;
    let requestedDosaKg = 0;
    const snapshot = [];
    const extraTotals = {}; // productKey -> { productKey, productName, unit, qty }

    // Catalog lookup so the name/unit stored on the request come from the
    // real product (never trusted from the phone), and a product the admin
    // has since deleted or switched off is rejected with a clear message.
    const catalog = {};
    (await Product.find()).forEach((p) => { catalog[p.key] = p; });

    for (const row of customerOrders) {
      const idlyKg = Number(row.idlyKg) || 0;
      const dosaKg = Number(row.dosaKg) || 0;

      const extraItems = [];
      for (const it of Array.isArray(row.extraItems) ? row.extraItems : []) {
        const qty = Number(it.qty) || 0;
        if (qty <= 0 || CORE_KEYS.includes(it.productKey)) continue;
        const product = catalog[it.productKey];
        if (!product || product.isActive === false) {
          return res.status(400).json({ message: `"${it.productName || it.productKey}" is no longer available. Please remove it from your cart and try again.` });
        }
        extraItems.push({ productKey: product.key, productName: product.name, unit: product.unit || "kg", qty });
        if (!extraTotals[product.key]) extraTotals[product.key] = { productKey: product.key, productName: product.name, unit: product.unit || "kg", qty: 0 };
        extraTotals[product.key].qty += qty;
      }

      if (idlyKg <= 0 && dosaKg <= 0 && extraItems.length === 0) continue;
      requestedIdlyKg += idlyKg;
      requestedDosaKg += dosaKg;

      let shopName = row.shopName;
      if (!shopName && row.customerId) {
        const c = await Customer.findById(row.customerId).select("shopName");
        shopName = c?.shopName || "";
      }
      snapshot.push({ customer: row.customerId || undefined, shopName, idlyKg, dosaKg, extraItems });
    }

    const requestedExtraItems = Object.values(extraTotals);

    if (requestedIdlyKg <= 0 && requestedDosaKg <= 0 && requestedExtraItems.length === 0) {
      return res.status(400).json({ message: "Please add at least one customer's requirement." });
    }

    const today = startOfToday();
    let request = await BatterRequest.findOne({
      distributor: req.distributor._id,
      requestDate: { $gte: today },
      status: "pending",
    });

    if (request) {
      request.requestedIdlyKg = requestedIdlyKg;
      request.requestedDosaKg = requestedDosaKg;
      request.customerOrders = snapshot;
      request.requestedExtraItems = requestedExtraItems;
      // NEW (additive) — only overwrite when provided, so nothing breaks
      // for any older client that doesn't send these fields.
      if (requestedDeliveryDate !== undefined) request.requestedDeliveryDate = requestedDeliveryDate;
      if (requestedDeliveryTime !== undefined) request.requestedDeliveryTime = requestedDeliveryTime;
      await request.save();
    } else {
      request = await BatterRequest.create({
        distributor: req.distributor._id,
        requestDate: new Date(),
        requestedIdlyKg,
        requestedDosaKg,
        customerOrders: snapshot,
        requestedExtraItems,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        requestedDeliveryTime: requestedDeliveryTime || "",
      });
    }

    res.status(201).json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/batter-requests/mine  (protectDistributor)
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await BatterRequest.find({ distributor: req.distributor._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ requests });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ══════════════════════ ADMIN SIDE ══════════════════════ */

// GET /api/batter-requests/admin?status=pending  → Daily Requirement tab
exports.getAllRequests = async (req, res) => {
  try {
    const { status, date } = req.query;
    const filter = {};
    if (status) filter.status = status;

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      filter.requestDate = { $gte: d, $lt: next };
    } else {
      filter.requestDate = { $gte: startOfToday() };
    }

    const requests = await BatterRequest.find(filter)
      .populate({ path: "distributor", select: "name employeeId phone zone currentStockKg", populate: { path: "zone", select: "name" } })
      .sort({ createdAt: -1 });

    res.json({ requests, pendingCount: requests.filter(r => r.status === "pending").length });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/batter-requests/admin/:id/approve
// Body: { approvedIdlyKg, approvedDosaKg, deliveryTime, adminNote }
// Feature #5: if approved qty < requested qty for either item, status
// becomes "partially_approved" and the note should explain why (e.g. not
// enough stock) — the PWA shows this to the distributor along with the
// delivery time.
exports.approveRequest = async (req, res) => {
  try {
    const { approvedIdlyKg, approvedDosaKg, approvedExtraItems, deliveryTime, adminNote } = req.body;
    const request = await BatterRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found." });

    const finalIdly = approvedIdlyKg !== undefined ? Number(approvedIdlyKg) : request.requestedIdlyKg;
    const finalDosa = approvedDosaKg !== undefined ? Number(approvedDosaKg) : request.requestedDosaKg;

    // NEW (additive) — other products. Body: approvedExtraItems =
    // [{ productKey, qty }]. Anything not listed defaults to the full
    // requested quantity, so an older admin screen that doesn't send this
    // field simply approves the extras in full.
    const approvedMap = {};
    if (Array.isArray(approvedExtraItems)) {
      approvedExtraItems.forEach((it) => { approvedMap[it.productKey] = Math.max(0, Number(it.qty) || 0); });
    }
    const finalExtras = (request.requestedExtraItems || []).map((it) => ({
      productKey: it.productKey,
      productName: it.productName,
      unit: it.unit,
      qty: approvedMap[it.productKey] !== undefined ? approvedMap[it.productKey] : it.qty,
    }));
    const extrasFullyApproved = (request.requestedExtraItems || []).every((it, i) => finalExtras[i].qty >= it.qty);

    request.approvedIdlyKg = finalIdly;
    request.approvedDosaKg = finalDosa;
    request.approvedExtraItems = finalExtras;
    request.deliveryTime = deliveryTime || "";
    request.adminNote = adminNote || "";
    request.respondedAt = new Date();
    request.status =
      finalIdly >= request.requestedIdlyKg && finalDosa >= request.requestedDosaKg && extrasFullyApproved
        ? "approved"
        : "partially_approved";
    await request.save();

    // bump the distributor's running stock so the admin's own tracking
    // (and the "current stock" shown on Add/Edit Distributor) stays live
    await Distributor.findByIdAndUpdate(request.distributor, {
      $inc: { "currentStockKg.idly": finalIdly, "currentStockKg.dosa": finalDosa },
    });

    // NEW — generate the distributor's bill for what was approved (company
    // rate x approved qty). A billing problem never blocks the approval.
    try {
      await createBill({
        distributor: request.distributor, sourceType: "batter_request", sourceId: request._id,
        items: [{ productKey: "idly", qty: finalIdly }, { productKey: "dosa", qty: finalDosa }, ...finalExtras.map((e) => ({ productKey: e.productKey, qty: e.qty }))],
      });
    } catch (e) { console.error("Bill generation failed (batter request):", e.message); }

    res.json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/batter-requests/admin/:id/reject
exports.rejectRequest = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const request = await BatterRequest.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", adminNote: adminNote || "", respondedAt: new Date(), approvedIdlyKg: 0, approvedDosaKg: 0, approvedExtraItems: [] },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: "Request not found." });
    res.json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};