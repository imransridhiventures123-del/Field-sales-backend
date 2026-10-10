// FILE: src/models/DistributorBill.js
// NEW FILE — Feature: Distributor bills ("what the distributor owes the
// company for the batter / products the admin approved").
// A bill is created automatically when the admin APPROVES a request
// (batter request or product request). Qty = approved qty, rate = the
// product's company rate at that moment (snapshot, so later price edits
// never change an old bill). One bill per request (unique index below).
const mongoose = require("mongoose");

const BillItemSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true },
    productName: { type: String, trim: true },
    unit: { type: String, trim: true, default: "kg" },
    qty: { type: Number, required: true },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const DistributorBillSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true, index: true },

    sourceType: { type: String, enum: ["batter_request", "product_request"], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },

    billDate: { type: Date, default: Date.now },
    items: { type: [BillItemSchema], default: [] },
    totalAmount: { type: Number, default: 0 },

    // Kept up to date by distributorBilling.recalcDistributor() — payments
    // are applied to the oldest unpaid bill first.
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "partial", "paid"], default: "pending" },
  },
  { timestamps: true }
);

// A request can only ever produce one bill, even if "approve" is hit twice.
DistributorBillSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });

module.exports = mongoose.model("DistributorBill", DistributorBillSchema);