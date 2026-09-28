// FILE: src/models/Product.js
// UPDATED — Feature: admin-managed product catalog (Level 2).
// PURPOSE: The catalog of everything a distributor can order for a
// customer. Before, only two fixed batters (Idly, Dosa) could exist
// (`key` was locked by an enum). Now the admin can add ANY product —
// name, description, unit, prices and a picture — and edit or remove it
// later. Idly and Dosa stay in the catalog as the two "core" products
// because stock tracking, the approval modal and margin history are
// built around them (they cannot be deleted, only edited/deactivated).
//
// Field names companyRatePerKg / customerRatePerKg are kept EXACTLY as
// before so nothing that already reads them breaks — for a product whose
// `unit` is not "kg" they simply mean "per unit" (per packet, per litre,
// etc.).
const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    // Stable machine key. For new products it is generated from the name
    // (e.g. "Paneer Pack" -> "paneer-pack") by the controller and never
    // changes after creation, even if the name is edited later — carts,
    // requests and deliveries refer to products by this key.
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "kg" }, // kg, packet, litre, piece...

    companyRatePerKg: { type: Number, required: true, default: 0 },  // what the company charges the distributor, per unit
    customerRatePerKg: { type: Number, required: true, default: 0 }, // what the distributor charges the customer, per unit

    imageUrl: { type: String, trim: true, default: "" },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }, // lower shows first on the distributor's product list
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);