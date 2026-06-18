// FILE: src/models/Admin.js
// PURPOSE: Admin user (separate from field employees)
// Admin logs into the admin dashboard

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const AdminSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role:     { type: String, default: "superadmin" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

AdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

AdminSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("Admin", AdminSchema);