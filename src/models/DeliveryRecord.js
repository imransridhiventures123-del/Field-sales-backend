// FILE: src/models/DeliveryRecord.js
// NEW FILE — Feature: Distributor real-time workflow ("Today's
// Deliveries" + margin/revenue tracking).
// PURPOSE: One row per distributor, per customer, per day. Created when
// the distributor marks a customer's order as delivered (with cash/
// credit) or skipped (customer didn't take the order that day — the kg
// stays in the distributor's fridge stock for the next day, per your
// carry-over rule). This is what powers:
//   - PWA Home page: today's margin, total margin, today's collections,
//     today's credits
//   - Admin monitoring: exactly which shop got how much, who paid vs
//     went on credit, and the margin earned on every single delivery
// Standalone collection — doesn't touch Customer, Distributor, User, or
// any existing model.
const mongoose = require("mongoose");

const DeliveryRecordSchema = new mongoose.Schema(
  {
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    shopName: { type: String, trim: true }, // snapshot, survives if customer is later edited/removed

    // Which day's approved batter request this delivery is fulfilling —
    // lets admin trace "distributor X's 150kg request → these deliveries".
    batterRequest: { type: mongoose.Schema.Types.ObjectId, ref: "BatterRequest" },

    date: { type: Date, required: true, default: Date.now },

    idlyKg: { type: Number, default: 0 },
    dosaKg: { type: Number, default: 0 },

    // NEW (additive) — Feature: admin-managed product catalog (Level 2).
    // Any other product delivered to this customer, each with a snapshot
    // of its name, unit and both prices at delivery time (same idea as the
    // idly/dosa rate snapshots below), so later price edits or deleting the
    // product never rewrite old amounts or margins.
    extraItems: {
      type: [
        new mongoose.Schema(
          {
            productKey: { type: String, required: true },
            productName: { type: String, trim: true },
            unit: { type: String, trim: true, default: "kg" },
            qty: { type: Number, default: 0 },
            companyRate: { type: Number, default: 0 },
            customerRate: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Snapshot of rates at the moment of delivery (so a later rate change
    // by admin never rewrites the margin history of past deliveries).
    idlyCompanyRate: { type: Number, default: 0 },
    idlyCustomerRate: { type: Number, default: 0 },
    dosaCompanyRate: { type: Number, default: 0 },
    dosaCustomerRate: { type: Number, default: 0 },

    amountCharged: { type: Number, default: 0 }, // what the customer owes for this delivery
    companyCost: { type: Number, default: 0 },   // idlyKg*idlyCompanyRate + dosaKg*dosaCompanyRate
    margin: { type: Number, default: 0 },        // amountCharged - companyCost

    paymentStatus: { type: String, enum: ["paid", "credit", "partial"], default: "paid" },
    amountPaid: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 },

    status: { type: String, enum: ["delivered", "skipped"], default: "delivered" },
    skipReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeliveryRecord", DeliveryRecordSchema);