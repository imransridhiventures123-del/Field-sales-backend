// FILE: src/routes/visitRoutes.js — Employee visit routes (PWA)
const express  = require("express");
const router   = express.Router();
const {
  createVisit, getMyVisits, getVisitById,
  getTodayVisits, getMyStats, updateStatus, assignTelecaller
} = require("../controllers/visitController");
const { protect }       = require("../middleware/auth");
const { uploadVisit }   = require("../config/cloudinary");

router.post("/",              protect, uploadVisit.array("photos", 5), createVisit);
router.get( "/my",            protect, getMyVisits);
router.get( "/today",         protect, getTodayVisits);
router.get( "/stats",         protect, getMyStats);
router.get( "/:id",           protect, getVisitById);
router.put( "/:id/status",    protect, updateStatus);
router.put( "/:id/telecaller",protect, assignTelecaller);

module.exports = router;