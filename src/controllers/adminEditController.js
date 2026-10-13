// FILE: src/controllers/adminEditController.js
// NEW FILE — Feature: admin can EDIT (1) a distributor's fridge stock and
// (2) the Cash / GPay / Credit split of a delivered order.
// Everything else (routes, models, drivers' app, distributor app) is untouched.
const mongoose = require("mongoose");
const Distributor = require("../models/Distributor");
const DeliveryRecord = require("../models/DeliveryRecord");
const DistributorBill = require("../models/DistributorBill");
const DistributorPayment = require("../models/DistributorPayment");
const Product = require("../models/Product");
const { recalcDistributor, totalsFor, round2 } = require("../utils/distributorBilling");

const num = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));
const bad = (v) => !Number.isFinite(v) || v < 0;

/* ───────────────────────── 1. DELIVERY: change cash / online / credit ─────────────────────────
   PUT /api/deliveries/admin/:id/payment   (protectAdmin)
   Body: { cashAmount, onlineAmount, creditAmount }  — must add up to the order amount.
   Only the payment split changes. Kg, rates and the billed amount stay as they were.
   The distributor's customer ledger / outstanding / summaries are computed from these
   fields, so they update by themselves.                                                       */
exports.updateDeliveryPayment = async (req, res) => {
  try {
    const rec = await DeliveryRecord.findById(req.params.id);
    if (!rec) return res.status(404).json({ message: "Delivery not found." });
    if (rec.status !== "delivered") {
      return res.status(400).json({ message: "Only a delivered order can have its payment edited." });
    }

    const cash = num(req.body.cashAmount), online = num(req.body.onlineAmount), credit = num(req.body.creditAmount);
    if ([cash, online, credit].some(bad)) {
      return res.status(400).json({ message: "Cash, GPay and Credit must be numbers of 0 or more." });
    }
    const amount = round2(rec.amountCharged);
    if (Math.abs(cash + online + credit - amount) > 0.01) {
      return res.status(400).json({ message: `Cash + GPay + Credit must add up to ₹${amount}.` });
    }

    rec.cashAmount = round2(cash);
    rec.onlineAmount = round2(online);
    rec.creditAmount = round2(credit);
    rec.amountPaid = round2(cash + online);                 // always cash + GPay (older screens read this)
    rec.paymentStatus = rec.creditAmount <= 0 ? "paid" : rec.amountPaid <= 0 ? "credit" : "partial";
    await rec.save();

    res.json({ record: rec });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ───────────────────────── 2. DISTRIBUTOR: edit fridge stock ─────────────────────────
   PUT /api/distributors/admin/:id/stock   (protectAdmin)
   Body: { idly, dosa,                       // the NEW stock in kg
           billAmount?, cashCollected?, mode?, note? }   // only used when stock INCREASES
   • Decrease / same  → just sets the stock.
   • Increase         → also creates a distributor BILL for the extra kg (default = extra kg ×
                        company rate; admin can type another amount) and, if cash was collected,
                        a PAYMENT. Both feed the existing admin + distributor ledger.          */
exports.updateDistributorStock = async (req, res) => {
  let before = null;
  try {
    const dist = await Distributor.findById(req.params.id);
    if (!dist) return res.status(404).json({ message: "Distributor not found." });

    const newIdly = round2(num(req.body.idly)), newDosa = round2(num(req.body.dosa));
    if ([newIdly, newDosa].some(bad) || newIdly > 100000 || newDosa > 100000) {
      return res.status(400).json({ message: "Stock must be a number of 0 or more." });
    }
    const oldIdly = round2(dist.currentStockKg?.idly || 0), oldDosa = round2(dist.currentStockKg?.dosa || 0);
    const dIdly = round2(newIdly - oldIdly), dDosa = round2(newDosa - oldDosa);
    const increased = dIdly > 0 || dDosa > 0;

    // ---- work out the bill + payment BEFORE touching anything ----
    let lines = [], billTotal = 0, cash = 0;
    if (increased) {
      const catalog = {};
      (await Product.find()).forEach((p) => { catalog[p.key] = p; });
      const parts = [["idly", dIdly], ["dosa", dDosa]].filter(([, q]) => q > 0).map(([key, qty]) => {
        const p = catalog[key];
        const rate = round2(p?.companyRatePerKg || 0);
        return { productKey: key, productName: p?.name || key, unit: p?.unit || "kg", qty, rate, amount: round2(qty * rate) };
      });
      const computed = round2(parts.reduce((s, l) => s + l.amount, 0));
      const askedRaw = req.body.billAmount;
      const asked = askedRaw === undefined || askedRaw === null || askedRaw === "" ? computed : round2(Number(askedRaw));
      if (bad(asked)) return res.status(400).json({ message: "Bill amount must be a number of 0 or more." });
      billTotal = asked;

      if (billTotal > 0) {
        if (Math.abs(billTotal - computed) <= 0.01) {
          lines = parts;
        } else {
          // custom amount: share it across the lines in proportion to their kg value, keep qty
          const basis = computed > 0 ? computed : parts.reduce((s, l) => s + l.qty, 0);
          let used = 0;
          lines = parts.map((l, i) => {
            const share = computed > 0 ? l.amount : l.qty;
            const amount = i === parts.length - 1 ? round2(billTotal - used) : round2((billTotal * share) / basis);
            used = round2(used + amount);
            return { ...l, amount, rate: round2(amount / l.qty) };
          });
        }
      }

      cash = round2(num(req.body.cashCollected));
      if (bad(cash)) return res.status(400).json({ message: "Cash collected must be a number of 0 or more." });
      const { dueNow } = await totalsFor(dist._id);   // cash can only pay what is due now (not amounts already on credit)
      if (cash > round2(dueNow + billTotal)) {
        return res.status(400).json({ message: `Cash collected is more than what is due (₹${round2(dueNow + billTotal)}).` });
      }
    }

    // ---- 1) set the stock ----
    before = { idly: oldIdly, dosa: oldDosa };
    dist.currentStockKg = { idly: newIdly, dosa: newDosa };
    await dist.save();

    // ---- 2) bill + payment (only on increase) ----
    let bill = null, payment = null;
    if (increased) {
      try {
        if (billTotal > 0) {
          const p = (x) => String(x).padStart(2, "0");
          const d = new Date();
          const prefix = `DB-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`;
          let seq = (await DistributorBill.countDocuments({ billNumber: new RegExp("^" + prefix) })) + 1;
          for (let attempt = 0; attempt < 5 && !bill; attempt++, seq++) {
            try {
              bill = await DistributorBill.create({
                billNumber: `${prefix}${String(seq).padStart(4, "0")}`,
                distributor: dist._id, sourceType: "stock_adjustment", sourceId: new mongoose.Types.ObjectId(),
                items: lines, totalAmount: billTotal,
              });
            } catch (e) {
              if (!(e && e.code === 11000)) throw e;   // number already taken → try the next one
            }
          }
          if (!bill) throw new Error("Could not allocate a bill number.");
        }
        if (cash > 0) {
          payment = await DistributorPayment.create({
            distributor: dist._id, amount: cash,
            mode: req.body.mode === "online" ? "online" : "cash",
            note: (req.body.note || "").toString().trim() || "Collected with fridge stock increase",
          });
        }
        await recalcDistributor(dist._id);
      } catch (e) {
        // best-effort undo so the stock never changes without its bill
        if (bill) await DistributorBill.findByIdAndDelete(bill._id).catch(() => {});
        if (payment) await DistributorPayment.findByIdAndDelete(payment._id).catch(() => {});
        dist.currentStockKg = before;
        await dist.save().catch(() => {});
        await recalcDistributor(dist._id).catch(() => {});
        throw e;
      }
    }

    res.json({
      currentStockKg: dist.currentStockKg,
      change: { idly: dIdly, dosa: dDosa },
      bill, payment,
      totals: await totalsFor(dist._id),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};