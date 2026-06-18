// FILE: src/controllers/locationController.js
// PURPOSE: Employee goes Online → sends GPS every 10s → admin sees live map

const User     = require("../models/User");
const Location = require("../models/Location");

// ── GO ONLINE + UPDATE LOCATION (POST /api/location/update) ──
// Called by DashboardPage.jsx when employee is online
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;

    // Upsert — create if not exists, update if exists
    await Location.findOneAndUpdate(
      { employee: req.user._id },
      { latitude, longitude, accuracy, isOnline: true, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    // Also update on User model for quick access
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: true, lastSeen: new Date(),
      lastLatitude: latitude, lastLongitude: longitude, lastAccuracy: accuracy,
      locationUpdatedAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GO OFFLINE (POST /api/location/offline) ──────────────────
exports.goOffline = async (req, res) => {
  try {
    await Location.findOneAndUpdate(
      { employee: req.user._id },
      { isOnline: false, updatedAt: new Date() },
      { upsert: true }
    );

    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false, lastSeen: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};