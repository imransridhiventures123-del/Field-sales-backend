// FILE: src/models/Location.js
// PURPOSE: Store employee GPS updates for live map in admin dashboard
// Each time employee is online, we update their location here

const mongoose = require("mongoose");

const LocationSchema = new mongoose.Schema({
  employee:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  latitude:  { type: Number },
  longitude: { type: Number },
  accuracy:  { type: Number },
  isOnline:  { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Location", LocationSchema);