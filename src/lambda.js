// FILE: src/lambda.js
// NEW FILE — AWS Lambda entry point. Wraps the SAME Express app that
// Render runs (src/server.js) — no route, controller or model is duplicated.
// Lambda handler setting:  src/lambda.handler
const serverless = require("serverless-http");
const mongoose = require("mongoose");
const app = require("./server");

// Binary responses (invoice / order-sheet PDFs, images) must be base64'd by Lambda.
const handle = serverless(app, {
  binary: ["application/pdf", "application/octet-stream", "image/*"],
});

// One DB connection is created per warm container and reused by every request.
let connecting = null;
function connectOnce() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    require("dns").setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); // same as config/db.js
    connecting = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        family: 4,
        maxPoolSize: 5,          // many Lambda containers x pool size must stay under Atlas limits
        bufferCommands: false,   // fail fast instead of hanging if the DB is unreachable
      })
      .then(() => console.log("✅ MongoDB connected (Lambda)"))
      .catch((err) => { connecting = null; throw err; });  // allow retry on the next request
  }
  return connecting;
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false; // return as soon as the response is ready
  const path = event.rawPath || event.path || "";
  try {
    if (path !== "/api/health") await connectOnce();   // health check needs no DB
  } catch (err) {
    console.error("MongoDB error:", err.message);
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Database unavailable. Please try again." }),
    };
  }
  return handle(event, context);
};
