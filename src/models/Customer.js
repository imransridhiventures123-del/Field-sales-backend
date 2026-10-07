// FILE: src/models/Customer.js
// NEW FILE — Feature: "Customers" directory
// Purpose: a running directory of every customer we currently deliver to.
// A Customer record is created automatically the first time a delivery is
// added for a given phone number (see customerController.upsertFromDelivery,
// called from driverController.createDelivery). If the phone number already
// exists, we do NOT create a duplicate — we just update the running totals
// on the existing record (kg delivered, order count, last delivery date).
const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema({
  shopName:        { type: String, required: true, trim: true },
  ownerName:       { type: String, trim: true },
  phone:           { type: String, required: true, trim: true, unique: true, index: true },
  address:         { type: String, trim: true },

  // NEW — exact delivery GPS, kept in sync from Delivery records (see
  // customerController.upsertFromDelivery / fillMissingGps). THIS FIELD
  // WAS MISSING FROM THE SCHEMA — without it, Mongoose silently drops
  // latitude/longitude on every save AND strips it from every API
  // response, even though the controller code was setting it correctly.
  // This is what lets "Assign Delivery" autofill exact GPS on customer
  // select instead of always showing "Not set".
  latitude:        { type: Number },
  longitude:       { type: Number },

  // NEW: optional GSTIN, used when generating a "With GST" invoice for
  // this customer. Left blank for customers who haven't provided one —
  // invoiceService falls back gracefully when this is empty.
  gstin:           { type: String, trim: true, default: "" },

  // NEW — manually entered by the admin (Customer detail page). Used by
  // the Daily Invoice feature so the future WhatsApp automation knows
  // exactly which group a customer's invoice/no-order message goes to.
  // Never auto-derived — admin copies the exact WhatsApp group name.
  whatsappGroupName: { type: String, trim: true, default: "" },

  // Manually set by admin on the Customer detail page. Defaults to
  // "irregular" for every newly-discovered customer. The daily / monthly
  // "kg sold per day" figure on the Customers tab and Sales Reports tab
  // only counts kg from customers tagged "regular".
  tag:             { type: String, enum: ["regular", "irregular"], default: "irregular" },

  // NEW — Feature: Distributors module. When a customer is handed over
  // to a zone distributor (feature #2/#3), this points at that
  // Distributor. Left blank/undefined for every customer who is still
  // served directly — nothing else in the app reads this field, so
  // existing behaviour is 100% unchanged until the admin actually
  // assigns someone from the new "All Distributors" page.
  assignedDistributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor" },

  // NEW — Feature: per-customer pricing. This customer's own price per
  // product. A product that isn't listed here falls back to its normal
  // Products & Rates price. Admin sets it when assigning the customer to a
  // distributor; the distributor can set/change it any time from the
  // Customers tab (whoever saves last wins). Orders, the delivery amount
  // and therefore the Ledger all read from here.
  customPricing: {
    type: [
      new mongoose.Schema(
        { productKey: { type: String, required: true }, customerRatePerKg: { type: Number, required: true, min: 0 } },
        { _id: false }
      ),
    ],
    default: [],
  },

  totalKg:         { type: Number, default: 0 },   // running total across all deliveries
  totalOrders:     { type: Number, default: 0 },
  totalAmount:     { type: Number, default: 0 },

  firstDeliveryDate:{ type: Date },
  lastDeliveryDate: { type: Date },
  lastDriver:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Customer", CustomerSchema);