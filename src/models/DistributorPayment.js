// FILE: src/models/DistributorPayment.js
// NEW FILE — Feature: Distributor bills. A payment the distributor made
// to the company (recorded by the admin). Payments are not tied to one
// bill; they are applied to the oldest unpaid bills first.
const mongoose = require("mongoose");

const DistributorPaymentSchema = new mongoose.Schema(
  {
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    mode: { type: String, enum: ["cash", "online"], default: "cash" },
    note: { type: String, trim: true, default: "" },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DistributorPayment", DistributorPaymentSchema);