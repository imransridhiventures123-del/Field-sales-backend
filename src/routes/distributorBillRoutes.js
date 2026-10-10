// FILE: src/routes/distributorBillRoutes.js
// NEW FILE — Feature: Distributor bills + ledger. Mounted at /api/distributor-bills.
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/distributorBillController");
const { protectAdmin, protectDistributor } = require("../middleware/auth");

// Admin dashboard
router.get("/admin/summary", protectAdmin, ctrl.adminSummary);
router.get("/admin/distributor/:id", protectAdmin, ctrl.adminDistributorLedger);
router.post("/admin/distributor/:id/payments", protectAdmin, ctrl.adminAddPayment);
router.delete("/admin/payments/:paymentId", protectAdmin, ctrl.adminDeletePayment);

// Distributor app
router.get("/mine/summary", protectDistributor, ctrl.mySummary);
router.get("/mine", protectDistributor, ctrl.myLedger);

module.exports = router;