
process.env.AWS_LAMBDA_FUNCTION_NAME = "smoke-test";
process.env.NODE_ENV = "test";

const assert = require("assert");
const { handler } = require("../src/lambda");

const event = (method, path) => ({
  version: "2.0",
  rawPath: path,
  rawQueryString: "",
  headers: {
    host: "x.lambda-url.ap-south-1.on.aws",
  },
  requestContext: {
    http: {
      method,
      path,
      sourceIp: "1.2.3.4",
    },
  },
  isBase64Encoded: false,
});

const context = {
  callbackWaitsForEmptyEventLoop: true,
};

(async () => {
  const response = await handler(
    event("GET", "/api/health"),
    context
  );

  assert.strictEqual(response.statusCode, 200);

  const body = JSON.parse(response.body);

  assert.strictEqual(body.status, "OK");
  assert.strictEqual(body.message, "Maavu Backend running");

  console.log("Lambda smoke test passed");
  process.exit(0);
})().catch((error) => {
  console.error("Lambda smoke test failed:", error);
  process.exit(1);
});
