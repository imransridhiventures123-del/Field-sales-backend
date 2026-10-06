// FILE: src/routes/distributorRoutes.js
// NEW FILE — Feature: Distributors module
// Mounted at /api/distributors in server.js (additive — does not touch
// /api/driver, which the live mobile app depends on).
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/distributorController");
const { protectDistributor, protectAdmin } = require("../middleware/auth");

// ── Public — Distributors-PWA-App login ──
router.post("/auth/login", ctrl.distributorLogin);

// ── Distributor app (Distributors-PWA-App) ──
router.get("/me", protectDistributor, ctrl.getMyProfile);
router.get("/my-customers", protectDistributor, ctrl.getMyCustomers);
router.post("/my-customers", protectDistributor, ctrl.createMyCustomer);
router.put("/my-customers/:id/pricing", protectDistributor, ctrl.updateMyCustomerPricing);

// ── Admin — Zones (used by "Distributors Map" tab) ──
router.get("/admin/zones", protectAdmin, ctrl.getZones);
router.post("/admin/zones", protectAdmin, ctrl.createZone);
router.delete("/admin/zones/:id", protectAdmin, ctrl.deleteZone);

// ── Admin — Distributors ("All Distributors" / "Add Distributor" tabs) ──
router.get("/admin", protectAdmin, ctrl.getAllDistributors);
router.post("/admin", protectAdmin, ctrl.createDistributor);
router.get("/admin/:id", protectAdmin, ctrl.getDistributorById);
router.put("/admin/:id", protectAdmin, ctrl.updateDistributor);
router.put("/admin/:id/reset-password", protectAdmin, ctrl.resetDistributorPassword);
router.delete("/admin/:id", protectAdmin, ctrl.deleteDistributor);

// ── Admin — assign/unassign a customer to a distributor ──
router.post("/admin/:id/assign-customer", protectAdmin, ctrl.assignCustomerToDistributor);
router.put("/admin/unassign-customer/:customerId", protectAdmin, ctrl.unassignCustomer);

module.exports = router;