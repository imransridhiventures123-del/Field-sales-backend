// FILE: src/controllers/entryController.js
// PURPOSE: Backend support for PerformanceLedger.jsx (field-sales-tracking)

const Entry = require("../models/Entry");

// GET /api/entries/my — this employee's ledger entries
exports.getMyEntries = async (req, res) => {
  try {
    const entries = await Entry.find({ employee: req.user._id }).sort({ createdAt: -1 });
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/entries — add a new collection or sale entry
exports.addEntry = async (req, res) => {
  try {
    const { type, amount, productId, qty, note } = req.body;

    if (!["collection", "sale"].includes(type)) {
      return res.status(400).json({ message: "type must be 'collection' or 'sale'" });
    }
    if (type === "collection" && (!amount || amount <= 0)) {
      return res.status(400).json({ message: "A valid amount is required for a collection entry" });
    }
    if (type === "sale" && (!productId || !qty || qty <= 0)) {
      return res.status(400).json({ message: "A product and valid quantity are required for a sale entry" });
    }

    const entry = await Entry.create({
      employee: req.user._id,
      type,
      amount: type === "collection" ? amount : undefined,
      productId: type === "sale" ? productId : undefined,
      qty: type === "sale" ? qty : undefined,
      note,
    });

    res.status(201).json({ entry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/entries/:id — remove an entry (only your own)
exports.deleteEntry = async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    if (entry.employee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await entry.deleteOne();
    res.json({ message: "Entry deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};