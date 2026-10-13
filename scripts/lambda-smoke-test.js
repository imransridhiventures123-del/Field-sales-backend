// FILE: scripts/lambda-smoke-test.js
// NEW FILE — run by CI (and by you: `npm run test:lambda`). Calls the Lambda
// handler with fake API events — NO database and NO AWS account needed.
process.env.AWS_LAMBDA_FUNCTION_NAME = "smoke-test";
process.env.NODE_ENV = "test";
const assert = require("assert");
const { handler } = require("../src/lambda");

const ev = (method, path, extra = {}) => ({
  version: "2.0", rawPath: path, rawQueryString: "",
  headers: { host: "x.lambda-url.ap-south-1.on.aws", ...(extra.headers || {}) },
  requestContext: { http: { method, path, sourceIp: "1.2.3.4" } },
  isBase64Encoded: false, ...extra,
});
const ctx = { callbackWaitsForEmptyEventLoop: true };

(async () => {
  const ok = await handler(ev("GET", "/api/health"), ctx);
  assert.strictEqual(ok.statusCode, 200);
  assert.strictEqual(JSON.parse(ok.body).status, "OK");

  const cors = await handler(ev("OPTIONS", "/api/health", { headers: {
    origin: "https://field-sales-admin.vercel.app", "access-control-request-method": "GET" } }), ctx);
  assert.ok([200, 204].includes(cors.statusCode), "CORS preflight for Vercel origin");

  console.log("✅ Lambda smoke test passed");
  process.exit(0);
})().catch((e) => { console.error("❌ Lambda smoke test failed:", e); process.exit(1); });
