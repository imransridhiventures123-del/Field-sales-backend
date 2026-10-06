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

  // NEW — Feature: per-customer custom pricing. Ownership rule: whoever
  // brought this customer into the system controls their pricing —
  //   - true  -> the DISTRIBUTOR added this customer themselves (PWA
  //     "Customers" tab -> "+ Add Customer"). Only that distributor may
  //     set pricing for them; admin can view but not edit.
  //   - false (default) -> this customer was created the normal way
  //     (from a Delivery, or by admin) and/or handed to a distributor via
  //     "Assign Customer" on the admin side. Only admin may set pricing;
  //     the distributor can view but not edit.
  addedByDistributor: { type: Boolean, default: false },

  // Per-product price override for THIS customer only. When a product's
  // key is not listed here, the distributor/admin falls back to that
  // product's normal Products & Rates price (Product.customerRatePerKg).
  // This is what makes every customer able to have their own price
  // instead of everyone silently sharing one catalog price — and it's
  // exactly what deliveryController.submitDeliveries now reads from
  // before falling back to the catalog rate, so the Ledger reflects the
  // real, customer-specific amount.
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