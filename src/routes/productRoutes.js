// FILE: src/routes/productRoutes.js
// UPDATED — Feature: admin-managed product catalog (Level 2).
// Mounted at /api/products in server.js (already mounted — no change
// needed there).
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/productController");
const { protectAdmin, protectAdminOrDistributor } = require("../middleware/auth");
const { uploadProductImage } = require("../config/productUpload");

// Readable by both admin (Products page) and distributor (PWA product
// list on the customer page, checkout pricing).
router.get("/", protectAdminOrDistributor, ctrl.getProducts);

// Admin only — image upload. The multer step is wrapped so a bad file
// (too big, wrong type) or missing Cloudinary keys comes back as a clean
// JSON error the admin page can show, instead of a raw server error.
router.post(
  "/admin/upload-image",
  protectAdmin,
  (req, res, next) => {
    uploadProductImage.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ message: `Image upload failed: ${err.message}` });
      next();
    });
  },
  ctrl.uploadImage
);

// Admin only — manage the catalog.
router.post("/admin", protectAdmin, ctrl.createProduct);
router.put("/admin/:key", protectAdmin, ctrl.updateProduct);
router.delete("/admin/:key", protectAdmin, ctrl.deleteProduct);

module.exports = router;