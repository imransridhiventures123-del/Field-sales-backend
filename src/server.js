require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const morgan    = require("morgan");
const connectDB = require("./config/db");

connectDB();

const app = express();

app.use(cors({
  origin: [
    process.env.CLIENT_URL || "http://localhost:5173",
    process.env.ADMIN_URL  || "http://localhost:5174",
  ],
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