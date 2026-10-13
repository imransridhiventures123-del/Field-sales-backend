// FILE: src/utils/distributorBilling.js
// Shared helpers for distributor bills (approve functions + ledger controller).
//
// MONEY MODEL (all computed from bills + payments, nothing else stored):
//   totalBilled  = sum of bills
//   received     = cash/online money received            (goes to "Received")
//   creditGiven  = sum of "credit" entries               (NOT money — moved onto credit)
//   creditRepaid = cash/online received with appliesTo "credit"
//   dueNow       = totalBilled − (received towards bills) − creditGiven      (still to be settled)
//   credit       = creditGiven − creditRepaid            (credit balance the distributor holds)
//   pending      = dueNow + credit = totalBilled − received   (total the distributor owes)
const DistributorBill = require("../models/DistributorBill");
const DistributorPayment = require("../models/DistributorPayment");
const Distributor = require("../models/Distributor");
const Product = require("../models/Product");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function billPrefix(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `DB-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`;
}

const isMoney = (p) => p.mode !== "credit";
const toBills = (p) => isMoney(p) && p.appliesTo !== "credit";

// Splits a list of payments into the numbers above.
function sumPayments(payments) {
  const sum = (arr) => round2(arr.reduce((s, p) => s + p.amount, 0));
  return {
    moneyToBills: sum(payments.filter(toBills)),
    creditGiven: sum(payments.filter((p) => p.mode === "credit")),
    creditRepaid: sum(payments.filter((p) => isMoney(p) && p.appliesTo === "credit")),
  };
}

// Applies the payments to the bills, oldest bill first:
//   1) money received towards bills -> bill.paidAmount
//   2) credit moves                 -> bill.creditAmount  (the part of the bill that is on credit)
// Safe to call any number of times (always recomputes).
async function recalcDistributor(distributorId) {
  const payments = await DistributorPayment.find({ distributor: distributorId });
  const { moneyToBills, creditGiven } = sumPayments(payments);
  let money = moneyToBills, credit = creditGiven;
  const bills = await DistributorBill.find({ distributor: distributorId }).sort({ billDate: 1, createdAt: 1 });
  for (const b of bills) {
    const paid = round2(Math.min(money, b.totalAmount));
    money = round2(money - paid);
    const onCredit = round2(Math.min(credit, b.totalAmount - paid));
    credit = round2(credit - onCredit);
    const status = paid >= b.totalAmount ? "paid" : paid > 0 || onCredit > 0 ? "partial" : "pending";
    if (b.paidAmount !== paid || b.creditAmount !== onCredit || b.status !== status) {
      b.paidAmount = paid;
      b.creditAmount = onCredit;
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

// Pure maths: one distributor's numbers from their bills + payments + limit.
function computeTotals(bills, payments, creditLimit = 0) {
  const totalBilled = round2(bills.reduce((s, b) => s + b.totalAmount, 0));
  const { moneyToBills, creditGiven, creditRepaid } = sumPayments(payments);
  const totalPaid = round2(moneyToBills + creditRepaid);                    // all money received
  const pending = Math.max(round2(totalBilled - totalPaid), 0);             // total owed
  const credit = Math.max(round2(creditGiven - creditRepaid), 0);           // credit balance
  const dueNow = Math.max(round2(totalBilled - moneyToBills - creditGiven), 0);
  const limit = round2(creditLimit);
  return {
    totalBilled, totalPaid, pending, dueNow, credit,
    creditLimit: limit, creditAvailable: Math.max(round2(limit - credit), 0),
    billCount: bills.length,
  };
}

async function totalsFor(distributorId) {
  const [bills, payments, dist] = await Promise.all([
    DistributorBill.find({ distributor: distributorId }),
    DistributorPayment.find({ distributor: distributorId }),
    Distributor.findById(distributorId).select("creditLimit"),
  ]);
  return computeTotals(bills, payments, dist?.creditLimit || 0);
}

module.exports = { createBill, recalcDistributor, totalsFor, computeTotals, round2 };