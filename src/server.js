
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  connectDB();
}

const app = express();

const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const VERCEL_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        const explicitlyAllowed = [
          process.env.CLIENT_URL || "http://localhost:5173",
          process.env.ADMIN_URL || "http://localhost:5174",
        ];

        if (
          explicitlyAllowed.includes(origin) ||
          PRIVATE_LAN_ORIGIN.test(origin) ||
          VERCEL_ORIGIN.test(origin)
        ) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    })
  );
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/visits", require("./routes/visitRoutes"));
app.use("/api/location", require("./routes/locationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/entries", require("./routes/entryRoutes"));
app.use("/api/driver", require("./routes/driverRoutes"));
app.use("/api/invoice", require("./routes/invoiceRoutes"));

app.use("/api/distributors", require("./routes/distributorRoutes"));
app.use("/api/batter-requests", require("./routes/batterRequestRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/deliveries", require("./routes/deliveryRoutes"));
app.use("/api/product-requests", require("./routes/productRequestRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/distributor-bills", require("./routes/distributorBillRoutes"));

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Maavu Backend running",
    time: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  res.status(500).json({
    message: err.message,
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
