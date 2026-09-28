// FILE: src/config/productUpload.js
// NEW FILE — Feature: admin-managed product catalog (Level 2).
// A separate uploader just for product pictures. It only IMPORTS the
// already-configured `cloudinary` client from ./cloudinary.js — it does
// not modify that file, so the profile-photo and visit-photo uploads the
// Android app uses are completely untouched. Product pictures are stored
// in their own Cloudinary folder ("maavu/products"), max 5 MB each.
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const { cloudinary } = require("./cloudinary");

const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "maavu/products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto" }],
  },
});

const uploadProductImage = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

module.exports = { uploadProductImage };