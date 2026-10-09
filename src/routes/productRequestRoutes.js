// FILE: src/routes/productRequestRoutes.js
// NEW FILE — Feature: "Request Product". Mounted at /api/product-requests.
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/productRequestController");
const { protectDistributor, protectAdmin } = require("../middleware/auth");

// Distributor app
router.post("/", protectDistributor, ctrl.createRequest);
router.get("/mine", protectDistributor, ctrl.getMyRequests);

// Admin — Daily Requirement page
router.get("/admin", protectAdmin, ctrl.getAllRequests);
router.put("/admin/:id/approve", protectAdmin, ctrl.approveRequest);
router.put("/admin/:id/reject", protectAdmin, ctrl.rejectRequest);

module.exports = router;