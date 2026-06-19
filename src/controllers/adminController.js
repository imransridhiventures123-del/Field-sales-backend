// FILE: src/controllers/adminController.js
// PURPOSE: All admin dashboard API endpoints

const User        = require("../models/User");
const Visit       = require("../models/Visit");
const Admin       = require("../models/Admin");
const Telecaller  = require("../models/Telecaller");
const Location    = require("../models/Location");
const { generateAdminToken } = require("../utils/generateToken");

// ── ADMIN LOGIN (POST /api/admin/auth/login) ─────────────────
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email }).select("+password");
    if (!admin) return res.status(401).json({ message: "Invalid email or password" });

    const match = await admin.matchPassword(password);
    if (!match) return res.status(401).json({ message: "Invalid email or password" });

    res.json({
      token: generateAdminToken(admin._id),
      admin: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ADMIN ME (GET /api/admin/auth/me) ────────────────────
exports.getAdminMe = async (req, res) => {
  res.json({ admin: req.admin });
};

// ── GET ALL EMPLOYEES (GET /api/admin/employees) ─────────────
exports.getEmployees = async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    const employees = await User.find({ role: "employee", isActive: true })
      .select("-password");

    // Add today's visit count to each employee
    const withCounts = await Promise.all(employees.map(async (emp) => {
      const todayVisits = await Visit.countDocuments({
        employee: emp._id, createdAt: { $gte: today, $lt: tomorrow }
      });
      return { ...emp.toObject(), todayVisits };
    }));

    res.json({ employees: withCounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET EMPLOYEE BY ID (GET /api/admin/employees/:id) ────────
exports.getEmployeeById = async (req, res) => {
  try {
    const emp = await User.findById(req.params.id).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

    const [todayVisits, weeklyDone, totalVisits] = await Promise.all([
      Visit.countDocuments({ employee: emp._id, createdAt: { $gte: today, $lt: tomorrow } }),
      Visit.countDocuments({ employee: emp._id, createdAt: { $gte: weekStart } }),
      Visit.countDocuments({ employee: emp._id }),
    ]);

    const todayVisitsList = await Visit.find({
      employee: emp._id, createdAt: { $gte: today, $lt: tomorrow }
    }).sort({ createdAt: -1 });

    const followupSummary = await Visit.aggregate([
      { $match: { employee: emp._id, createdAt: { $gte: weekStart } } },
      { $group: { _id: "$followUp.status", count: { $sum: 1 } } },
    ]);

    res.json({
      employee: emp,
      stats: { todayVisits, weeklyDone, weeklyTarget: emp.weeklyTarget, totalVisits },
      todayVisitsList,
      followupSummary,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── UPDATE TARGET (PUT /api/admin/employees/:id/target) ───────
exports.updateTarget = async (req, res) => {
  try {
    const { dailyTarget, weeklyTarget, monthlyTarget } = req.body;
    const emp = await User.findByIdAndUpdate(
      req.params.id,
      { dailyTarget, weeklyTarget, monthlyTarget },
      { new: true }
    ).select("-password");
    res.json({ employee: emp });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ALL VISITS (GET /api/admin/visits) ───────────────────
exports.getAllVisits = async (req, res) => {
  try {
    const { page=1, limit=50, status, fieldType, employeeId, date } = req.query;
    const filter = {};
    if (status && status !== "All") filter.status = status;
    if (fieldType && fieldType !== "All") filter.fieldType = fieldType;
    if (employeeId) filter.employee = employeeId;
    if (date) {
      const start = new Date(date); start.setHours(0,0,0,0);
      const end   = new Date(date); end.setDate(end.getDate()+1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const visits = await Visit.find(filter)
      .populate("employee", "name employeeId mobile")
      .sort({ createdAt: -1 })
      .skip((page-1)*limit)
      .limit(Number(limit));

    const total = await Visit.countDocuments(filter);
    res.json({ visits, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET VISIT BY ID (GET /api/admin/visits/:id) ──────────────
exports.getAdminVisitById = async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate("employee", "name employeeId mobile photo");
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    res.json({ visit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ALL FOLLOW-UPS (GET /api/admin/visits/followups) ─────
exports.getFollowUps = async (req, res) => {
  try {
    const today    = new Date().toISOString().split("T")[0];
    const followups = await Visit.find({ "followUp.needed": true })
      .populate("employee", "name employeeId mobile")
      .sort({ "followUp.date": 1 });

    const todayFollowups    = followups.filter(v => v.followUp.date === today);
    const upcomingFollowups = followups.filter(v => v.followUp.date > today);

    res.json({ todayFollowups, upcomingFollowups, total: followups.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ANALYTICS (GET /api/admin/analytics) ─────────────────
exports.getAnalytics = async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekStart = new Date(today); weekStart.setDate(weekStart.getDate()-6);

    const [
      totalEmployees,
      onlineNow,
      todayVisits,
      weeklyVisits,
      totalVisits,
      followupBreakdown,
      fieldTypeBreakdown,
      statusBreakdown,
    ] = await Promise.all([
      User.countDocuments({ role:"employee", isActive:true }),
      User.countDocuments({ isOnline:true }),
      Visit.countDocuments({ createdAt: { $gte: today } }),
      Visit.countDocuments({ createdAt: { $gte: weekStart } }),
      Visit.countDocuments(),
      Visit.aggregate([{ $group: { _id:"$followUp.status", count:{ $sum:1 } } }]),
      Visit.aggregate([{ $group: { _id:"$fieldType",       count:{ $sum:1 } } }]),
      Visit.aggregate([{ $group: { _id:"$status",          count:{ $sum:1 } } }]),
    ]);

    // Visits per day for the last 7 days
    const weeklyData = await Visit.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: { $dateToString: { format:"%Y-%m-%d", date:"$createdAt" } }, count:{ $sum:1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalEmployees, onlineNow, todayVisits, weeklyVisits, totalVisits,
      followupBreakdown, fieldTypeBreakdown, statusBreakdown, weeklyData,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── LIVE LOCATIONS (GET /api/admin/locations/live) ───────────
exports.getLiveLocations = async (req, res) => {
  try {
    const locations = await Location.find({ isOnline: true })
      .populate("employee", "name employeeId mobile photo");
    res.json({ locations });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ALL SHOPS (GET /api/admin/shops) ─────────────────────
exports.getShops = async (req, res) => {
  try {
    const shops = await Visit.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: "$shopCode",
        shopName:    { $first: "$shopName" },
        shopCode:    { $first: "$shopCode" },
        ownerName:   { $first: "$ownerName" },
        mobile:      { $first: "$mobile" },
        address:     { $first: "$address" },
        lastVisit:   { $first: "$createdAt" },
        lastFollowUp:{ $first: "$followUp.status" },
        totalVisits: { $sum: 1 },
      }},
      { $sort: { totalVisits: -1 } },
    ]);
    res.json({ shops });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET TELECALLERS (GET /api/admin/telecallers) ─────────────
exports.getTelecallers = async (req, res) => {
  try {
    const telecallers = await Telecaller.find({ isActive: true });
    res.json({ telecallers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── UPDATE TELECALLER STATUS (PUT /api/admin/telecallers/:id) ─
exports.updateTelecaller = async (req, res) => {
  try {
    const tc = await Telecaller.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ telecaller: tc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createTelecaller = async (req, res) => {
  try {
    const { name, phone, status } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    const existing = await Telecaller.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "A telecaller with this phone number already exists" });
    }

    const avatar = name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const telecaller = await Telecaller.create({
      name,
      phone,
      avatar,
      status: status || "available",
    });

    res.status(201).json({ telecaller });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE TELECALLER (DELETE /api/admin/telecallers/:id) ─────
exports.deleteTelecaller = async (req, res) => {
  try {
    const tc = await Telecaller.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!tc) return res.status(404).json({ message: "Telecaller not found" });
    res.json({ message: "Telecaller removed", telecaller: tc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CREATE ADMIN SEED (POST /api/admin/seed) ─────────────────
// Run once to create the first admin account
exports.seedAdmin = async (req, res) => {
  try {
    const exists = await Admin.findOne({ email: "admin@maavu.com" });
    if (exists) return res.json({ message: "Admin already exists" });

    await Admin.create({
      name: "Super Admin",
      email: "admin@maavu.com",
      password: "admin123",
      role: "superadmin",
    });

    // Also seed telecallers
    await Telecaller.insertMany([
      { name:"Priya R",   phone:"8925864472", avatar:"PR", status:"available" },
      { name:"Divya S",   phone:"9876541002", avatar:"DS", status:"available" },
      { name:"Meena K",   phone:"9876541003", avatar:"MK", status:"busy"      },
      { name:"Lakshmi P", phone:"9876541004", avatar:"LP", status:"available" },
      { name:"Kavitha M", phone:"9876541005", avatar:"KM", status:"unavailable"},
      { name:"Anitha B",  phone:"9876541006", avatar:"AB", status:"available" },
    ]);

    res.json({ message: "Admin and telecallers seeded successfully. You can now login." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};