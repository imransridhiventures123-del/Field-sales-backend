const express = require("express");
const router  = express.Router();
const adminController = require("../controllers/adminController");
const { protectAdmin } = require("../middleware/auth");

// ── NEW (additive) ──
// Feature 1: Drivers List (backup driver leads)
// Feature 2: Customers directory
// Feature 3: Sales Reports (pie chart + PDF data)
const driverLeadController = require("../controllers/driverLeadController");
const customerController   = require("../controllers/customerController");
const reportController     = require("../controllers/reportController");
const dailyOrderSheetController = require("../controllers/dailyOrderSheetController");
const dailyInvoiceController = require("../controllers/dailyInvoiceController");

router.post("/auth/login",  adminController.adminLogin);
router.get( "/auth/me",     protectAdmin, adminController.getAdminMe);
router.get("/seed",        adminController.seedAdmin);

router.get("/employees",                    protectAdmin, adminController.getEmployees);
router.get("/employees/:id/monthly-report",  protectAdmin, adminController.getEmployeeMonthlyReport);
router.get("/employees/:id",               protectAdmin, adminController.getEmployeeById);
router.put("/employees/:id/target",        protectAdmin, adminController.updateTarget);
router.put("/employees/:id/password",      protectAdmin, adminController.resetEmployeePassword);
router.put("/employees/:id/profile",       protectAdmin, adminController.updateEmployeeProfile);

router.get("/visits",                 protectAdmin, adminController.getAllVisits);
router.get("/visits/followups",       protectAdmin, adminController.getFollowUps);
router.get("/visits/:id",             protectAdmin, adminController.getAdminVisitById);

router.get("/analytics",              protectAdmin, adminController.getAnalytics);
router.get("/locations/live",         protectAdmin, adminController.getLiveLocations);
router.get("/shops",                  protectAdmin, adminController.getShops);
router.get("/profit-loss",            protectAdmin, adminController.getProfitLoss);

router.get("/telecallers",            protectAdmin, adminController.getTelecallers);
router.post("/telecallers",           protectAdmin, adminController.createTelecaller);
router.put("/telecallers/:id",        protectAdmin, adminController.updateTelecaller);
router.delete("/telecallers/:id",     protectAdmin, adminController.deleteTelecaller);

// ════════════════════════════════════════════════════════════
// NEW ROUTES BELOW — nothing above this line was changed
// ════════════════════════════════════════════════════════════

// ── Feature 1: Drivers List (backup driver leads) ──
router.get("/driver-leads",          protectAdmin, driverLeadController.getAll);
router.post("/driver-leads",         protectAdmin, driverLeadController.create);
router.get("/driver-leads/:id",      protectAdmin, driverLeadController.getOne);
router.put("/driver-leads/:id",      protectAdmin, driverLeadController.update);
router.delete("/driver-leads/:id",   protectAdmin, driverLeadController.remove);

// ── Feature 2: Customers directory ──
router.get("/customers",             protectAdmin, customerController.getCustomers);
router.get("/customers/:id",         protectAdmin, customerController.getCustomerById);
router.put("/customers/:id/tag",     protectAdmin, customerController.updateCustomerTag);
router.put("/customers/:id/whatsapp",protectAdmin, customerController.updateWhatsappGroup);
router.put("/customers/:id/pricing", protectAdmin, customerController.updateCustomerPricing);
router.delete("/customers/:id",      protectAdmin, customerController.deleteCustomer);

// ── Feature 3: Sales Reports (kg trend + pie chart data) ──
router.get("/sales-reports/daily",   protectAdmin, reportController.getDailyReport);
router.get("/sales-reports/monthly", protectAdmin, reportController.getMonthlyReport);

// ── Feature 4: Daily Order Sheet (printable calling sheet) ──
router.get("/daily-order-sheet",     protectAdmin, dailyOrderSheetController.downloadDailyOrderSheet);

// ── Feature 5: Daily Invoice generation (Customer -> WhatsApp Group -> Today's Invoice -> PDF) ──
router.get("/invoices/daily",              protectAdmin, dailyInvoiceController.getDailyStatus);
router.post("/invoices/daily/generate",    protectAdmin, dailyInvoiceController.generateDaily);
router.get("/invoices/daily/:id/download", protectAdmin, dailyInvoiceController.downloadDailyInvoice);

module.exports = router;