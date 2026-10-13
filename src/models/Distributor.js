// FILE: src/models/Distributor.js
// NEW FILE — Feature: Distributors module
// PURPOSE: A distributor is appointed for a zone in Chennai. Idly/Dosa
// batter that used to be delivered directly to customers now goes to the
// distributor's fridge/godown, and the distributor delivers it onward to
// the customers assigned to them. Each distributor gets:
//   - an employeeId + password (login for the Distributors-PWA-App)
//   - a zone
//   - a fridge/godown location (lat/lng) shown on the Distributors Map
// This is a completely separate collection from User (which is the
// existing driver/employee model used by the LIVE mobile app) — nothing
// here touches User, so the mobile app's API is 100% unaffected.
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const DistributorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: "" },

    // NEW (additive) — Feature: real-time distributor workflow. The area/
    // neighbourhood this distributor covers, captured as free text on the
    // Add Distributor form (separate from the map-picked fridge location
    // below, and separate from "zone" which groups distributors on the
    // Distributors Map).
    areaCovered: { type: String, trim: true, default: "" },

    // Login credentials for the Distributors-PWA-App
    employeeId: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },

    // Zone this distributor is appointed to (Chennai zone-wise split)
    zone: { type: mongoose.Schema.Types.ObjectId, ref: "Zone" },

    // Fridge / godown location where batter is dropped for this
    // distributor — shown as a pin on the Distributors Map page.
    fridgeLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String, trim: true, default: "" },
    },

    // Running stock the admin has approved and physically handed over,
    // reduced as the distributor delivers to customers (optional — a
    // simple running total, not a full ledger).
    currentStockKg: {
      idly: { type: Number, default: 0 },
      dosa: { type: Number, default: 0 },
    },

    // NEW — max credit (₹) the admin allows this distributor to keep with the company.
    // 0 = no credit allowed. Changed from the "Distributor Credits" card in the admin dashboard.
    creditLimit: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DistributorSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

DistributorSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("Distributor", DistributorSchema);