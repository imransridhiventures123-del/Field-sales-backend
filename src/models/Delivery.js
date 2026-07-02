// FILE: src/models/Delivery.js
const mongoose = require("mongoose");

const DeliverySchema = new mongoose.Schema({
  driver:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  deliveryDate: { type: Date, required: true },
  shopName:     { type: String, required: true, trim: true },
  ownerName:    { type: String, required: true, trim: true },
  phone:        { type: String, required: true, trim: true },
  address:      { type: String, required: true, trim: true },
  latitude:     { type: Number },
  longitude:    { type: Number },
  productName:  { type: String, default: "Idly Batter", trim: true },
  quantity:     { type: Number, required: true },
  unit:         { type: String, default: "kg" },
  totalAmount:  { type: Number, required: true },
  sortOrder:    { type: Number, default: 0 },
  status:       { type: String, enum: ["pending","completed","skipped"], default: "pending" },
  amountReceived:{ type: Number, default: 0 },
  paymentType:  { type: String, enum: ["cash","gpay","mixed","pending"], default: "pending" },
  pendingAmount:{ type: Number, default: 0 },
  notes:        { type: String, trim: true },
  completedAt:  { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Delivery", DeliverySchema);