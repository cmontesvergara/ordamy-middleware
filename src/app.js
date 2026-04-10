import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { FRONTEND_URL, APP_ID } from "./config/env.js";

// SSO Routes (from template)
import ssoAuthRoutes from "./routes/ssoAuth.routes.js";
import ssoSyncRoutes from "./routes/ssoSync.routes.js";

// Business Routes
import customerRoutes from "./routes/customer.routes.js";
import productRoutes from "./routes/product.routes.js";
import materialRoutes from "./routes/material.routes.js";
import orderRoutes from "./routes/order.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import accountRoutes from "./routes/account.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import reportRoutes from "./routes/report.routes.js";

// Middlewares
import ssoAuthMiddleware from "./middlewares/ssoAuth.middleware.js";
import tenantScope from "./middlewares/tenantScope.middleware.js";

const app = express();

app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());  // Parse cookies from requests

// ─── SSO Core Routes ─────────────────────────────────────
app.use("/api/auth", ssoAuthRoutes);
app.use("/api/sso", ssoSyncRoutes);

// ─── Business Routes (protected) ─────────────────────────
// All business routes go through SSO auth + tenant scope
app.use("/api/customers", ssoAuthMiddleware, tenantScope, customerRoutes);
app.use("/api/products", ssoAuthMiddleware, tenantScope, productRoutes);
app.use("/api/materials", ssoAuthMiddleware, tenantScope, materialRoutes);
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

export default app;
