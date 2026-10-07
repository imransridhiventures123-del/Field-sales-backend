// FILE: src/models/PaymentReceipt.js
// NEW FILE — Feature: Ledger "Receive Payment".
// A customer paying off OLD credit later (cash or GPay). Delivery records
// only capture what was paid on the delivery day; this is how the credit
// gets settled afterwards. Customer's outstanding =
//   sum(creditAmount on delivered orders) − sum(PaymentReceipt.amount).
const mongoose = require("mongoose");

const PaymentReceiptSchema = new mongoose.Schema(
  {
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    shopName: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    mode: { type: String, enum: ["cash", "online"], required: true }, // online = GPay/UPI
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

PaymentReceiptSchema.index({ distributor: 1, customer: 1 });

module.exports = mongoose.model("PaymentReceipt", PaymentReceiptSchema);