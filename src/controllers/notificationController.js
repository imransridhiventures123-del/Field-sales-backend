// FILE: src/controllers/notificationController.js
// NEW FILE — Feature: distributor in-app notifications (PWA bell icon).
const Notification = require("../models/Notification");

// GET /api/notifications  (protectDistributor)
exports.getMine = async (req, res) => {
  try {
    const notifications = await Notification.find({ distributor: req.distributor._id }).sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ distributor: req.distributor._id, isRead: false });
    res.json({ notifications, unreadCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/notifications/unread-count
exports.unreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ distributor: req.distributor._id, isRead: false });
    res.json({ unreadCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ distributor: req.distributor._id, isRead: false }, { $set: { isRead: true } });
    res.json({ unreadCount: 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, distributor: req.distributor._id }, { $set: { isRead: true } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};