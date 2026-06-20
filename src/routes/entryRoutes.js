// FILE: src/routes/entryRoutes.js
const express = require("express");
const router  = express.Router();
const entryController = require("../controllers/entryController");
const { protect } = require("../middleware/auth");

router.get(   "/my",  protect, entryController.getMyEntries);
router.post(  "/",    protect, entryController.addEntry);
router.delete("/:id", protect, entryController.deleteEntry);

module.exports = router;