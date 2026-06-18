// FILE: src/controllers/authController.js
// OWNER: Imran
// PURPOSE: Handle employee register, login, profile

const User              = require("../models/User");
const { generateToken } = require("../utils/generateToken");
const generateEmployeeId = require("../utils/generateEmployeeId");

// ── REGISTER (POST /api/auth/register) ──────────────────────
// Called by RegisterPage.jsx handleFinish()
exports.register = async (req, res) => {
  try {
    const { name, mobile, dob, age, address, aadhaar, pan, salary, password, photo } = req.body;

    // Check if mobile already registered
    const exists = await User.findOne({ mobile });
    if (exists) return res.status(400).json({ message: "Mobile number already registered" });

    // Auto-generate employee ID
    const employeeId = generateEmployeeId(name, dob);

    const user = await User.create({
      name, mobile, dob, age, address, aadhaar, pan,
      salary: Number(salary),
      password,
      employeeId,
      photo: photo || null, // base64 or Cloudinary URL
      role: "employee",
    });

    res.status(201).json({
      token: generateToken(user._id),
      user: {
        _id:        user._id,
        name:       user.name,
        mobile:     user.mobile,
        employeeId: user.employeeId,
        role:       user.role,
        photo:      user.photo,
        dob:        user.dob,
        age:        user.age,
        address:    user.address,
        salary:     user.salary,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── LOGIN (POST /api/auth/login) ─────────────────────────────
// Called by LoginPage.jsx handleLogin()
exports.login = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password)
      return res.status(400).json({ message: "Mobile and password required" });

    // +select("+password") because we set select:false on the field
    const user = await User.findOne({ mobile }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid mobile number or password" });

    const match = await user.matchPassword(password);
    if (!match) return res.status(401).json({ message: "Invalid mobile number or password" });

    res.json({
      token: generateToken(user._id),
      user: {
        _id:        user._id,
        name:       user.name,
        mobile:     user.mobile,
        employeeId: user.employeeId,
        role:       user.role,
        photo:      user.photo,
        dob:        user.dob,
        age:        user.age,
        address:    user.address,
        salary:     user.salary,
        aadhaar:    user.aadhaar,
        pan:        user.pan,
        joinedAt:   user.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ME (GET /api/auth/me) ────────────────────────────────
// Called on app startup to verify token still valid
exports.getMe = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CHANGE PASSWORD (POST /api/auth/change-password) ─────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");

    const match = await user.matchPassword(currentPassword);
    if (!match) return res.status(400).json({ message: "Current password is incorrect" });

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── UPLOAD PROFILE PHOTO (POST /api/auth/upload-photo) ───────
// Multer + Cloudinary handles the actual upload
// req.file.path = Cloudinary URL
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { photo: req.file.path },
      { new: true }
    );

    res.json({ message: "Photo uploaded", photo: user.photo });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};