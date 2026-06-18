// FILE: src/models/User.js
// PURPOSE: Employee data structure in MongoDB
// This matches exactly what RegisterPage.jsx collects

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  // Personal info (from RegisterPage Step 1)
  name:       { type: String, required: true, trim: true },
  mobile:     { type: String, required: true, unique: true, trim: true },
  dob:        { type: String },
  age:        { type: Number },
  address:    { type: String },
  city:       { type: String },
  pincode:    { type: String },

  // Identity (from RegisterPage Step 2)
  aadhaar:    { type: String },
  pan:        { type: String },

  // Work info (from RegisterPage Step 3)
  salary:     { type: Number },
  photo:      { type: String }, // Cloudinary URL
  employeeId: { type: String, unique: true },

  // Auth
  password:   { type: String, required: true, select: false },
  // select: false means password never comes back in queries by default

  // Role: "employee" for field staff, "admin" for managers
  role:       { type: String, enum: ["employee", "admin"], default: "employee" },

  // Target set by admin
  dailyTarget:   { type: Number, default: 20 },
  weeklyTarget:  { type: Number, default: 100 },
  monthlyTarget: { type: Number, default: 400 },

  // Online/offline tracking
  isOnline:       { type: Boolean, default: false },
  lastSeen:       { type: Date },
  lastLatitude:   { type: Number },
  lastLongitude:  { type: Number },
  lastAccuracy:   { type: Number },
  locationUpdatedAt: { type: Date },

  isActive: { type: Boolean, default: true },
}, { timestamps: true }); // adds createdAt + updatedAt automatically

// Hash password before saving to DB
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // only hash if changed
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to check password during login
UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", UserSchema);