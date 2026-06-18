// FILE: src/controllers/visitController.js
// OWNER: Naveen
// PURPOSE: Create visits, get visit history, upload photos

const Visit      = require("../models/Visit");
const { cloudinary } = require("../config/cloudinary");

// ── SUBMIT VISIT (POST /api/visits) ──────────────────────────
// Called by VisitContext.submitVisit() in PWA
// Receives all 3 steps of data: shop info + GPS + photos
exports.createVisit = async (req, res) => {
  try {
    const {
      shopName, shopCode, ownerName, mobile, fieldType, address,
      latitude, longitude, locationAccuracy,
      followUp, notes, telecaller,
    } = req.body;

    // Handle photos — can be Cloudinary URLs (after upload) or base64
    let photos = [];
    if (req.files && req.files.length > 0) {
      // Files uploaded via multipart/form-data
      photos = req.files.map((file, i) => ({
        type: ["Shop Front", "Product Display", "Additional"][i] || "Additional",
        url:  file.path,           // Cloudinary URL
        public_id: file.filename,  // Cloudinary public_id
      }));
    } else if (req.body.photos) {
      // Base64 photos — upload each to Cloudinary
      const photosData = Array.isArray(req.body.photos) ? req.body.photos : [req.body.photos];
      for (let i = 0; i < photosData.length; i++) {
        if (photosData[i]) {
          const result = await cloudinary.uploader.upload(photosData[i], {
            folder: "maavu/visits",
            transformation: [{ width: 1024, quality: "auto" }],
          });
          photos.push({
            type: ["Shop Front", "Product Display", "Additional"][i] || "Additional",
            url:  result.secure_url,
            public_id: result.public_id,
          });
        }
      }
    }

    const visit = await Visit.create({
      employee: req.user._id,
      shopName, shopCode, ownerName, mobile, fieldType, address,
      latitude:         latitude  ? Number(latitude)  : null,
      longitude:        longitude ? Number(longitude) : null,
      locationAccuracy: locationAccuracy ? Number(locationAccuracy) : null,
      photos,
      followUp: followUp || {},
      notes: notes || "",
      status: "Completed",
      telecaller: telecaller || undefined,
    });

    // Populate employee info before sending back
    await visit.populate("employee", "name employeeId mobile");

    res.status(201).json({ success: true, visit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET MY VISITS (GET /api/visits/my) ───────────────────────
// Called by MyVisitsPage.jsx — shows logged-in employee's visits
exports.getMyVisits = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date } = req.query;

    const filter = { employee: req.user._id };
    if (status && status !== "All") filter.status = status;
    if (date) {
      // Filter visits for a specific date
      const start = new Date(date);
      const end   = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const visits = await Visit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Visit.countDocuments(filter);

    res.json({ visits, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET SINGLE VISIT (GET /api/visits/:id) ───────────────────
// Called by VisitDetailPage.jsx
exports.getVisitById = async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate("employee", "name employeeId mobile photo");

    if (!visit) return res.status(404).json({ message: "Visit not found" });

    // Employee can only see their own visits
    if (visit.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.json({ visit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET TODAY'S VISITS (GET /api/visits/today) ───────────────
// Called by EndOfDayPage.jsx and DashboardPage.jsx
exports.getTodayVisits = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const visits = await Visit.find({
      employee:  req.user._id,
      createdAt: { $gte: today, $lt: tomorrow },
    }).sort({ createdAt: -1 });

    res.json({ visits, total: visits.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET TODAY'S STATS (GET /api/visits/stats) ────────────────
// Called by DashboardPage.jsx for KPI cards
exports.getMyStats = async (req, res) => {
  try {
    const now   = new Date();
    const today = new Date(now.setHours(0,0,0,0));
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    // Start of week (Monday)
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

    const [todayCount, weekCount, totalCount] = await Promise.all([
      Visit.countDocuments({ employee: req.user._id, createdAt: { $gte: today, $lt: tomorrow } }),
      Visit.countDocuments({ employee: req.user._id, createdAt: { $gte: weekStart } }),
      Visit.countDocuments({ employee: req.user._id }),
    ]);

    res.json({
      todayVisits:   todayCount,
      weeklyDone:    weekCount,
      weeklyTarget:  req.user.weeklyTarget  || 100,
      dailyTarget:   req.user.dailyTarget   || 20,
      monthlyTarget: req.user.monthlyTarget || 400,
      totalVisits:   totalCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── UPDATE VISIT STATUS (PUT /api/visits/:id/status) ─────────
// Admin can mark visit Completed/Rejected
exports.updateStatus = async (req, res) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    res.json({ visit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── ASSIGN TELECALLER (PUT /api/visits/:id/assign-telecaller) ─
exports.assignTelecaller = async (req, res) => {
  try {
    const { telecallerId, name, phone } = req.body;
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { telecaller: { telecallerId, name, phone, assignedAt: new Date() } },
      { new: true }
    );
    res.json({ visit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};