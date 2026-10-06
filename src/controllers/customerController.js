// FILE: src/controllers/customerController.js
// NEW FILE — Feature 2: "Customers" directory
const Customer = require("../models/Customer");
const Delivery = require("../models/Delivery");

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPER — called from driverController.createDelivery
// whenever the admin adds a delivery in the Deliveries tab.
// Matches on phone number:
//   - phone NOT found  -> create a new Customer (tag defaults "irregular")
//   - phone IS found   -> do NOT create a duplicate row, just add this
//                         delivery's kg/amount onto the existing totals
// This function never throws to the caller's request/response cycle —
// the caller wraps it and only logs failures, so a Customer-tracking
// problem can never break the (mobile-facing-independent) delivery save.
// ─────────────────────────────────────────────────────────────
exports.upsertFromDelivery = async (delivery) => {
  const phone = (delivery.phone || "").trim();
  if (!phone) return null;

  const existing = await Customer.findOne({ phone });

  if (existing) {
    existing.totalKg     += Number(delivery.quantity) || 0;
    existing.totalOrders += 1;
    existing.totalAmount += Number(delivery.totalAmount) || 0;
    existing.lastDeliveryDate = delivery.deliveryDate || new Date();
    existing.lastDriver   = delivery.driver;
    // Keep the shop/owner/address/GPS fresh in case it changed slightly,
    // without touching the tag the admin may have already set.
    if (delivery.shopName)  existing.shopName  = delivery.shopName;
    if (delivery.ownerName) existing.ownerName = delivery.ownerName;
    if (delivery.address)   existing.address   = delivery.address;
    if (delivery.latitude != null)  existing.latitude  = delivery.latitude;
    if (delivery.longitude != null) existing.longitude = delivery.longitude;
    await existing.save();
    return existing;
  }

  return Customer.create({
    shopName:   delivery.shopName,
    ownerName:  delivery.ownerName,
    phone,
    address:    delivery.address,
    latitude:   delivery.latitude,
    longitude:  delivery.longitude,
    tag:        "irregular",
    totalKg:      Number(delivery.quantity) || 0,
    totalOrders:  1,
    totalAmount:  Number(delivery.totalAmount) || 0,
    firstDeliveryDate: delivery.deliveryDate || new Date(),
    lastDeliveryDate:  delivery.deliveryDate || new Date(),
    lastDriver: delivery.driver,
  });
};

// GET /api/admin/customers
// GET /api/admin/customers?q=Sri&limit=8   (NEW — search mode)
//
// Default (no ?q): unchanged — returns the full customer list plus the
// headline stats used at the top of the Customers tab.
//
// Search mode (?q= present): used by the "Assign Delivery" customer
// autocomplete (server-side search, so the whole customer table never has
// to be downloaded to the browser — see Feature 18). Filters by shop name,
// owner name, or phone (case-insensitive), skips the stats calculation
// for speed, and caps results (default 8) since it's for a dropdown, not
// a full listing page.
//
// GPS self-heal: customers created before the latitude/longitude field
// existed on the Customer model never got backfilled unless the one-time
// script was run. Rather than depend on that, every search result missing
// GPS is topped up live from that phone's most recent Delivery record
// (which already has real GPS — confirmed against the deliveries
// collection) and saved back onto the Customer so it's instant next time.
async function fillMissingGps(customers) {
  return Promise.all(customers.map(async (c) => {
    if (c.latitude != null && c.longitude != null) return c;
    const lastGpsDelivery = await Delivery.findOne({
      phone: c.phone,
      latitude: { $ne: null },
      longitude: { $ne: null },
    }).sort({ deliveryDate: -1, createdAt: -1 });
    if (!lastGpsDelivery) return c;
    c.latitude = lastGpsDelivery.latitude;
    c.longitude = lastGpsDelivery.longitude;
    c.save().catch(() => {}); // persist for next time — fire and forget, doesn't block this response
    return c;
  }));
}

exports.getCustomers = async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (q !== undefined) {
      const query = String(q).trim();
      const cap = Math.min(Number(limit) || 8, 20);
      const filter = query
        ? {
            $or: [
              { shopName:  new RegExp(query, "i") },
              { ownerName: new RegExp(query, "i") },
              { phone:     new RegExp(query, "i") },
            ],
          }
        : {};
      let customers = await Customer.find(filter)
        .sort({ lastDeliveryDate: -1 })
        .limit(cap);
      customers = await fillMissingGps(customers);
      return res.json({ customers, stats: null });
    }

    const customers = await Customer.find().sort({ lastDeliveryDate: -1 });

    const regularCustomers = customers.filter(c => c.tag === "regular");
    const regularPhones    = regularCustomers.map(c => c.phone);

    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysRegularDeliveries = regularPhones.length
      ? await Delivery.find({
          phone: { $in: regularPhones },
          deliveryDate: { $gte: today, $lt: tomorrow },
        })
      : [];

    const stats = {
      totalCustomers:   customers.length,
      regularCount:     regularCustomers.length,
      irregularCount:   customers.length - regularCustomers.length,
      todayKgRegular:   todaysRegularDeliveries.reduce((s, d) => s + (d.quantity || 0), 0),
    };

    res.json({ customers, stats });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/admin/customers/:id
// Customer profile + their full delivery history (matched by phone,
// pulled straight from the Delivery collection — no data duplication).
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const deliveries = await Delivery.find({ phone: customer.phone })
      .populate("driver", "name employeeId mobile")
      .sort({ deliveryDate: -1, createdAt: -1 });

    res.json({ customer, deliveries });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/admin/customers/:id/tag   { tag: "regular" | "irregular" }
exports.updateCustomerTag = async (req, res) => {
  try {
    const { tag } = req.body;
    if (!["regular", "irregular"].includes(tag))
      return res.status(400).json({ message: "tag must be 'regular' or 'irregular'." });
    const customer = await Customer.findByIdAndUpdate(req.params.id, { tag }, { new: true });
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ customer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/admin/customers/:id/whatsapp   { whatsappGroupName: "ABC Hotel Orders" }
// NEW — Daily Invoice feature. Admin manually copies the exact WhatsApp
// group name here; the future WhatsApp automation reads it straight back
// from this Customer record (see Daily Invoice status API).
exports.updateWhatsappGroup = async (req, res) => {
  try {
    const { whatsappGroupName } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { whatsappGroupName: (whatsappGroupName || "").trim() },
      { new: true }
    );
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ customer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/admin/customers/:id
exports.deleteCustomer = async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: "Customer removed." });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/admin/customers/:id/pricing   { items: [{ productKey, customerRatePerKg }] }
// NEW — Feature: per-customer custom pricing (admin side). Blocked for a
// customer the DISTRIBUTOR added themselves — per the ownership rule,
// only that distributor may price their own self-added customers.
exports.updateCustomerPricing = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "items must be an array of { productKey, customerRatePerKg }." });

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    if (customer.addedByDistributor) {
      return res.status(403).json({ message: "This customer was added by their distributor — only the distributor can set pricing for them." });
    }

    const cleaned = [];
    for (const it of items) {
      const rate = Number(it.customerRatePerKg);
      if (!it.productKey || !Number.isFinite(rate) || rate < 0) {
        return res.status(400).json({ message: "Each pricing item needs a productKey and a customerRatePerKg of 0 or more." });
      }
      cleaned.push({ productKey: it.productKey, customerRatePerKg: rate });
    }

    customer.customPricing = cleaned;
    await customer.save();
    res.json({ customer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};