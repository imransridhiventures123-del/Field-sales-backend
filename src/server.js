// require("dotenv").config();

// const express   = require("express");
// const cors      = require("cors");
// const morgan    = require("morgan");
// const connectDB = require("./config/db");

// connectDB();

// const app = express();

// // CHANGE: CORS now allows any private LAN IP (192.168.x.x, 10.x.x.x,
// // 172.16-31.x.x) automatically, in addition to the explicit CLIENT_URL /
// // ADMIN_URL from .env. This means testing the PWA or Admin Dashboard from
// // a phone on the same WiFi keeps working even after your PC's WiFi IP
// // changes (DHCP) — no more editing .env + restarting just to test on mobile.
// // Production origins (e.g. your real domain) still come from CLIENT_URL /
// // ADMIN_URL exactly as before.
// const PRIVATE_LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// app.use(cors({
//   origin: (origin, callback) => {
//     // No Origin header = same-origin request, curl, Postman, etc. — allow it
//     if (!origin) return callback(null, true);

//     const explicitlyAllowed = [
//       process.env.CLIENT_URL || "http://localhost:5173",
//       process.env.ADMIN_URL  || "http://localhost:5174",
//       // Always allow localhost for local development
//       // These work even when Render has production URLs in env vars
//       "http://localhost:5173",
//       "http://localhost:5174",
//       "http://localhost:5175",
//       "http://localhost:3000",
//     ];

//     if (explicitlyAllowed.includes(origin) || PRIVATE_LAN_ORIGIN.test(origin)) {
//       return callback(null, true);
//     }

//     callback(new Error(`CORS blocked for origin: ${origin}`));
//   },
//   credentials: true,
// }));

// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// if (process.env.NODE_ENV === "development") {
//   app.use(morgan("dev"));
// }

// // ── ROUTES ──
// app.use("/api/auth",     require("./routes/authRoutes"));
// app.use("/api/visits",   require("./routes/visitRoutes"));
// app.use("/api/location", require("./routes/locationRoutes"));
// app.use("/api/admin",    require("./routes/adminRoutes"));
// app.use("/api/entries",  require("./routes/entryRoutes"));
// app.use("/api/driver",   require("./routes/driverRoutes"));
// app.use("/api/invoice",  require("./routes/invoiceRoutes"));

// app.get("/api/health", (req, res) => {
//   res.json({ status: "OK", message: "Maavu Backend running", time: new Date().toISOString() });
// });

// app.use((req, res) => {
//   res.status(404).json({ message: `Route ${req.originalUrl} not found` });
// });

// app.use((err, req, res, next) => {
//   console.error("Error:", err.message);
//   res.status(500).json({ message: err.message });
// });

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });


require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const morgan    = require("morgan");
const connectDB = require("./config/db");

connectDB();

const app = express();

/*
 * ============================================================
 * CORS CONFIGURATION
 * ============================================================
 *
 * Allows:
 * 1. Production CLIENT_URL from .env
 * 2. Production ADMIN_URL from .env
 * 3. Localhost development
 * 4. Private LAN IPs for mobile testing
 * 5. Vercel production + preview deployments
 *
 * IMPORTANT:
 * The Vercel support is required because your Admin Dashboard
 * is deployed on Vercel.
 */

// Private LAN origins
// Examples:
// http://192.168.1.10:5173
// http://10.0.0.5:5174
// http://172.16.0.10:3000
const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Vercel production / preview deployments
//
// Examples:
// https://field-sales-admin-dashboard.vercel.app
// https://field-sales-admin-dashboard-git-main.vercel.app
// https://field-sales-admin-dashboard-xxxx.vercel.app
const VERCEL_ORIGIN =
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

app.use(
  cors({
    origin: (origin, callback) => {

      // React Native / Expo / Postman / curl requests
      // normally don't send an Origin header.
      if (!origin) {
        return callback(null, true);
      }

      // Explicitly allowed production + local origins
      const explicitlyAllowed = [
        process.env.CLIENT_URL || "http://localhost:5173",
        process.env.ADMIN_URL || "http://localhost:5174",

        // Local development
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
      ];

      /*
       * Allow:
       *
       * 1. Explicit production URLs
       * 2. Private LAN URLs
       * 3. Vercel URLs
       */
      if (
        explicitlyAllowed.includes(origin) ||
        PRIVATE_LAN_ORIGIN.test(origin) ||
        VERCEL_ORIGIN.test(origin)
      ) {
        return callback(null, true);
      }

      // Reject unknown origins
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },

    credentials: true,
  })
);

/*
 * ============================================================
 * BODY PARSING
 * ============================================================
 */

app.use(express.json({ limit: "10mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

/*
 * ============================================================
 * LOGGER
 * ============================================================
 */

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/*
 * ============================================================
 * ROUTES
 * ============================================================
 */

// Authentication
app.use(
  "/api/auth",
  require("./routes/authRoutes")
);

// Visits
app.use(
  "/api/visits",
  require("./routes/visitRoutes")
);

// Driver / employee live location
app.use(
  "/api/location",
  require("./routes/locationRoutes")
);

// Admin
app.use(
  "/api/admin",
  require("./routes/adminRoutes")
);

// Entries / orders
app.use(
  "/api/entries",
  require("./routes/entryRoutes")
);

// Driver
app.use(
  "/api/driver",
  require("./routes/driverRoutes")
);

// Invoice - NEW BACKEND FEATURE
app.use(
  "/api/invoice",
  require("./routes/invoiceRoutes")
);

// ════════════════════════════════════════════════════════════
// NEW BELOW — Feature: Distributors module (Admin sidebar "Distributors"
// tab + Distributors-PWA-App). Two brand-new mount points, own auth
// (protectDistributor / DISTRIBUTOR_JWT_SECRET), own models
// (Distributor, Zone, BatterRequest). /api/driver, /api/auth and every
// existing route above are completely untouched — the live Android app
// and its APIs keep working exactly as before.
// ════════════════════════════════════════════════════════════
app.use(
  "/api/distributors",
  require("./routes/distributorRoutes")
);

app.use(
  "/api/batter-requests",
  require("./routes/batterRequestRoutes")
);

// ════════════════════════════════════════════════════════════
// NEW BELOW — Feature: real-time distributor workflow (margin tracking,
// daily deliveries, payment/credit). Two more brand-new mount points,
// same additive pattern as above — nothing existing is touched.
// ════════════════════════════════════════════════════════════
app.use(
  "/api/products",
  require("./routes/productRoutes")
);

app.use(
  "/api/deliveries",
  require("./routes/deliveryRoutes")
);

// ════════════════════════════════════════════════════════════
// NEW — Feature: "Request Product" + distributor notifications.
// Two more brand-new mount points; nothing existing is touched.
// ════════════════════════════════════════════════════════════
app.use(
  "/api/product-requests",
  require("./routes/productRequestRoutes")
);

app.use(
  "/api/notifications",
  require("./routes/notificationRoutes")
);

/*
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Maavu Backend running",
    time: new Date().toISOString(),
  });
});

/*
 * ============================================================
 * 404 HANDLER
 * ============================================================
 */

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`,
  });
});

/*
 * ============================================================
 * ERROR HANDLER
 * ============================================================
 */

app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  res.status(500).json({
    message: err.message,
  });
});

/*
 * ============================================================
 * SERVER
 * ============================================================
 */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );
});