// FILE: src/models/DistributorPayment.js
// NEW FILE — Feature: Distributor bills. A payment the distributor made
// to the company (recorded by the admin). Payments are not tied to one
// bill; they are applied to the oldest unpaid bills first.
const mongoose = require("mongoose");

const DistributorPaymentSchema = new mongoose.Schema(
  {
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    // "cash" / "online" = money received.
    // "credit"          = NO money: admin moved this amount of the bill onto the distributor's
    //                     credit (still owed, but tracked in the credit balance, within creditLimit).
    mode: { type: String, enum: ["cash", "online", "credit"], default: "cash" },
    // For cash/online only: "bills" = pays current dues, "credit" = repays the credit balance.
    appliesTo: { type: String, enum: ["bills", "credit"], default: "bills" },
    note: { type: String, trim: true, default: "" },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DistributorPayment", DistributorPaymentSchema);