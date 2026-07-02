// FILE: src/controllers/adminController.js
// PURPOSE: All admin dashboard API endpoints

const User        = require("../models/User");
const Visit       = require("../models/Visit");
const Admin       = require("../models/Admin");
const Telecaller  = require("../models/Telecaller");
const Location    = require("../models/Location");
const Entry       = require("../models/Entry");
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
// CHANGE: now also returns weeklyDone + totalVisits per employee
// (needed by the real Sales Team cards + Target Management page —
// previously only todayVisits was attached, so those screens had to use dummy data)
exports.getEmployees = async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    // Monday-start of this week (ISO week), safe for Sundays too
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));

    const employees = await User.find({ role: "employee", isActive: true })
      .select("-password");

    // Add today's / this week's / all-time visit counts to each employee
    const withCounts = await Promise.all(employees.map(async (emp) => {
      const [todayVisits, weeklyDone, totalVisits] = await Promise.all([
        Visit.countDocuments({ employee: emp._id, createdAt: { $gte: today, $lt: tomorrow } }),
        Visit.countDocuments({ employee: emp._id, createdAt: { $gte: weekStart } }),
        Visit.countDocuments({ employee: emp._id }),
      ]);
      return { ...emp.toObject(), todayVisits, weeklyDone, totalVisits };
    }));

    res.json({ employees: withCounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET EMPLOYEE BY ID (GET /api/admin/employees/:id) ────────
// CHANGE: now also returns monthlyDone, successRate, and weeklyData
// (Mon→Sun visit counts for the performance chart) so the admin
// Employee Detail page can show real numbers instead of dummy ones.
exports.getEmployeeById = async (req, res) => {
  try {
    const emp = await User.findById(req.params.id).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    // Monday-start of this week (ISO week), safe for Sundays too
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayVisits, weeklyDone, monthlyDone, totalVisits, completedVisits] = await Promise.all([
      Visit.countDocuments({ employee: emp._id, createdAt: { $gte: today, $lt: tomorrow } }),
      Visit.countDocuments({ employee: emp._id, createdAt: { $gte: weekStart } }),
      Visit.countDocuments({ employee: emp._id, createdAt: { $gte: monthStart } }),
      Visit.countDocuments({ employee: emp._id }),
      Visit.countDocuments({ employee: emp._id, status: "Completed" }),
    ]);

    const successRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

    const todayVisitsList = await Visit.find({
      employee: emp._id, createdAt: { $gte: today, $lt: tomorrow }
    }).sort({ createdAt: -1 });

    // Visits per day for this week (Mon..Sun), for the bar chart
    const weekRaw = await Visit.aggregate([
      { $match: { employee: emp._id, createdAt: { $gte: weekStart, $lt: weekEnd } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    ]);
    const weekCountByDate = {};
    weekRaw.forEach(r => { weekCountByDate[r._id] = r.count; });
    const weeklyData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      return weekCountByDate[key] || 0;
    });

    const followupAgg = await Visit.aggregate([
      { $match: { employee: emp._id, createdAt: { $gte: weekStart }, "followUp.status": { $ne: null } } },
      { $group: { _id: "$followUp.status", count: { $sum: 1 } } },
    ]);
    const followupSummary = {};
    followupAgg.forEach(f => { if (f._id) followupSummary[f._id] = f.count; });

    res.json({
      employee: emp,
      stats: {
        todayVisits, weeklyDone, weeklyTarget: emp.weeklyTarget,
        monthlyDone, monthlyTarget: emp.monthlyTarget,
        totalVisits, successRate,
      },
      todayVisitsList,
      weeklyData,
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

// ── RESET EMPLOYEE PASSWORD (PUT /api/admin/employees/:id/password) ──
// Admin sets a new password for the employee. The password is hashed
// automatically by the User model pre-save hook (bcrypt).
// Employee can then login with the new password immediately.
exports.resetEmployeePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    // findById + save so the bcrypt pre-save hook fires
    const emp = await User.findById(req.params.id).select("+password");
    if (!emp) return res.status(404).json({ message: "Employee not found." });
    emp.password = newPassword;
    await emp.save();
    res.json({ message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── UPDATE EMPLOYEE PROFILE (PUT /api/admin/employees/:id/profile) ──
// Admin can update name, mobile, address, salary, aadhaar, pan, dob, age.
// Does NOT touch password or employeeId.
exports.updateEmployeeProfile = async (req, res) => {
  try {
    const allowed = ["name","mobile","address","salary","aadhaar","pan","dob","age","city","pincode","photo"];
    const update  = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const emp = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found." });
    res.json({ employee: emp });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── EMPLOYEE MONTHLY REPORT (GET /api/admin/employees/:id/monthly-report) ──
// Returns daily KG sold, visits, orders, collections for a given month.
// Used by admin to download per-employee monthly PDF report.
exports.getEmployeeMonthlyReport = async (req, res) => {
  try {
    const emp = await User.findById(req.params.id).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // Month param: "2026-06" (default = current month)
    const monthParam = req.query.month || new Date().toISOString().slice(0, 7);
    const [yr, mo]   = monthParam.split("-").map(Number);
    const monthStart = new Date(yr, mo - 1, 1);
    const monthEnd   = new Date(yr, mo, 1);

    // ── 1. All visits this month ──────────────────────────────
    const visits = await Visit.find({
      employee:  emp._id,
      createdAt: { $gte: monthStart, $lt: monthEnd },
    }).sort({ createdAt: 1 });

    // ── 2. All sale entries this month (KG sold) ──────────────
    const saleEntries = await Entry.find({
      employee:  emp._id,
      type:      "sale",
      createdAt: { $gte: monthStart, $lt: monthEnd },
    }).sort({ createdAt: 1 });

    // ── 3. All collection entries this month (₹ received) ─────
    const collectionEntries = await Entry.find({
      employee:  emp._id,
      type:      "collection",
      createdAt: { $gte: monthStart, $lt: monthEnd },
    });

    // ── Build daily breakdown ─────────────────────────────────
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const dailyMap = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${yr}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      dailyMap[key] = { date: key, kgSold: 0, shopsVisited: 0, ordersConfirmed: 0, collection: 0, shopNames: [] };
    }

    // Fill visits per day
    visits.forEach(v => {
      const key = v.createdAt.toISOString().split("T")[0];
      if (!dailyMap[key]) return;
      dailyMap[key].shopsVisited++;
      if (v.followUp?.status === "order_placed") dailyMap[key].ordersConfirmed++;
      dailyMap[key].shopNames.push(v.shopName);
    });

    // Fill KG sold per day
    saleEntries.forEach(e => {
      const key = e.createdAt.toISOString().split("T")[0];
      if (dailyMap[key]) dailyMap[key].kgSold += (e.qty || 0);
    });

    // Fill collections per day
    collectionEntries.forEach(e => {
      const key = e.createdAt.toISOString().split("T")[0];
      if (dailyMap[key]) dailyMap[key].collection += (e.amount || 0);
    });

    // ── Totals ────────────────────────────────────────────────
    const totalKgSold      = saleEntries.reduce((s, e) => s + (e.qty || 0), 0);
    const totalCollection  = collectionEntries.reduce((s, e) => s + (e.amount || 0), 0);
    const totalVisits      = visits.length;
    const totalOrders      = visits.filter(v => v.followUp?.status === "order_placed").length;

    // Daily KG target (from employee profile or default 40 kg)
    const dailyKgTarget   = emp.dailyKgTarget || 40;
    const monthlyKgTarget = emp.monthlyKgTarget || 1400;

    res.json({
      employee:         emp,
      month:            monthParam,
      dailyKgTarget,
      monthlyKgTarget,
      totalKgSold,
      totalCollection,
      totalVisits,
      totalOrders,
      achievementPct:   Math.round((totalKgSold / monthlyKgTarget) * 100),
      daily:            Object.values(dailyMap),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// CHANGE: now also accepts startDate + endDate (a date range) so the
// Reports page can pull a full week or month of visits, not just one day.
// The original single "date" param still works exactly as before.
exports.getAllVisits = async (req, res) => {
  try {
    const { page=1, limit=50, status, fieldType, employeeId, date, startDate, endDate } = req.query;
    const filter = {};
    if (status && status !== "All") filter.status = status;
    if (fieldType && fieldType !== "All") filter.fieldType = fieldType;
    if (employeeId) filter.employee = employeeId;
    if (date) {
      const start = new Date(date); start.setHours(0,0,0,0);
      const end   = new Date(date); end.setDate(end.getDate()+1);
      filter.createdAt = { $gte: start, $lt: end };
    } else if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) { const s = new Date(startDate); s.setHours(0,0,0,0); filter.createdAt.$gte = s; }
      if (endDate)   { const e = new Date(endDate); e.setHours(0,0,0,0); e.setDate(e.getDate()+1); filter.createdAt.$lt = e; }
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
// CHANGE: Auto-expires stale online sessions — employees with no GPS
// ping in the last 10 minutes are marked offline automatically.
// Fixes wrong online count from sessions that closed without calling
// /api/location/offline (app crash, phone off, force-close, etc.).
exports.getLiveLocations = async (req, res) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Mark stale sessions offline in DB so counts stay accurate
    const stale = await Location.find({
      isOnline: true, updatedAt: { $lt: tenMinutesAgo }
    }).select("employee");

    if (stale.length > 0) {
      const staleIds = stale.map((l) => l.employee);
      await Location.updateMany(
        { employee: { $in: staleIds } },
        { isOnline: false }
      );
      await User.updateMany(
        { _id: { $in: staleIds } },
        { isOnline: false, lastSeen: new Date() }
      );
    }

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

// ── GET PROFIT & LOSS (GET /api/admin/profit-loss) ───────────
// PURPOSE: real per-employee P&L for the current month, built from the
// two real ledger sources an employee logs via PerformanceLedger.jsx in
// the PWA app (Entry model) —
//   - salary            : from the employee's own profile
//   - kgSold             : real total quantity (kg) across all Entry docs
//                          (type:"sale") logged this month
//   - collectionAmount   : real ₹ sum of Entry docs (type:"collection")
//                          logged this month
// The frontend lets the admin set an assumed "margin per kg" (since
// per-product margin isn't tracked), but collectionAmount is 100% real
// money already collected — no assumption needed for that part.
exports.getProfitLoss = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [employees, salesAgg, collectionsAgg] = await Promise.all([
      User.find({ role: "employee", isActive: true }).select("-password"),
      Entry.aggregate([
        { $match: { createdAt: { $gte: monthStart }, type: "sale" } },
        { $group: { _id: "$employee", kgSold: { $sum: "$qty" }, saleEntries: { $sum: 1 } } },
      ]),
      Entry.aggregate([
        { $match: { createdAt: { $gte: monthStart }, type: "collection" } },
        { $group: { _id: "$employee", totalAmount: { $sum: "$amount" } } },
      ]),
    ]);

    const salesMap = {};
    salesAgg.forEach((s) => { if (s._id) salesMap[s._id.toString()] = { kgSold: s.kgSold || 0, saleEntries: s.saleEntries || 0 }; });
    const collectionsMap = {};
    collectionsAgg.forEach((c) => { if (c._id) collectionsMap[c._id.toString()] = c.totalAmount; });

    const data = employees.map((emp) => {
      const sale = salesMap[emp._id.toString()] || { kgSold: 0, saleEntries: 0 };
      return {
        _id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        salary: emp.salary || 0,
        kgSold: sale.kgSold,
        saleEntries: sale.saleEntries,
        collectionAmount: collectionsMap[emp._id.toString()] || 0,
      };
    });

    res.json({ employees: data, monthStart: monthStart.toISOString().split("T")[0] });
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