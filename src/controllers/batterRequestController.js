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

    for (const row of customerOrders) {
      const idlyKg = Number(row.idlyKg) || 0;
      const dosaKg = Number(row.dosaKg) || 0;
      if (idlyKg <= 0 && dosaKg <= 0) continue;
      requestedIdlyKg += idlyKg;
      requestedDosaKg += dosaKg;

      let shopName = row.shopName;
      if (!shopName && row.customerId) {
        const c = await Customer.findById(row.customerId).select("shopName");
        shopName = c?.shopName || "";
      }
      snapshot.push({ customer: row.customerId || undefined, shopName, idlyKg, dosaKg });
    }

    if (requestedIdlyKg <= 0 && requestedDosaKg <= 0) {
      return res.status(400).json({ message: "Please add at least one customer's kg requirement." });
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
    const { approvedIdlyKg, approvedDosaKg, deliveryTime, adminNote } = req.body;
    const request = await BatterRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found." });

    const finalIdly = approvedIdlyKg !== undefined ? Number(approvedIdlyKg) : request.requestedIdlyKg;
    const finalDosa = approvedDosaKg !== undefined ? Number(approvedDosaKg) : request.requestedDosaKg;

    request.approvedIdlyKg = finalIdly;
    request.approvedDosaKg = finalDosa;
    request.deliveryTime = deliveryTime || "";
    request.adminNote = adminNote || "";
    request.respondedAt = new Date();
    request.status =
      finalIdly >= request.requestedIdlyKg && finalDosa >= request.requestedDosaKg
        ? "approved"
        : "partially_approved";
    await request.save();

    // bump the distributor's running stock so the admin's own tracking
    // (and the "current stock" shown on Add/Edit Distributor) stays live
    await Distributor.findByIdAndUpdate(request.distributor, {
      $inc: { "currentStockKg.idly": finalIdly, "currentStockKg.dosa": finalDosa },
    });

    res.json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/batter-requests/admin/:id/reject
exports.rejectRequest = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const request = await BatterRequest.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", adminNote: adminNote || "", respondedAt: new Date(), approvedIdlyKg: 0, approvedDosaKg: 0 },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: "Request not found." });
    res.json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};