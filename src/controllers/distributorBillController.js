// FILE: src/controllers/distributorBillController.js
// NEW FILE — Feature: Distributor bills + ledger.
//  Admin  : see every distributor's billed / received / pending, open one
//           distributor's bills + payments, record or undo a payment.
//  Distributor (PWA): one summary number for the Home card + own bills.
const Distributor = require("../models/Distributor");
const DistributorBill = require("../models/DistributorBill");
const DistributorPayment = require("../models/DistributorPayment");
const { recalcDistributor, totalsFor, round2 } = require("../utils/distributorBilling");

/* ══════════════════════ ADMIN ══════════════════════ */

// GET /api/distributor-bills/admin/summary
exports.adminSummary = async (req, res) => {
  try {
    const distributors = await Distributor.find({ isActive: { $ne: false } }).populate("zone", "name");
    const bills = await DistributorBill.find();
    const byDist = {};
    bills.forEach((b) => {
      const k = String(b.distributor);
      if (!byDist[k]) byDist[k] = { totalBilled: 0, totalPaid: 0, billCount: 0, lastBillDate: null };
      byDist[k].totalBilled += b.totalAmount;
      byDist[k].totalPaid += b.paidAmount;
      byDist[k].billCount += 1;
      if (!byDist[k].lastBillDate || b.billDate > byDist[k].lastBillDate) byDist[k].lastBillDate = b.billDate;
    });

    const rows = distributors.map((d) => {
      const t = byDist[String(d._id)] || { totalBilled: 0, totalPaid: 0, billCount: 0, lastBillDate: null };
      return {
        distributor: { _id: d._id, name: d.name, employeeId: d.employeeId, phone: d.phone, zone: d.zone },
        totalBilled: round2(t.totalBilled),
        totalPaid: round2(t.totalPaid),
        pending: round2(t.totalBilled - t.totalPaid),
        billCount: t.billCount,
        lastBillDate: t.lastBillDate,
      };
    }).sort((a, b) => b.pending - a.pending);

    const totals = rows.reduce((s, r) => ({
      totalBilled: round2(s.totalBilled + r.totalBilled),
      totalPaid: round2(s.totalPaid + r.totalPaid),
      pending: round2(s.pending + r.pending),
    }), { totalBilled: 0, totalPaid: 0, pending: 0 });

    res.json({ rows, totals });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/distributor-bills/admin/distributor/:id
exports.adminDistributorLedger = async (req, res) => {
  try {
    const distributor = await Distributor.findById(req.params.id).select("name employeeId phone");
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });
    const bills = await DistributorBill.find({ distributor: req.params.id }).sort({ billDate: -1, createdAt: -1 });
    const payments = await DistributorPayment.find({ distributor: req.params.id }).sort({ receivedAt: -1, createdAt: -1 });
    res.json({ distributor, bills, payments, totals: await totalsFor(req.params.id) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/distributor-bills/admin/distributor/:id/payments
// Body: { amount, mode: "cash"|"online", note }
exports.adminAddPayment = async (req, res) => {
  try {
    const amount = round2(req.body.amount);
    const mode = req.body.mode === "online" ? "online" : "cash";
    if (!(amount > 0)) return res.status(400).json({ message: "Enter an amount greater than 0." });

    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });

    const { pending } = await totalsFor(req.params.id);
    if (amount > pending) {
      return res.status(400).json({ message: `Amount is more than the pending balance (₹${pending}).` });
    }

    const payment = await DistributorPayment.create({
      distributor: req.params.id, amount, mode, note: req.body.note || "",
    });
    await recalcDistributor(req.params.id);
    res.status(201).json({ payment, totals: await totalsFor(req.params.id) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/distributor-bills/admin/payments/:paymentId   (undo a mistake)
exports.adminDeletePayment = async (req, res) => {
  try {
    const payment = await DistributorPayment.findByIdAndDelete(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found." });
    await recalcDistributor(payment.distributor);
    res.json({ totals: await totalsFor(payment.distributor) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ══════════════════════ DISTRIBUTOR (PWA) ══════════════════════ */

// GET /api/distributor-bills/mine/summary   → the single Home card
exports.mySummary = async (req, res) => {
  try {
    res.json(await totalsFor(req.distributor._id));
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/distributor-bills/mine   → bills + payments page
exports.myLedger = async (req, res) => {
  try {
    const bills = await DistributorBill.find({ distributor: req.distributor._id }).sort({ billDate: -1, createdAt: -1 }).limit(100);
    const payments = await DistributorPayment.find({ distributor: req.distributor._id }).sort({ receivedAt: -1, createdAt: -1 }).limit(100);
    res.json({ bills, payments, totals: await totalsFor(req.distributor._id) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};