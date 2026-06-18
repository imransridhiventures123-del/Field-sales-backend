// FILE: src/routes/authRoutes.js — Employee auth (PWA)
const express  = require("express");
const router   = express.Router();
const { register, login, getMe, changePassword, uploadPhoto } = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { uploadProfile } = require("../config/cloudinary");

router.post("/register", register);
router.post("/login",    login);
router.get( "/me",       protect, getMe);
router.post("/change-password", protect, changePassword);
router.post("/upload-photo",    protect, uploadProfile.single("photo"), uploadPhoto);

module.exports = router;