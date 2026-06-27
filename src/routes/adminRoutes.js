const express = require("express");
const router  = express.Router();
const adminController = require("../controllers/adminController");
const { protectAdmin } = require("../middleware/auth");

router.post("/auth/login",  adminController.adminLogin);
router.get( "/auth/me",     protectAdmin, adminController.getAdminMe);
router.get("/seed",        adminController.seedAdmin);

router.get("/employees",                    protectAdmin, adminController.getEmployees);
router.get("/employees/:id",               protectAdmin, adminController.getEmployeeById);
router.put("/employees/:id/target",        protectAdmin, adminController.updateTarget);
router.put("/employees/:id/password",      protectAdmin, adminController.resetEmployeePassword);
router.put("/employees/:id/profile",       protectAdmin, adminController.updateEmployeeProfile);

router.get("/visits",                 protectAdmin, adminController.getAllVisits);
router.get("/visits/followups",       protectAdmin, adminController.getFollowUps);
router.get("/visits/:id",             protectAdmin, adminController.getAdminVisitById);

router.get("/analytics",              protectAdmin, adminController.getAnalytics);
router.get("/locations/live",         protectAdmin, adminController.getLiveLocations);
router.get("/shops",                  protectAdmin, adminController.getShops);
router.get("/profit-loss",            protectAdmin, adminController.getProfitLoss);

router.get("/telecallers",            protectAdmin, adminController.getTelecallers);
router.post("/telecallers",           protectAdmin, adminController.createTelecaller);
router.put("/telecallers/:id",        protectAdmin, adminController.updateTelecaller);
router.delete("/telecallers/:id",     protectAdmin, adminController.deleteTelecaller);

module.exports = router;