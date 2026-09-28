// FILE: src/models/BatterRequest.js
// NEW FILE — Feature: Distributors module — "Daily Requirement"
// PURPOSE: Every day a distributor opens the Distributors-PWA-App and
// requests how many kg of Idly batter + Dosa batter they need (based on
// their assigned customers' orders that day). The admin sees all of
// these on the "Daily Requirement" tab, checks current stock, and
// approves (fully or partially, with a delivery time) or rejects.
const mongoose = require("mongoose");

// NEW (additive) — Feature: admin-managed product catalog (Level 2).
// Any product OTHER than Idly/Dosa that a customer ordered. Idly and Dosa
// keep using idlyKg/dosaKg exactly as before (so every old request, the
// stock tracking and the approval numbers stay untouched); every other
// catalog product is recorded here with a snapshot of its name and unit,
// so the request still reads correctly even if the product is renamed or
// deleted later.
const ExtraItemSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true },
    productName: { type: String, trim: true },
    unit: { type: String, trim: true, default: "kg" },
    qty: { type: Number, default: 0 },
  },
  { _id: false }
);

const BatterRequestSchema = new mongoose.Schema(
  {
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      required: true,
    },

    requestDate: { type: Date, required: true, default: Date.now },

    // What the distributor asked for
    requestedIdlyKg: { type: Number, default: 0 },
    requestedDosaKg: { type: Number, default: 0 },

    // NEW (additive) — Feature: Request Batter delivery date/time. The
    // distributor picks WHEN they need this batter delivered, right on
    // the request form. Shown to admin on the Daily Requirement page.
    requestedDeliveryDate: { type: Date },
    requestedDeliveryTime: { type: String, trim: true, default: "" }, // e.g. "6:30 PM"

    // Snapshot of the customers/orders behind this request, so the admin
    // can see "today distributor X needs 40kg because these 12 customers
    // ordered" without having to cross-reference separately.
    customerOrders: [
      {
        customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
        shopName: { type: String, trim: true },
        idlyKg: { type: Number, default: 0 },
        dosaKg: { type: Number, default: 0 },
        // NEW (additive) — this customer's other-product quantities
        extraItems: { type: [ExtraItemSchema], default: [] },
      },
    ],

    // NEW (additive) — request-level totals of the other (non Idly/Dosa)
    // products across all customers, and what the admin approved of them.
    requestedExtraItems: { type: [ExtraItemSchema], default: [] },
    approvedExtraItems: { type: [ExtraItemSchema], default: [] },

    status: {
      type: String,
      enum: ["pending", "approved", "partially_approved", "rejected"],
      default: "pending",
    },

    // What the admin actually approved
    approvedIdlyKg: { type: Number, default: 0 },
    approvedDosaKg: { type: Number, default: 0 },
    deliveryTime: { type: String, trim: true, default: "" }, // e.g. "6:30 PM"
    adminNote: { type: String, trim: true, default: "" },

    respondedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BatterRequest", BatterRequestSchema);