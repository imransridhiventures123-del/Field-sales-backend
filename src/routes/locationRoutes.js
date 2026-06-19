const express = require("express");
const router  = express.Router();
const locationController = require("../controllers/locationController");
const { protect } = require("../middleware/auth");

router.post("/update",  protect, locationController.updateLocation);
router.post("/offline", protect, locationController.goOffline);

module.exports = router;