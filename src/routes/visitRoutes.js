const express  = require("express");
const router   = express.Router();
const visitController = require("../controllers/visitController");
const { protect }     = require("../middleware/auth");
const { uploadVisit } = require("../config/cloudinary");

router.post("/",               protect, uploadVisit.array("photos", 5), visitController.createVisit);
router.get( "/my",             protect, visitController.getMyVisits);
router.get( "/today",          protect, visitController.getTodayVisits);
router.get( "/stats",          protect, visitController.getMyStats);
router.get( "/telecallers",    protect, visitController.getTelecallers);
router.get( "/:id",            protect, visitController.getVisitById);
router.put( "/:id/status",     protect, visitController.updateStatus);
router.put( "/:id/followup",   protect, visitController.updateFollowUp);
router.put( "/:id/telecaller", protect, visitController.assignTelecaller);

module.exports = router;