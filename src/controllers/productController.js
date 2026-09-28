// FILE: src/controllers/productController.js
// UPDATED — Feature: admin-managed product catalog (Level 2).
// Admin can now create, edit, deactivate and delete products; the
// distributor app reads the same list. Idly and Dosa ("core" products)
// are seeded automatically and are protected from deletion because the
// fridge-stock tracking, approval modal and margin history are built
// around them.
const Product = require("../models/Product");

const CORE_KEYS = ["idly", "dosa"];

const DEFAULTS = [
  { key: "idly", name: "Idly Batter", description: "Fresh idly batter", unit: "kg", companyRatePerKg: 25, customerRatePerKg: 35, imageUrl: "/assets/products/idly.jpg", sortOrder: 0 },
  { key: "dosa", name: "Dosa Batter", description: "Fresh dosa batter", unit: "kg", companyRatePerKg: 30, customerRatePerKg: 40, imageUrl: "/assets/products/dosa.jpg", sortOrder: 1 },
];

// Self-healing seed: only when the catalog is completely empty.
async function ensureDefaults() {
  const count = await Product.countDocuments();
  if (count === 0) await Product.insertMany(DEFAULTS);
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueKey(name) {
  const base = slugify(name) || "product";
  let key = base;
  let n = 2;
  while (await Product.exists({ key })) {
    key = `${base}-${n++}`;
  }
  return key;
}

function toRate(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// GET /api/products  (protectAdmin OR protectDistributor)
// Returns every product (active and inactive). The distributor app
// filters out inactive ones; the admin page shows all.
exports.getProducts = async (req, res) => {
  try {
    await ensureDefaults();
    const products = await Product.find().sort({ sortOrder: 1, createdAt: 1, key: 1 });
    res.json({ products });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/products/admin  (protectAdmin)
// Body: { name, description, unit, companyRatePerKg, customerRatePerKg, imageUrl }
exports.createProduct = async (req, res) => {
  try {
    const { name, description, unit, companyRatePerKg, customerRatePerKg, imageUrl } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: "Product name is required." });

    const company = toRate(companyRatePerKg ?? 0);
    const customer = toRate(customerRatePerKg);
    if (company === null) return res.status(400).json({ message: "Company price must be a number (0 or more)." });
    if (customer === null) return res.status(400).json({ message: "Customer price is required and must be a number (0 or more)." });

    const top = await Product.findOne().sort({ sortOrder: -1 });
    const product = await Product.create({
      key: await uniqueKey(name),
      name: String(name).trim(),
      description: description || "",
      unit: (unit && String(unit).trim()) || "kg",
      companyRatePerKg: company,
      customerRatePerKg: customer,
      imageUrl: imageUrl || "",
      sortOrder: (top?.sortOrder || 0) + 1,
    });
    res.status(201).json({ product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/products/admin/:key  (protectAdmin)
// Body (all optional): { name, description, unit, companyRatePerKg,
//   customerRatePerKg, imageUrl, isActive, sortOrder }
// The key never changes. Core products (idly/dosa) keep unit "kg".
exports.updateProduct = async (req, res) => {
  try {
    const { name, description, unit, companyRatePerKg, customerRatePerKg, imageUrl, isActive, sortOrder } = req.body;
    const update = {};

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Product name cannot be empty." });
      update.name = String(name).trim();
    }
    if (description !== undefined) update.description = description;
    if (unit !== undefined && !CORE_KEYS.includes(req.params.key)) update.unit = String(unit).trim() || "kg";
    if (companyRatePerKg !== undefined) {
      const v = toRate(companyRatePerKg);
      if (v === null) return res.status(400).json({ message: "Company price must be a number (0 or more)." });
      update.companyRatePerKg = v;
    }
    if (customerRatePerKg !== undefined) {
      const v = toRate(customerRatePerKg);
      if (v === null) return res.status(400).json({ message: "Customer price must be a number (0 or more)." });
      update.customerRatePerKg = v;
    }
    if (imageUrl !== undefined) update.imageUrl = imageUrl;
    if (isActive !== undefined) update.isActive = !!isActive;
    if (sortOrder !== undefined && Number.isFinite(Number(sortOrder))) update.sortOrder = Number(sortOrder);

    const product = await Product.findOneAndUpdate({ key: req.params.key }, update, { new: true, upsert: false });
    if (!product) return res.status(404).json({ message: "Product not found." });
    res.json({ product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/products/admin/:key  (protectAdmin)
// Past requests/deliveries keep their own snapshot of the product name,
// unit and price, so history is unaffected. To just hide a product for a
// while, set isActive false instead of deleting it.
exports.deleteProduct = async (req, res) => {
  try {
    if (CORE_KEYS.includes(req.params.key)) {
      return res.status(400).json({ message: "Idly and Dosa batter are core products and can't be deleted. Turn them off with the Active switch instead." });
    }
    const deleted = await Product.findOneAndDelete({ key: req.params.key });
    if (!deleted) return res.status(404).json({ message: "Product not found." });
    res.json({ message: "Product deleted." });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/products/admin/upload-image  (protectAdmin, after the multer
// middleware in productRoutes.js has stored the file on Cloudinary).
// Returns the hosted URL; the admin page then saves it on the product
// through create/update — so uploading and saving stay two clean steps.
exports.uploadImage = async (req, res) => {
  if (!req.file || !req.file.path) return res.status(400).json({ message: "No image received." });
  res.json({ imageUrl: req.file.path });
};