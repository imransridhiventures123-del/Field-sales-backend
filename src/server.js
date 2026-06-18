// FILE: src/server.js
// PURPOSE: Main entry point — starts the Express server
// This is the file Node.js runs when you do "npm start"

require("dotenv").config(); // Load .env variables first

const express    = require("express");
const cors       = require("cors");
const morgan     = require("morgan");
const connectDB  = require("./config/db");

// ── CONNECT TO MONGODB ───────────────────────────────────────
connectDB();

const app = express();

// ── MIDDLEWARE ───────────────────────────────────────────────

// Allow requests from React PWA and Admin Dashboard
app.use(cors({
  origin: [
    process.env.CLIENT_URL || "http://localhost:5173", // PWA
    process.env.ADMIN_URL  || "http://localhost:5174", // Admin
  ],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
// 10mb limit needed for base64 photo uploads

app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Log all requests in development (shows method, URL, status, time)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ── ROUTES ───────────────────────────────────────────────────

// Employee routes (used by PWA)
app.use("/api/auth",     require("./routes/authRoutes"));
app.use("/api/visits",   require("./routes/visitRoutes"));
app.use("/api/location", require("./routes/locationRoutes"));

// Admin routes (used by Admin Dashboard)
app.use("/api/admin", require("./routes/adminRoutes"));

// Health check — visit http://localhost:5000/api/health to confirm server is running
app.get("/api/health", (req, res) => {
  res.json({
    status:  "OK",
    message: "Maavu Sales Pro Backend is running",
    time:    new Date().toISOString(),
  });
});

// 404 handler — if route not found
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({ message: "Internal server error", error: err.message });
});

// ── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 PWA connects from:   ${process.env.CLIENT_URL || "http://localhost:5173"}`);
  console.log(`🖥️  Admin connects from: ${process.env.ADMIN_URL  || "http://localhost:5174"}`);
});