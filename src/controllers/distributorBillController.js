// FILE: src/controllers/distributorBillController.js
// Feature: Distributor bills + ledger + credit.
//  Admin  : see every distributor's billed / received / due / credit, open one
//           distributor's bills + payments, record or undo a payment, move an
//           amount onto credit, set the distributor's credit limit.
//  Distributor (PWA): one summary number for the Home card + own bills.
//
// Money model: see src/utils/distributorBilling.js (received / due now / credit / pending).
const Distributor = require("../models/Distributor");
const DistributorBill = require("../models/DistributorBill");
const DistributorPayment = require("../models/DistributorPayment");
const { recalcDistributor, totalsFor, computeTotals, round2 } = require("../utils/distributorBilling");

/* ══════════════════════ ADMIN ══════════════════════ */

// GET /api/distributor-bills/admin/summary
exports.adminSummary = async (req, res) => {
  try {
    const distributors = await Distributor.find({ isActive: { $ne: false } }).populate("zone", "name");
    const [bills, payments] = await Promise.all([DistributorBill.find(), DistributorPayment.find()]);
    const billsBy = {}, paysBy = {};
    bills.forEach((b) => { (billsBy[String(b.distributor)] = billsBy[String(b.distributor)] || []).push(b); });
    payments.forEach((p) => { (paysBy[String(p.distributor)] = paysBy[String(p.distributor)] || []).push(p); });

    const rows = distributors.map((d) => {
      const myBills = billsBy[String(d._id)] || [];
      const t = computeTotals(myBills, paysBy[String(d._id)] || [], d.creditLimit || 0);
      const lastBillDate = myBills.reduce((m, b) => (!m || b.billDate > m ? b.billDate : m), null);
      return {
        distributor: { _id: d._id, name: d.name, employeeId: d.employeeId, phone: d.phone, zone: d.zone },
        totalBilled: t.totalBilled,
        totalPaid: t.totalPaid,          // money received
        pending: t.pending,              // total owed (due now + credit)
        dueNow: t.dueNow,
        credit: t.credit,
        creditLimit: t.creditLimit,
        billCount: t.billCount,
        lastBillDate,
      };
    }).sort((a, b) => b.pending - a.pending);

    const totals = rows.reduce((s, r) => ({
      totalBilled: round2(s.totalBilled + r.totalBilled),
      totalPaid: round2(s.totalPaid + r.totalPaid),
      pending: round2(s.pending + r.pending),
      dueNow: round2(s.dueNow + r.dueNow),
      credit: round2(s.credit + r.credit),
    }), { totalBilled: 0, totalPaid: 0, pending: 0, dueNow: 0, credit: 0 });

    res.json({ rows, totals });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/distributor-bills/admin/distributor/:id
exports.adminDistributorLedger = async (req, res) => {
  try {
    const distributor = await Distributor.findById(req.params.id).select("name employeeId phone creditLimit");
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });
    const bills = await DistributorBill.find({ distributor: req.params.id }).sort({ billDate: -1, createdAt: -1 });
    const payments = await DistributorPayment.find({ distributor: req.params.id }).sort({ receivedAt: -1, createdAt: -1 });
    res.json({ distributor, bills, payments, totals: await totalsFor(req.params.id) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/distributor-bills/admin/distributor/:id/payments
// Body: { amount, mode: "cash"|"online"|"credit", appliesTo?: "bills"|"credit", note }
//   cash/online + appliesTo "bills"  → money received against current dues (default while something is due)
//   cash/online + appliesTo "credit" → money received that repays the credit balance
//   credit                           → NO money: the amount moves onto the distributor's credit
//                                      (must be within the credit limit set for the distributor)
exports.adminAddPayment = async (req, res) => {
  try {
    const amount = round2(req.body.amount);
    const mode = ["online", "credit"].includes(req.body.mode) ? req.body.mode : "cash";
    if (!(amount > 0)) return res.status(400).json({ message: "Enter an amount greater than 0." });

    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });

    const t = await totalsFor(req.params.id);
    let appliesTo = "bills";

    if (mode === "credit") {
      if (amount > t.dueNow) {
        return res.status(400).json({ message: `Only ₹${t.dueNow} is due right now, so at most ₹${t.dueNow} can be put on credit.` });
      }
      if (!(t.creditLimit > 0)) {
        return res.status(400).json({ message: "No credit limit is set for this distributor. Set a limit in the Distributor Credits card first." });
      }
      if (amount > t.creditAvailable) {
        return res.status(400).json({
          message: `Credit limit ₹${t.creditLimit} would be exceeded (already on credit ₹${t.credit}, available ₹${t.creditAvailable}). Increase the credit limit to continue.`,
        });
      }
    } else {
      appliesTo = req.body.appliesTo === "credit" ? "credit" : req.body.appliesTo === "bills" ? "bills" : (t.dueNow > 0 ? "bills" : "credit");
      if (appliesTo === "bills" && amount > t.dueNow) {
        return res.status(400).json({ message: `Amount is more than what is due right now (₹${t.dueNow}).` });
      }
      if (appliesTo === "credit" && amount > t.credit) {
        return res.status(400).json({ message: `Amount is more than the credit balance (₹${t.credit}).` });
      }
    }

    const payment = await DistributorPayment.create({
      distributor: req.params.id, amount, mode, appliesTo, note: req.body.note || "",
    });
    await recalcDistributor(req.params.id);
    res.status(201).json({ payment, totals: await totalsFor(req.params.id) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/distributor-bills/admin/payments/:paymentId   (undo a mistake)
exports.adminDeletePayment = async (req, res) => {
  try {
    const existing = await DistributorPayment.findById(req.params.paymentId);
    if (!existing) return res.status(404).json({ message: "Payment not found." });

    // Removing a credit entry that has already been (partly) repaid would make the credit balance negative.
    if (existing.mode === "credit") {
      const t = await totalsFor(existing.distributor);
      if (round2(t.credit - existing.amount) < 0) {
        return res.status(400).json({ message: "This credit has already been repaid in part. Remove the credit repayments first." });
      }
    }
    const payment = await DistributorPayment.findByIdAndDelete(req.params.paymentId);
    await recalcDistributor(payment.distributor);
    res.json({ totals: await totalsFor(payment.distributor) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/distributor-bills/admin/distributor/:id/credit-limit    Body: { limit }
exports.adminSetCreditLimit = async (req, res) => {
  try {
    const limit = round2(req.body.limit);
    if (!Number.isFinite(limit) || limit < 0 || limit > 1e9) {
      return res.status(400).json({ message: "Credit limit must be 0 or more." });
    }
    const d = await Distributor.findByIdAndUpdate(req.params.id, { creditLimit: limit }, { new: true });
    if (!d) return res.status(404).json({ message: "Distributor not found." });
    res.json({ totals: await totalsFor(req.params.id) });
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
    // "credit" entries are admin bookkeeping, not money the distributor paid — keep them out of the payments list
    const payments = await DistributorPayment.find({ distributor: req.distributor._id, mode: { $ne: "credit" } }).sort({ receivedAt: -1, createdAt: -1 }).limit(100);
    res.json({ bills, payments, totals: await totalsFor(req.distributor._id) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};