const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { FRONTEND_URL, APP_ID } = require("./config/env");

// SSO Routes (from template)
const ssoAuthRoutes = require("./routes/ssoAuth.routes");
const ssoSyncRoutes = require("./routes/ssoSync.routes");

// Business Routes
const customerRoutes = require("./routes/customer.routes");
const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");
const expenseRoutes = require("./routes/expense.routes");
const accountRoutes = require("./routes/account.routes");
const paymentRoutes = require("./routes/payment.routes");
const settingsRoutes = require("./routes/settings.routes");
const reportRoutes = require("./routes/report.routes");

// Middlewares
const ssoAuthMiddleware = require("./middlewares/ssoAuth.middleware");
const tenantScope = require("./middlewares/tenantScope.middleware");

const app = express();

app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());

// ─── SSO Core Routes ─────────────────────────────────────
app.use("/api/auth", ssoAuthRoutes);
app.use("/api/sso", ssoSyncRoutes);

// ─── Business Routes (protected) ─────────────────────────
// All business routes go through SSO auth + tenant scope
app.use("/api/customers", ssoAuthMiddleware, tenantScope, customerRoutes);
app.use("/api/products", ssoAuthMiddleware, tenantScope, productRoutes);
app.use("/api/orders", ssoAuthMiddleware, tenantScope, orderRoutes);
app.use("/api/expenses", ssoAuthMiddleware, tenantScope, expenseRoutes);
app.use("/api/accounts", ssoAuthMiddleware, tenantScope, accountRoutes);
app.use("/api/payments", ssoAuthMiddleware, tenantScope, paymentRoutes);
app.use("/api/settings", ssoAuthMiddleware, tenantScope, settingsRoutes);
app.use("/api/reports", ssoAuthMiddleware, tenantScope, reportRoutes);

// ─── Health Check ─────────────────────────────────────────
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        app: APP_ID,
        timestamp: new Date().toISOString(),
    });
});

module.exports = app;
