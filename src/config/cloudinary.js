const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: { folder: "maavu/profiles", allowed_formats: ["jpg","jpeg","png","webp"], transformation: [{ width:400, height:400, crop:"fill" }] },
});

const visitStorage = new CloudinaryStorage({
  cloudinary,
  params: { folder: "maavu/visits", allowed_formats: ["jpg","jpeg","png","webp"], transformation: [{ width:1024, quality:"auto" }] },
});

const uploadProfile = multer({ storage: profileStorage });
const uploadVisit   = multer({ storage: visitStorage, limits: { files: 5 } });

module.exports = { cloudinary, uploadProfile, uploadVisit };