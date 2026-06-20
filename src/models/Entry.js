// FILE: src/models/Entry.js
// PURPOSE: One ledger entry (collection received or a product sale) made
// by an employee on PerformanceLedger.jsx in the field-sales-tracking app.

const mongoose = require("mongoose");

const EntrySchema = new mongoose.Schema(
  {
    // Which employee logged this entry
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: { type: String, enum: ["collection", "sale"], required: true },

    // For type "collection"
    amount: { type: Number, min: 0 },

    // For type "sale"
    productId: { type: String, trim: true },
    qty:       { type: Number, min: 0 },

    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Entry", EntrySchema);