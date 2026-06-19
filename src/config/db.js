const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Set DNS to Google before connecting
    const dns = require("dns");
    dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;