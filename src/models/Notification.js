// FILE: src/models/Notification.js
// NEW FILE — Feature: distributor in-app notifications (bell icon on the
// PWA Home page). First use: "Admin approved your request and will send
// it at <time>". Brand-new collection, nothing existing is touched.
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "Distributor", required: true, index: true },
    type: { type: String, enum: ["request_approved", "request_partial", "request_rejected", "info"], default: "info" },
    title: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    productRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ProductRequest" },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", NotificationSchema);