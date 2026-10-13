// FILE: src/utils/pdfStorage.js
// PURPOSE: Persists generated Daily Invoice PDFs to disk so re-opening the
// Daily Invoices page (or clicking "Generate" again) reuses the same file
// instead of re-minting a new invoice number every time (see STEP 17 —
// idempotency — in the daily-invoice feature notes).
//
// STEP 15 note: this is local-filesystem storage, correct for local dev
// and for a single-instance server with a persistent disk. If this app is
// deployed somewhere with an ephemeral filesystem (e.g. a platform that
// wipes disk on every deploy/restart), swap savePdf/readPdf here for
// object storage (S3, Cloudinary, etc.) — every caller in
// dailyInvoiceService.js only depends on this file's two exports, so the
// swap is contained to this one file.

const fs = require("fs");
const path = require("path");

// LAMBDA: the deployment folder is read-only on AWS Lambda; only /tmp is writable
// (and it is temporary). Everywhere else the path is exactly as before.
const STORAGE_ROOT = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? "/tmp/storage/invoices"
  : path.join(__dirname, "../../storage/invoices");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Saves a PDF under storage/invoices/<businessDate>/<fileName> and returns
// the path relative to STORAGE_ROOT (what gets stored on the DailyInvoice
// record — never an absolute filesystem path).
function savePdf(businessDate, fileName, buffer) {
  const dir = path.join(STORAGE_ROOT, businessDate);
  ensureDir(dir);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return path.relative(STORAGE_ROOT, filePath);
}

// Reads a PDF back by its relative path. Guards against path traversal —
// the resolved path must stay inside STORAGE_ROOT — since this relative
// path ultimately comes from a DB record, not directly from user input,
// but we never trust it blindly (STEP 16 security requirement).
function readPdf(relativePath) {
  if (!relativePath) return null;
  const resolvedRoot = path.resolve(STORAGE_ROOT);
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) return null;
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved);
}

module.exports = { savePdf, readPdf, STORAGE_ROOT };