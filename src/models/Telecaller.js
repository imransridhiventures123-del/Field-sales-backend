// FILE: src/models/Telecaller.js
// PURPOSE: Telecaller list (shown in TelecallerModal when assigning visits)

const mongoose = require("mongoose");

const TelecallerSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  phone:  { type: String, required: true, unique: true },
  avatar: { type: String }, // initials like "PR"
  status: {
    type:    String,
    enum:    ["available", "busy", "unavailable"],
    default: "available",
  },
  assignedToday: { type: Number, default: 0 },
  totalAssigned: { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Telecaller", TelecallerSchema);