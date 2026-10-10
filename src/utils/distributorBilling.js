// FILE: src/utils/distributorBilling.js
// NEW FILE — Feature: Distributor bills. Shared helpers used by the two
// approve functions (batter request / product request) and the ledger
// controller. Nothing here touches any existing model.
const DistributorBill = require("../models/DistributorBill");
const DistributorPayment = require("../models/DistributorPayment");
const Product = require("../models/Product");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function billPrefix(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `DB-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`;
}

// Applies ALL payments of a distributor to their bills, oldest bill first,
// and refreshes every bill's paidAmount + status. Safe to call any number
// of times (it always recomputes from the payments + bills).
async function recalcDistributor(distributorId) {
  const payments = await DistributorPayment.find({ distributor: distributorId });
  let remaining = round2(payments.reduce((s, p) => s + p.amount, 0));
  const bills = await DistributorBill.find({ distributor: distributorId }).sort({ billDate: 1, createdAt: 1 });
  for (const b of bills) {
    const paid = round2(Math.min(remaining, b.totalAmount));
    remaining = round2(remaining - paid);
    const status = paid >= b.totalAmount ? "paid" : paid > 0 ? "partial" : "pending";
    if (b.paidAmount !== paid || b.status !== status) {
      b.paidAmount = paid;
      b.status = status;
      await b.save();
    }
  }
}

// items = [{ productKey, qty }] — rate/name/unit are read from the catalog
// (company rate). Returns the bill, the already-existing bill for this
// request, or null when there is nothing to bill (all qty 0 / all rates 0).
async function createBill({ distributor, sourceType, sourceId, items }) {
  const existing = await DistributorBill.findOne({ sourceType, sourceId });
  if (existing) return existing;

  const catalog = {};
  (await Product.find()).forEach((p) => { catalog[p.key] = p; });

  const lines = [];
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const p = catalog[it.productKey];
    if (qty <= 0 || !p) continue;
    const rate = round2(p.companyRatePerKg || 0);
    lines.push({ productKey: p.key, productName: p.name, unit: p.unit || "kg", qty, rate, amount: round2(qty * rate) });
  }
  const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
  if (lines.length === 0 || totalAmount <= 0) return null;

  const prefix = billPrefix();
  let seq = (await DistributorBill.countDocuments({ billNumber: new RegExp("^" + prefix) })) + 1;
  let bill;
  for (let attempt = 0; attempt < 5; attempt++, seq++) {
    try {
      bill = await DistributorBill.create({
        billNumber: `${prefix}${String(seq).padStart(4, "0")}`,
        distributor, sourceType, sourceId, items: lines, totalAmount,
      });
      break;
    } catch (e) {
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern.billNumber) continue; // number taken — try next
      if (e && e.code === 11000) return await DistributorBill.findOne({ sourceType, sourceId }); // double approve
      throw e;
    }
  }
  if (!bill) throw new Error("Could not allocate a bill number.");
  await recalcDistributor(distributor);
  return await DistributorBill.findById(bill._id);
}

async function totalsFor(distributorId) {
  const bills = await DistributorBill.find({ distributor: distributorId });
  const totalBilled = round2(bills.reduce((s, b) => s + b.totalAmount, 0));
  const totalPaid = round2(bills.reduce((s, b) => s + b.paidAmount, 0));
  return { totalBilled, totalPaid, pending: round2(totalBilled - totalPaid), billCount: bills.length };
}

module.exports = { createBill, recalcDistributor, totalsFor, round2 };