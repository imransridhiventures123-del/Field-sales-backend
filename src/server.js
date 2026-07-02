require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const morgan    = require("morgan");
const connectDB = require("./config/db");

connectDB();

const app = express();

// CHANGE: CORS now allows any private LAN IP (192.168.x.x, 10.x.x.x,
// 172.16-31.x.x) automatically, in addition to the explicit CLIENT_URL /
// ADMIN_URL from .env. This means testing the PWA or Admin Dashboard from
// a phone on the same WiFi keeps working even after your PC's WiFi IP
// changes (DHCP) — no more editing .env + restarting just to test on mobile.
// Production origins (e.g. your real domain) still come from CLIENT_URL /
// ADMIN_URL exactly as before.
const PRIVATE_LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header = same-origin request, curl, Postman, etc. — allow it
    if (!origin) return callback(null, true);

    const explicitlyAllowed = [
      process.env.CLIENT_URL || "http://localhost:5173",
      process.env.ADMIN_URL  || "http://localhost:5174",
      // Always allow localhost for local development
      // These work even when Render has production URLs in env vars
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:3000",
    ];

    if (explicitlyAllowed.includes(origin) || PRIVATE_LAN_ORIGIN.test(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ── ROUTES ──
app.use("/api/auth",     require("./routes/authRoutes"));
app.use("/api/visits",   require("./routes/visitRoutes"));
app.use("/api/location", require("./routes/locationRoutes"));
app.use("/api/admin",    require("./routes/adminRoutes"));
app.use("/api/entries",  require("./routes/entryRoutes"));
app.use("/api/driver",   require("./routes/driverRoutes"));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Maavu Backend running", time: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({ message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});