// FILE: src/middleware/auth.js
// PURPOSE: Protect routes — check JWT token before allowing access
// Used in every protected route

const jwt  = require("jsonwebtoken");
const User  = require("../models/User");
const Admin = require("../models/Admin");

// Protect employee routes (PWA)
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return res.status(401).json({ message: "Not authorized, no token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: "User not found" });

    next();
  } catch {
    res.status(401).json({ message: "Token invalid or expired" });
  }
};

// Protect admin routes (Admin Dashboard)
exports.protectAdmin = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return res.status(401).json({ message: "Not authorized" });

    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    req.admin = await Admin.findById(decoded.id);
    if (!req.admin) return res.status(401).json({ message: "Admin not found" });

    next();
  } catch {
    res.status(401).json({ message: "Admin token invalid or expired" });
  }
};