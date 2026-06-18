// FILE: src/models/Visit.js
// PURPOSE: One shop visit = one document
// Matches exactly what VisitShopPage + ProveLocationPage + UploadPhotosPage collect

const mongoose = require("mongoose");

const VisitSchema = new mongoose.Schema({
  // Which employee did this visit
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  "User",       // links to User model
    required: true,
  },

  // Shop information (from VisitShopPage.jsx)
  shopName:  { type: String, required: true, trim: true },
  shopCode:  { type: String, trim: true },
  ownerName: { type: String, trim: true },
  mobile:    { type: String, trim: true }, // shop owner's mobile
  fieldType: { type: String, enum: ["Field Sales", "Collection"], required: true },
  address:   { type: String },

  // GPS location (from ProveLocationPage.jsx)
  latitude:      { type: Number },
  longitude:     { type: Number },
  locationAccuracy: { type: Number },

  // Photos (from UploadPhotosPage.jsx — Cloudinary URLs)
  photos: [{
    type:  { type: String }, // "Shop Front", "Product Display", "Additional"
    url:   { type: String }, // Cloudinary URL
    public_id: { type: String }, // Cloudinary public_id (for deletion)
  }],

  // Follow-up (from VisitShopPage.jsx)
  followUp: {
    needed: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["interested","callback","not_interested","busy","order_placed","payment_due"],
    },
    date: { type: String }, // YYYY-MM-DD
  },

  // Visit status (admin can update this)
  status: {
    type:    String,
    enum:    ["Completed", "Pending", "Rejected"],
    default: "Completed",
  },

  // Telecaller assigned (from EndOfDayPage.jsx)
  telecaller: {
    telecallerId: { type: mongoose.Schema.Types.ObjectId, ref: "Telecaller" },
    name:         { type: String },
    phone:        { type: String },
    assignedAt:   { type: Date },
  },

  notes: { type: String },
}, { timestamps: true });

// Index for fast queries by employee and date
VisitSchema.index({ employee: 1, createdAt: -1 });
VisitSchema.index({ "followUp.date": 1 });

module.exports = mongoose.model("Visit", VisitSchema);