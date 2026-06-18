// FILE: src/routes/adminRoutes.js — Admin Dashboard routes
const express = require("express");
const router  = express.Router();
const {
  adminLogin, getAdminMe,
  getEmployees, getEmployeeById, updateTarget,
  getAllVisits, getAdminVisitById, getFollowUps,
  getAnalytics, getLiveLocations,
  getShops, getTelecallers, updateTelecaller,
  seedAdmin,
} = require("../controllers/adminController");
const { protectAdmin } = require("../middleware/auth");

// Auth
router.post("/auth/login", adminLogin);
router.get( "/auth/me",    protectAdmin, getAdminMe);

// Seed (run once)
router.post("/seed", seedAdmin);

// Employees
router.get("/employees",          protectAdmin, getEmployees);
router.get("/employees/:id",      protectAdmin, getEmployeeById);
router.put("/employees/:id/target", protectAdmin, updateTarget);

// Visits
router.get("/visits",            protectAdmin, getAllVisits);
router.get("/visits/followups",  protectAdmin, getFollowUps);
router.get("/visits/:id",        protectAdmin, getAdminVisitById);

// Analytics + Map
router.get("/analytics",         protectAdmin, getAnalytics);
router.get("/locations/live",    protectAdmin, getLiveLocations);

// Shops
router.get("/shops",             protectAdmin, getShops);

// Telecallers
router.get("/telecallers",       protectAdmin, getTelecallers);
router.put("/telecallers/:id",   protectAdmin, updateTelecaller);

module.exports = router;