// FILE: src/controllers/productRequestController.js
// NEW FILE — Feature: "Request Product".
//  Distributor side: send a request for any catalog product(s) with the
//    day/time they want it; list my requests.
//  Admin side: list requests, approve (with delivery day + time) or reject.
//  Approving   -> batter (Idly/Dosa) stock INCREASES by the approved kg,
//                 exactly once, and the distributor gets a notification.
//  Rejecting / pending -> stock unchanged.
//  (Batter stock DECREASES when deliveries are completed — that existing
//   logic in deliveryController is not changed.)
const ProductRequest = require("../models/ProductRequest");
const Notification = require("../models/Notification");
const Distributor = require("../models/Distributor");
const Product = require("../models/Product");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const fmtDate = (s) => {
  if (!DATE_RE.test(s || "")) return s || "";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};
const fmtTime = (s) => {
  if (!TIME_RE.test(s || "")) return s || "";
  let [h, m] = s.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
};

/* ══════════════════════ DISTRIBUTOR SIDE ══════════════════════ */

// POST /api/product-requests  (protectDistributor)
// Body: { items: [{ productKey, qty }], requestedDeliveryDate, requestedDeliveryTime, note }
exports.createRequest = async (req, res) => {
  try {
    const { items, requestedDeliveryDate, requestedDeliveryTime, note } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Please select at least one product." });
    }
    if (!DATE_RE.test(requestedDeliveryDate || "")) return res.status(400).json({ message: "Please choose the delivery day." });
    if (!TIME_RE.test(requestedDeliveryTime || "")) return res.status(400).json({ message: "Please choose the delivery time." });

    const catalog = {};
    (await Product.find()).forEach((p) => { catalog[p.key] = p; });

    const merged = {};
    for (const it of items) {
      const qty = Number(it.qty);
      if (!qty || qty <= 0) continue;
      const p = catalog[it.productKey];
      if (!p || p.isActive === false) {
        return res.status(400).json({ message: `"${it.productName || it.productKey}" is no longer available. Please remove it and try again.` });
      }
      if (!merged[p.key]) {
        // Price comes from the catalog (company rate) — never from the phone.
        merged[p.key] = { productKey: p.key, productName: p.name, unit: p.unit || "kg", qty: 0, ratePerUnit: p.companyRatePerKg || 0, approvedQty: 0 };
      }
      merged[p.key].qty += qty;
    }
    const list = Object.values(merged);
    if (list.length === 0) return res.status(400).json({ message: "Please enter a quantity for at least one product." });

    const totalAmount = list.reduce((s, it) => s + it.qty * it.ratePerUnit, 0);

    const request = await ProductRequest.create({
      distributor: req.distributor._id,
      items: list,
      totalAmount,
      distributorNote: note || "",
      requestedDeliveryDate,
      requestedDeliveryTime,
    });
    res.status(201).json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/product-requests/mine  (protectDistributor)
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ProductRequest.find({ distributor: req.distributor._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ requests });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ══════════════════════ ADMIN SIDE ══════════════════════ */

// GET /api/product-requests/admin?status=pending  (protectAdmin)
exports.getAllRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const requests = await ProductRequest.find(filter)
      .populate({ path: "distributor", select: "name employeeId phone zone currentStockKg", populate: { path: "zone", select: "name" } })
      .sort({ createdAt: -1 })
      .limit(200);
    const pendingCount = await ProductRequest.countDocuments({ status: "pending" });
    res.json({ requests, pendingCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/product-requests/admin/:id/approve  (protectAdmin)
// Body: { approvedItems: [{ productKey, qty }], deliveryDate, deliveryTime, adminNote }
exports.approveRequest = async (req, res) => {
  try {
    const { approvedItems, deliveryDate, deliveryTime, adminNote } = req.body;
    if (!DATE_RE.test(deliveryDate || "")) return res.status(400).json({ message: "Please choose the delivery day." });
    if (!TIME_RE.test(deliveryTime || "")) return res.status(400).json({ message: "Please choose the delivery time." });

    const request = await ProductRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") return res.status(400).json({ message: "This request has already been answered." });

    // Approved qty per item: defaults to the full requested qty, and can
    // never exceed what was requested.
    const map = {};
    if (Array.isArray(approvedItems)) approvedItems.forEach((a) => { map[a.productKey] = Math.max(0, Number(a.qty) || 0); });
    const finalItems = request.items.map((it) => {
      const wanted = map[it.productKey] !== undefined ? map[it.productKey] : it.qty;
      return { ...it.toObject(), approvedQty: Math.min(wanted, it.qty) };
    });
    if (finalItems.every((it) => it.approvedQty <= 0)) {
      return res.status(400).json({ message: "Approved quantity is zero for every product. Use Reject instead." });
    }
    const full = finalItems.every((it) => it.approvedQty >= it.qty);

    // Atomic claim — two clicks / two admins can never approve (and add
    // stock) twice.
    const claimed = await ProductRequest.findOneAndUpdate(
      { _id: request._id, status: "pending", stockApplied: false },
      {
        $set: {
          items: finalItems,
          status: full ? "approved" : "partially_approved",
          deliveryDate, deliveryTime,
          adminNote: adminNote || "",
          respondedAt: new Date(),
          stockApplied: true,
        },
      },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "This request was just answered by someone else." });

    // Batter stock increases by the approved kg (Idly / Dosa only).
    const inc = {};
    finalItems.forEach((it) => {
      if (it.productKey === "idly" || it.productKey === "dosa") inc[`currentStockKg.${it.productKey}`] = (inc[`currentStockKg.${it.productKey}`] || 0) + it.approvedQty;
    });
    try {
      if (Object.keys(inc).length) await Distributor.findByIdAndUpdate(claimed.distributor, { $inc: inc });
    } catch (e) {
      await ProductRequest.findByIdAndUpdate(claimed._id, { $set: { status: "pending", stockApplied: false } });
      throw e;
    }

    const when = `${fmtTime(deliveryTime)} on ${fmtDate(deliveryDate)}`;
    await Notification.create({
      distributor: claimed.distributor,
      type: full ? "request_approved" : "request_partial",
      title: full ? "Request approved" : "Request partially approved",
      message: full
        ? `Admin approved your request and will send it at ${when}.`
        : `Admin partially approved your request and will send it at ${when}.`,
      note: adminNote || "",
      productRequest: claimed._id,
    });

    res.json({ request: claimed });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/product-requests/admin/:id/reject  (protectAdmin)
exports.rejectRequest = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const request = await ProductRequest.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { $set: { status: "rejected", adminNote: adminNote || "", respondedAt: new Date() } },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: "Pending request not found." });
    await Notification.create({
      distributor: request.distributor,
      type: "request_rejected",
      title: "Request rejected",
      message: "Admin could not approve your request.",
      note: adminNote || "",
      productRequest: request._id,
    });
    res.json({ request });
  } catch (err) { res.status(500).json({ message: err.message }); }
};