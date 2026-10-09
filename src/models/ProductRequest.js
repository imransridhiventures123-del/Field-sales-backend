// FILE: src/models/ProductRequest.js
// NEW FILE — Feature: "Request Product" (distributor Home page button).
// PURPOSE: A distributor picks any admin-added product(s) + quantity and
// the day/time they want it. The price is NOT typed by the distributor —
// it is copied from the admin's product catalog (company rate) at the
// moment the request is sent, so it stays fixed even if the admin edits
// the catalog later. Admin approves (full / partial) with their own
// delivery day + time, or rejects.
// This is a brand-new collection: BatterRequest (the Orders-tab cart
// flow) is NOT touched.
const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true },
    productName: { type: String, trim: true },
    unit: { type: String, trim: true, default: "kg" },
    qty: { type: Number, required: true, min: 0 },
    ratePerUnit: { type: Number, default: 0 },   // fixed price snapshot
    approvedQty: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProductRequestSchema = new mongoose.Schema(
  {
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true, index: true },

    items: { type: [ItemSchema], default: [] },
    totalAmount: { type: Number, default: 0 },       // sum(qty * ratePerUnit) at request time
    distributorNote: { type: String, trim: true, default: "" },

    // What the distributor asked for — "YYYY-MM-DD" and "HH:mm"
    requestedDeliveryDate: { type: String, trim: true, default: "" },
    requestedDeliveryTime: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "partially_approved", "rejected"],
      default: "pending",
      index: true,
    },

    // What the admin decided
    deliveryDate: { type: String, trim: true, default: "" },
    deliveryTime: { type: String, trim: true, default: "" },
    adminNote: { type: String, trim: true, default: "" },
    respondedAt: { type: Date },

    // Guard so batter stock can never be added twice for one request.
    stockApplied: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductRequest", ProductRequestSchema);