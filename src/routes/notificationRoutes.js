// FILE: src/routes/notificationRoutes.js
// NEW FILE — Feature: distributor notifications. Mounted at /api/notifications.
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/notificationController");
const { protectDistributor } = require("../middleware/auth");

router.get("/", protectDistributor, ctrl.getMine);
router.get("/unread-count", protectDistributor, ctrl.unreadCount);
router.put("/read-all", protectDistributor, ctrl.markAllRead);
router.put("/:id/read", protectDistributor, ctrl.markRead);

module.exports = router;