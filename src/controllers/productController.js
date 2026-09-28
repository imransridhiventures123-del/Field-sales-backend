// FILE: src/controllers/productController.js
// NEW FILE — Feature: real-time distributor workflow (margin tracking).
// Tiny catalog controller: admin edits the company/customer rate for
// Idly and Dosa batter; the distributor app reads the same list to show
// per-kg rates and estimate margin while building a batter request.
const Product = require("../models/Product");

const DEFAULTS = [
  { key: "idly", name: "Idly Batter", companyRatePerKg: 25, customerRatePerKg: 35, imageUrl: "/assets/products/idly.jpg" },
  { key: "dosa", name: "Dosa Batter", companyRatePerKg: 30, customerRatePerKg: 40, imageUrl: "/assets/products/dosa.jpg" },
];

// Ensures the two products always exist, self-healing on first read so
// no separate seed script is required.
async function ensureDefaults() {
  const count = await Product.countDocuments();
  if (count === 0) await Product.insertMany(DEFAULTS);
}

// GET /api/products  (protectAdmin OR protectDistributor)
exports.getProducts = async (req, res) => {
  try {
    await ensureDefaults();
    const products = await Product.find().sort({ key: 1 });
    res.json({ products });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/products/admin/:key  (protectAdmin)
// Body: { name, companyRatePerKg, customerRatePerKg, isActive }
exports.updateProduct = async (req, res) => {
  try {
    const { name, companyRatePerKg, customerRatePerKg, imageUrl, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (companyRatePerKg !== undefined) update.companyRatePerKg = Number(companyRatePerKg);
    if (customerRatePerKg !== undefined) update.customerRatePerKg = Number(customerRatePerKg);
    if (imageUrl !== undefined) update.imageUrl = imageUrl; // NEW (additive)
    if (isActive !== undefined) update.isActive = isActive;

    const product = await Product.findOneAndUpdate({ key: req.params.key }, update, { new: true, upsert: false });
    if (!product) return res.status(404).json({ message: "Product not found." });
    res.json({ product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};