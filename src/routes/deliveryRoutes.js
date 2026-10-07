// FILE: src/routes/deliveryRoutes.js
// NEW FILE — Feature: real-time distributor workflow.
// Mounted at /api/deliveries in server.js (additive).
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deliveryController");
const { protectDistributor, protectAdmin } = require("../middleware/auth");

// ── Distributor app (Distributors-PWA-App) ──
router.post("/", protectDistributor, ctrl.submitDeliveries);
router.get("/mine", protectDistributor, ctrl.getMyDeliveries);
router.get("/mine/summary", protectDistributor, ctrl.getMySummary);
router.get("/mine/ledger", protectDistributor, ctrl.getMyLedger);
// NEW — manual "Today's Order" from the Customers tab, Mark Complete, cancel
router.post("/orders", protectDistributor, ctrl.createManualOrder);
router.put("/orders/:id/complete", protectDistributor, ctrl.completeOrder);
router.delete("/orders/:id", protectDistributor, ctrl.cancelOrder);
// NEW — customer pays off old credit
router.post("/receipts", protectDistributor, ctrl.receivePayment);

// ── Admin monitoring ──
router.get("/admin", protectAdmin, ctrl.getAdminDeliveries);
router.get("/admin/summary", protectAdmin, ctrl.getAdminSummary);
// NEW — today's shops ordered vs delivered, and the ledger
router.get("/admin/today-status", protectAdmin, ctrl.getAdminTodayStatus);
router.get("/admin/ledger", protectAdmin, ctrl.getAdminLedger);

module.exports = router;