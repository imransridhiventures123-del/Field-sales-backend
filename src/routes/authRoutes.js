const express  = require("express");
const router   = express.Router();
const authController = require("../controllers/authController");
const { protect }    = require("../middleware/auth");
const { uploadProfile } = require("../config/cloudinary");

router.post("/register",      authController.register);
router.post("/login",         authController.login);
router.get( "/me",            protect, authController.getMe);
router.post("/change-password", protect, authController.changePassword);
router.post("/upload-photo",  protect, uploadProfile.single("photo"), authController.uploadPhoto);

module.exports = router;