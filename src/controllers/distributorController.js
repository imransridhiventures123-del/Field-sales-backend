// FILE: src/controllers/distributorController.js
// NEW FILE — Feature: Distributors module
// PURPOSE: Everything for the new sidebar tab (All Distributors, Add
// Distributor, Distributors Map) + zones + the distributor's own login
// and per-distributor dashboard data used by the Distributors-PWA-App.
// This file does NOT import or touch User/driverController — the live
// mobile app is completely unaffected.

const Distributor = require("../models/Distributor");
const Zone = require("../models/Zone");
const Customer = require("../models/Customer");
const generateDistributorId = require("../utils/generateDistributorId");
const generateRandomPassword = require("../utils/generateRandomPassword");
const { generateDistributorToken } = require("../utils/generateToken");

/* ══════════════════════════ ZONES (admin) ══════════════════════════ */

// GET /api/distributors/admin/zones
exports.getZones = async (req, res) => {
  try {
    const zones = await Zone.find().sort({ name: 1 });
    res.json({ zones });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/distributors/admin/zones
exports.createZone = async (req, res) => {
  try {
    const { name, city, latitude, longitude, notes } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "name, latitude, longitude are required." });
    }
    const zone = await Zone.create({ name: name.trim(), city, latitude, longitude, notes });
    res.status(201).json({ zone });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/distributors/admin/zones/:id
exports.deleteZone = async (req, res) => {
  try {
    await Zone.findByIdAndDelete(req.params.id);
    res.json({ message: "Zone deleted." });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ═══════════════════════ DISTRIBUTORS (admin) ═══════════════════════ */

// GET /api/distributors/admin  → All Distributors tab
exports.getAllDistributors = async (req, res) => {
  try {
    const distributors = await Distributor.find()
      .populate("zone", "name city latitude longitude")
      .sort({ createdAt: -1 });

    // attach how many customers are currently assigned to each distributor
    const withCounts = await Promise.all(
      distributors.map(async (d) => {
        const customerCount = await Customer.countDocuments({ assignedDistributor: d._id });
        return { ...d.toObject(), customerCount };
      })
    );

    res.json({ distributors: withCounts });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/distributors/admin/:id  → per-distributor dashboard (admin view)
exports.getDistributorById = async (req, res) => {
  try {
    const distributor = await Distributor.findById(req.params.id).populate("zone");
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });

    const customers = await Customer.find({ assignedDistributor: distributor._id }).sort({ shopName: 1 });

    res.json({ distributor, customers });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/distributors/admin  → Add Distributor tab
// CHANGE (real-time workflow) — Login ID is now the distributor's own
// PHONE NUMBER (easy for them to remember), and the password is a real
// randomly-generated one (no more predictable "<id>@123" pattern). Both
// are still returned once in loginCredentials, exactly as before, so the
// admin can copy them and hand them to the distributor.
exports.createDistributor = async (req, res) => {
  try {
    const { name, phone, address, areaCovered, zone, fridgeLatitude, fridgeLongitude, fridgeAddress, password } = req.body;
    if (!name || !phone) return res.status(400).json({ message: "Name and phone are required." });

    const employeeId = phone.trim(); // NEW — login ID is the phone number itself
    const finalPassword = password && password.length >= 6 ? password : generateRandomPassword(8);

    const distributor = await Distributor.create({
      name: name.trim(),
      phone: phone.trim(),
      address: address || "",
      areaCovered: areaCovered || "", // NEW
      zone: zone || undefined,
      fridgeLocation: {
        latitude: fridgeLatitude,
        longitude: fridgeLongitude,
        address: fridgeAddress || "",
      },
      employeeId,
      password: finalPassword,
    });

    res.status(201).json({
      distributor: { ...distributor.toObject(), password: undefined },
      // returned once so the admin can note it down / share with the
      // distributor — never returned again after this (password is
      // select:false everywhere else).
      loginCredentials: { employeeId, password: finalPassword },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone or employee ID already exists." });
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/distributors/admin/:id
exports.updateDistributor = async (req, res) => {
  try {
    const { name, phone, address, areaCovered, zone, fridgeLatitude, fridgeLongitude, fridgeAddress, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    if (areaCovered !== undefined) update.areaCovered = areaCovered;
    if (zone !== undefined) update.zone = zone || null;
    if (isActive !== undefined) update.isActive = isActive;
    if (fridgeLatitude !== undefined) update["fridgeLocation.latitude"] = fridgeLatitude;
    if (fridgeLongitude !== undefined) update["fridgeLocation.longitude"] = fridgeLongitude;
    if (fridgeAddress !== undefined) update["fridgeLocation.address"] = fridgeAddress;

    const distributor = await Distributor.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });
    res.json({ distributor });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/distributors/admin/:id/reset-password
exports.resetDistributorPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ message: "Password min 6 chars." });
    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) return res.status(404).json({ message: "Distributor not found." });
    distributor.password = password;
    await distributor.save();
    res.json({ message: "Password reset.", loginCredentials: { employeeId: distributor.employeeId, password } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/distributors/admin/:id
exports.deleteDistributor = async (req, res) => {
  try {
    await Distributor.findByIdAndDelete(req.params.id);
    // unassign any customers that were pointing at this distributor
    await Customer.updateMany({ assignedDistributor: req.params.id }, { $unset: { assignedDistributor: 1 } });
    res.json({ message: "Distributor deleted." });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/distributors/admin/:id/assign-customer
// Body: { customerId }  — assigns an EXISTING customer (order/lead already
// converted by the sales team, per feature #2/#3) to this distributor so
// the distributor now maintains that customer's daily deliveries.
exports.assignCustomerToDistributor = async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ message: "customerId is required." });

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { assignedDistributor: req.params.id },
      { new: true }
    );
    if (!customer) return res.status(404).json({ message: "Customer not found." });
    res.json({ customer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/distributors/admin/unassign-customer/:customerId
exports.unassignCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.customerId,
      { $unset: { assignedDistributor: 1 } },
      { new: true }
    );
    res.json({ customer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ══════════════════ DISTRIBUTOR-SIDE (Distributors-PWA-App) ══════════════════ */

// POST /api/distributors/auth/login  (public)
exports.distributorLogin = async (req, res) => {
  try {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) return res.status(400).json({ message: "employeeId and password are required." });

    const distributor = await Distributor.findOne({ employeeId: employeeId.trim() })
      .select("+password")
      .populate("zone", "name city");
    if (!distributor) return res.status(401).json({ message: "Invalid employee ID or password" });

    const match = await distributor.matchPassword(password);
    if (!match) return res.status(401).json({ message: "Invalid employee ID or password" });
    if (!distributor.isActive) return res.status(403).json({ message: "This account has been deactivated. Contact admin." });

    res.json({
      token: generateDistributorToken(distributor._id),
      distributor: { ...distributor.toObject(), password: undefined },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/distributors/me  (protectDistributor)
exports.getMyProfile = async (req, res) => {
  const distributor = await Distributor.findById(req.distributor._id).populate("zone");
  res.json({ distributor });
};

// GET /api/distributors/my-customers  (protectDistributor)
// The list of customers this distributor now maintains, per feature #2 —
// "unlog ke pass ab hamlog ke pass heen so current customers ku
// dhedhalingge distributors ke pass".
exports.getMyCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ assignedDistributor: req.distributor._id }).sort({ shopName: 1 });
    res.json({ customers });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// NEW — POST /api/distributors/my-customers  (protectDistributor)
// Feature #4: "customers unne bi add karlija app se bi" — a distributor
// can add a new shop directly from the PWA, not just wait for the admin
// to hand one over. The customer is created and auto-assigned to this
// distributor. Reuses the exact same Customer model the admin dashboard
// already uses — nothing about the Customer schema or the admin's own
// customer screens changes.
exports.createMyCustomer = async (req, res) => {
  try {
    const { shopName, ownerName, phone, address } = req.body;
    if (!shopName || !phone) {
      return res.status(400).json({ message: "Shop name and phone are required." });
    }

    const customer = await Customer.create({
      shopName: shopName.trim(),
      ownerName: ownerName || "",
      phone: phone.trim(),
      address: address || "",
      assignedDistributor: req.distributor._id,
      // NEW — Feature: per-customer custom pricing (ownership rule). This
      // customer was added BY the distributor themselves, so only this
      // distributor may set their pricing later — admin can view only.
      addedByDistributor: true,
    });

    res.status(201).json({ customer });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "A customer with this phone number already exists." });
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/distributors/my-customers/:id/pricing   { items: [{ productKey, customerRatePerKg }] }
// NEW — Feature: per-customer custom pricing (distributor side). Only
// works for a customer that (a) is assigned to THIS distributor and
// (b) was added by a distributor in the first place — a customer the
// admin assigned can only be priced by admin, per the ownership rule.
exports.updateMyCustomerPricing = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "items must be an array of { productKey, customerRatePerKg }." });

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    if (String(customer.assignedDistributor) !== String(req.distributor._id)) {
      return res.status(403).json({ message: "This customer isn't assigned to you." });
    }
    if (!customer.addedByDistributor) {
      return res.status(403).json({ message: "This customer was assigned by admin — only admin can set pricing for them." });
    }

    const cleaned = [];
    for (const it of items) {
      const rate = Number(it.customerRatePerKg);
      if (!it.productKey || !Number.isFinite(rate) || rate < 0) {
        return res.status(400).json({ message: "Each pricing item needs a productKey and a customerRatePerKg of 0 or more." });
      }
      cleaned.push({ productKey: it.productKey, customerRatePerKg: rate });
    }

    customer.customPricing = cleaned;
    await customer.save();
    res.json({ customer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};